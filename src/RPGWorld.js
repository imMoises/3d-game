/**
 * RPGWorld.js
 *
 * Coordina el "mundo abierto" del modo RPG:
 *   - Suelo extendido + decoración mínima
 *   - Lista de enemigos vivos (spawn continuo, ~5-8 activos)
 *   - Lista de monedas en el suelo
 *   - Resolución de ataques de jugadores → enemigos en un cono frontal
 *
 * Public API:
 *   setPlayers(p1, p2)
 *   update(delta)
 *   setActive(boolean)           // muestra/oculta el mundo (al cambiar de modo)
 *   playerAttack(player, type)   // resuelve un ataque a enemigos
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { Enemy, EnemyType } from './Enemy.js';
import { Coin }             from './Coin.js';

const WORLD_RADIUS         = 60;     // radio "jugable" antes de tope (clamp)
const TARGET_ENEMY_COUNT   = 6;
const SPAWN_INTERVAL_S     = 1.5;    // intentar spawn cada N segundos
const SPAWN_DIST_MIN       = 18;     // distancia mínima al spawnear (que no aparezca pegado)
const SPAWN_DIST_MAX       = 40;
const ATTACK_RANGE_PUNCH   = 4.5;
const ATTACK_RANGE_KICK    = 5.5;
const ATTACK_CONE_DEG      = 110;    // cono frontal del ataque

export class RPGWorld {

  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.coins   = [];
    this._spawnTimer = 0;
    this._players = [];
    this._active  = true;
    this._objectsHidden = false;

    this._BuildEnvironment();
  }

  // ─── Decorado: suelo amplio + algunos cubos decorativos ──────────────────
  _BuildEnvironment() {
    this._group = new THREE.Group();

    // Suelo amplio (verde con un patrón de tablero suave)
    const groundGeom = new THREE.PlaneGeometry(WORLD_RADIUS * 2.4, WORLD_RADIUS * 2.4, 1, 1);
    const groundMat  = new THREE.MeshStandardMaterial({
      color: 0x6a8d4a,
      roughness: 0.9,
      metalness: 0.0,
    });
    this._ground = new THREE.Mesh(groundGeom, groundMat);
    this._ground.rotation.x = -Math.PI / 2;
    this._ground.position.y = 0.001; // sobre el suelo original
    this._ground.receiveShadow = true;
    this._group.add(this._ground);

    // Anillo marcador (límite jugable visual)
    const ringGeom = new THREE.RingGeometry(WORLD_RADIUS - 0.5, WORLD_RADIUS, 64);
    const ringMat  = new THREE.MeshBasicMaterial({
      color: 0xffd54f, side: THREE.DoubleSide, transparent: true, opacity: 0.6,
    });
    this._ring = new THREE.Mesh(ringGeom, ringMat);
    this._ring.rotation.x = -Math.PI / 2;
    this._ring.position.y = 0.02;
    this._group.add(this._ring);

    // Decoración: cubos / piedras dispersas
    const rockMat = new THREE.MeshStandardMaterial({ color: 0x607080, roughness: 0.9 });
    for (let i = 0; i < 24; i++) {
      const r = 6 + Math.random() * (WORLD_RADIUS - 8);
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      const s = 0.8 + Math.random() * 1.6;
      const rock = new THREE.Mesh(new THREE.BoxGeometry(s, s, s), rockMat);
      rock.position.set(x, s / 2, z);
      rock.rotation.y = Math.random() * Math.PI;
      rock.castShadow = true;
      rock.receiveShadow = true;
      this._group.add(rock);
    }

    // Algunos "árboles" simplificados (cilindro marrón + cono verde)
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x6d4c2a, roughness: 0.9 });
    const leafMat  = new THREE.MeshStandardMaterial({ color: 0x2e7d32, roughness: 0.8 });
    for (let i = 0; i < 14; i++) {
      const r = 10 + Math.random() * (WORLD_RADIUS - 12);
      const a = Math.random() * Math.PI * 2;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;

      const tree = new THREE.Group();
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 2.5, 8), trunkMat);
      trunk.position.y = 1.25;
      trunk.castShadow = true;
      const leaves = new THREE.Mesh(new THREE.ConeGeometry(1.6, 3.6, 10), leafMat);
      leaves.position.y = 3.6;
      leaves.castShadow = true;
      tree.add(trunk);
      tree.add(leaves);
      tree.position.set(x, 0, z);
      this._group.add(tree);
    }

    this.scene.add(this._group);
  }

  setPlayers(p1, p2) {
    this._players = [p1, p2].filter(Boolean);
  }

  setActive(active) {
    this._active = active;
    // Mostrar/ocultar todos los objetos del mundo RPG (suelo grande, decorado,
    // enemigos y monedas). Al volver al combate 1v1 desaparecen para no
    // interferir visualmente.
    const visible = active;
    if (this._group) this._group.visible = visible;
    for (const e of this.enemies) if (e.mesh) e.mesh.visible = visible;
    for (const c of this.coins)   if (c.mesh) c.mesh.visible = visible;
    this._objectsHidden = !visible;
  }

  // ─── Spawning ────────────────────────────────────────────────────────────
  _PickEnemyType() {
    const r = Math.random();
    if (r < 0.55) return EnemyType.WEAK;
    if (r < 0.85) return EnemyType.FAST;
    return EnemyType.STRONG;
  }

  _SpawnEnemy() {
    if (this._players.length === 0) return;

    // Punto de origen: jugador aleatorio
    const refPlayer = this._players[Math.floor(Math.random() * this._players.length)];
    const refPos = refPlayer?._model?.position;
    if (!refPos) return;

    // Buscar un punto a distancia válida y dentro del radio jugable
    let x = 0, z = 0;
    for (let tries = 0; tries < 8; tries++) {
      const angle = Math.random() * Math.PI * 2;
      const dist  = SPAWN_DIST_MIN + Math.random() * (SPAWN_DIST_MAX - SPAWN_DIST_MIN);
      x = refPos.x + Math.cos(angle) * dist;
      z = refPos.z + Math.sin(angle) * dist;
      // Mantener dentro del radio del mundo
      if (Math.hypot(x, z) < WORLD_RADIUS - 3) break;
    }
    // Clamp final
    const r = Math.hypot(x, z);
    if (r > WORLD_RADIUS - 3) {
      const k = (WORLD_RADIUS - 3) / r;
      x *= k; z *= k;
    }

    const type = this._PickEnemyType();
    const enemy = new Enemy(this.scene, type, new THREE.Vector3(x, 0, z));

    enemy.on('death', ({ coins, position }) => {
      // Soltar monedas dispersas alrededor
      for (let i = 0; i < coins; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 0.6 + Math.random() * 1.5;
        const cx = position.x + Math.cos(a) * d;
        const cz = position.z + Math.sin(a) * d;
        const coin = new Coin(this.scene, new THREE.Vector3(cx, 0, cz), 1);
        this.coins.push(coin);
      }
      // Marcar para limpiar en el siguiente tick
      enemy._toRemove = true;
    });

    this.enemies.push(enemy);
  }

  // ─── Ataque de un jugador (lo llama Player cuando hace punch/kick) ────────
  /**
   * Resuelve un ataque de un jugador sobre los enemigos que estén dentro
   * de un cono frontal en XZ. Aplica daño y devuelve si conectó al menos
   * un enemigo (para reproducir sonido de impacto).
   *
   * @param {Player} attacker
   * @param {'punch'|'kick'} type
   * @returns {boolean} true si conectó al menos un enemigo
   */
  playerAttack(attacker, type) {
    if (!this._active || !attacker?._model) return false;
    if (this.enemies.length === 0) return false;

    const range = type === 'kick' ? ATTACK_RANGE_KICK : ATTACK_RANGE_PUNCH;
    const damage = type === 'kick'
      ? (attacker.stats?.dmg_kick  ?? 12)
      : (attacker.stats?.dmg_punch ?? 8);
    const halfCone = (ATTACK_CONE_DEG * 0.5) * (Math.PI / 180);

    // Vector "frente" del jugador (en XZ).
    // Los modelos FBX usan la convención de Three.js: lookAt orienta -Z hacia
    // el objetivo, así que la "frente" visible del modelo es su -Z local.
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(attacker._model.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) { fwd.set(0, 0, 1); }
    fwd.normalize();

    let connected = false;
    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const dx = enemy.mesh.position.x - attacker._model.position.x;
      const dz = enemy.mesh.position.z - attacker._model.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist > range) continue;
      const dirX = dx / (dist || 1);
      const dirZ = dz / (dist || 1);
      const dot  = dirX * fwd.x + dirZ * fwd.z;
      // dot = cos(ángulo); aceptamos enemigos en el semiarco frontal
      if (dot < Math.cos(halfCone)) continue;
      // ¡Le pegó!
      enemy.takeDamage(damage, attacker);
      connected = true;
    }
    return connected;
  }

  // ─── Devuelve enemigos vivos (para minimapa) ─────────────────────────────
  getAliveEnemies() {
    return this.enemies.filter(e => !e.isDead);
  }

  // ─── Update ──────────────────────────────────────────────────────────────
  update(delta) {
    if (!this._active) return;

    // Spawn continuo
    this._spawnTimer -= delta;
    if (this._spawnTimer <= 0) {
      this._spawnTimer = SPAWN_INTERVAL_S;
      if (this.enemies.filter(e => !e.isDead).length < TARGET_ENEMY_COUNT) {
        this._SpawnEnemy();
      }
    }

    // Update de enemigos
    for (const e of this.enemies) e.update(delta, this._players);

    // Limpiar enemigos muertos / marcados (ya soltaron monedas)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (e._toRemove) {
        e.dispose();
        this.enemies.splice(i, 1);
      }
    }

    // Update de monedas
    for (const c of this.coins) c.update(delta, this._players);

    // Limpiar monedas recogidas
    for (let i = this.coins.length - 1; i >= 0; i--) {
      if (this.coins[i].collected) this.coins.splice(i, 1);
    }

    // Mantener jugadores dentro del radio
    for (const p of this._players) {
      if (!p?._model) continue;
      const r = Math.hypot(p._model.position.x, p._model.position.z);
      if (r > WORLD_RADIUS - 2) {
        const k = (WORLD_RADIUS - 2) / r;
        p._model.position.x *= k;
        p._model.position.z *= k;
      }
    }
  }

  // ─── Distancia entre los dos jugadores (para decidir si pueden combatir) ──
  playersAreClose(threshold = 5.0) {
    if (this._players.length < 2) return false;
    const a = this._players[0]?._model?.position;
    const b = this._players[1]?._model?.position;
    if (!a || !b) return false;
    return Math.hypot(a.x - b.x, a.z - b.z) <= threshold;
  }

  // ─── Reset completo (al cambiar a combate y volver) ──────────────────────
  clearAll() {
    for (const e of this.enemies) e.dispose();
    for (const c of this.coins)   c.dispose();
    this.enemies = [];
    this.coins   = [];
    this._spawnTimer = 0;
  }
}

export const RPG_WORLD_RADIUS = WORLD_RADIUS;
