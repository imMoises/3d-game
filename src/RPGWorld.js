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
import { Enemy, EnemyType, preloadEnemyAssets } from './Enemy.js';
import { Coin }             from './Coin.js';
import { cloneFBXAsync, preloadAll } from './AssetCache.js';

const WORLD_RADIUS         = 60;     // radio "jugable" antes de tope (clamp)
const TARGET_ENEMY_COUNT   = 6;
const SPAWN_INTERVAL_S     = 1.5;    // intentar spawn cada N segundos
const SPAWN_DIST_MIN       = 18;     // distancia mínima al spawnear (que no aparezca pegado)
const SPAWN_DIST_MAX       = 40;

// Rangos de ataque del jugador a enemigos en RPG (amplios y "permisivos"
// para que conectar combos no sea frustrante).
const ATTACK_RANGE_PUNCH   = 7.0;
const ATTACK_RANGE_KICK    = 8.5;
// Radio "de contacto": cualquier enemigo dentro de él recibe daño SIEMPRE,
// sin importar el cono frontal (resuelve los casos donde el jugador rotó
// un poquito tarde y el cono falla por unos grados).
const ATTACK_TOUCH_RADIUS  = 3.2;
// Cono frontal: 180° → semicírculo entero por delante del jugador.
const ATTACK_CONE_DEG      = 180;

// ─── Catálogo de decoración ─────────────────────────────────────────────────
// path → escala base, yOffset opcional, peso de aparición
const DECOR_TREES = [
  { path: 'assets/entorno/obj/Tree/CommonTree_3.fbx',                scale: 0.020 },
  { path: 'assets/entorno/obj/Tree-YWjGDJ9F7g/CommonTree_4.fbx',     scale: 0.020 },
  { path: 'assets/entorno/obj/Tree-aVOxaHRPWe/CommonTree_2.fbx',     scale: 0.020 },
  { path: 'assets/entorno/obj/Tree-qZtx0AHhcy/CommonTree_1.fbx',     scale: 0.020 },
  { path: 'assets/entorno/obj/Tree-t9KbsfYdXz/CommonTree_5.fbx',     scale: 0.020 },
  { path: 'assets/entorno/obj/Pine/Pine_1.fbx',                      scale: 0.020 },
  { path: 'assets/entorno/obj/Pine-699sFuLCN2/Pine_3.fbx',           scale: 0.020 },
  { path: 'assets/entorno/obj/Pine-Zt62gceKXZ/Pine_2.fbx',           scale: 0.020 },
];
const DECOR_GRASS = [
  { path: 'assets/entorno/obj/Grass/Grass_Common_Short.fbx',         scale: 0.025 },
  { path: 'assets/entorno/obj/Grass Wispy/Grass_Wispy_Short.fbx',    scale: 0.025 },
  { path: 'assets/entorno/obj/Grass Wispy/Grass_Wispy_Tall.fbx',     scale: 0.025 },
  { path: 'assets/entorno/obj/Tall Grass/Grass_Common_Tall.fbx',     scale: 0.025 },
];
const DECOR_BUSHES = [
  { path: 'assets/entorno/obj/Bush/Bush_Common.fbx',                 scale: 0.022 },
  { path: 'assets/entorno/obj/Bush with Flowers/Bush_Common_Flowers.fbx', scale: 0.022 },
  { path: 'assets/entorno/obj/Fern/Fern_1.fbx',                      scale: 0.022 },
];
const DECOR_ROCKS = [
  { path: 'assets/entorno/obj/Rock Medium/Rock_Medium_1.fbx',        scale: 0.022 },
  { path: 'assets/entorno/obj/Rock Medium/Rock_Medium_2.fbx',        scale: 0.022 },
  { path: 'assets/entorno/obj/Rock Medium-JQxF95498B/Rock_Medium_3.fbx', scale: 0.022 },
  { path: 'assets/entorno/obj/Pebble Round/Pebble_Round_5.fbx',      scale: 0.025 },
  { path: 'assets/entorno/obj/Pebble Square/Pebble_Square_1.fbx',    scale: 0.025 },
];
const DECOR_FLOWERS = [
  { path: 'assets/entorno/obj/Flower Group/Flower_3_Group.fbx',      scale: 0.025 },
  { path: 'assets/entorno/obj/Flower Group/Flower_4_Group.fbx',      scale: 0.025 },
  { path: 'assets/entorno/obj/Mushroom/Mushroom_Common.fbx',         scale: 0.025 },
  { path: 'assets/entorno/obj/Mushroom Laetiporus/Mushroom_Laetiporus.fbx', scale: 0.025 },
  { path: 'assets/entorno/obj/Clover/Clover_1.fbx',                  scale: 0.025 },
];

// Radio de colisión base por categoría de decoración. Se escala con el
// scale real aplicado a la malla (incluye jitter), así un árbol pequeño
// tiene hitbox más chica que uno grande. Hierba y flores = 0 (no chocan).
const COLLISION_RADIUS_TREE  = 1.10;
const COLLISION_RADIUS_BUSH  = 0.70;
const COLLISION_RADIUS_ROCK  = 0.85;
const COLLISION_RADIUS_GRASS = 0;
const COLLISION_RADIUS_FLOWER = 0;

// Radio del cuerpo del jugador en colisión con la decoración (RPG).
const PLAYER_COLLISION_RADIUS = 0.7;

export class RPGWorld {

  constructor(scene) {
    this.scene = scene;
    this.enemies = [];
    this.coins   = [];
    this._spawnTimer = 0;
    this._players = [];
    this._active  = true;
    this._objectsHidden = false;

    // Obstáculos sólidos del mapa: [{ x, z, radius }]
    // Se llenan dinámicamente conforme se cargan los modelos FBX.
    this._obstacles = [];

    this._BuildEnvironment();
  }

  // ─── Decorado del mundo ──────────────────────────────────────────────────
  // Suelo amplio + asset cards (árboles, hierba, arbustos, rocas, flores)
  // cargados como FBX desde la carpeta entorno.
  _BuildEnvironment() {
    this._group = new THREE.Group();

    // Suelo amplio
    const groundGeom = new THREE.PlaneGeometry(WORLD_RADIUS * 2.4, WORLD_RADIUS * 2.4, 1, 1);
    const groundMat  = new THREE.MeshStandardMaterial({
      color: 0x6a8d4a, roughness: 0.95, metalness: 0.0,
    });
    this._ground = new THREE.Mesh(groundGeom, groundMat);
    this._ground.rotation.x = -Math.PI / 2;
    this._ground.position.y = 0.001;
    this._ground.receiveShadow = true;
    this._group.add(this._ground);

    // Anillo marcador (límite jugable visual)
    const ringGeom = new THREE.RingGeometry(WORLD_RADIUS - 0.5, WORLD_RADIUS, 64);
    const ringMat  = new THREE.MeshBasicMaterial({
      color: 0xffd54f, side: THREE.DoubleSide, transparent: true, opacity: 0.55,
    });
    this._ring = new THREE.Mesh(ringGeom, ringMat);
    this._ring.rotation.x = -Math.PI / 2;
    this._ring.position.y = 0.02;
    this._group.add(this._ring);

    this.scene.add(this._group);

    // Empezar precarga (no bloqueante) de los enemigos también
    preloadEnemyAssets();

    // Sembrar decoración con assets reales en cuanto carguen
    this._PopulateDecor();
  }

  // Coloca decoración usando un muestreo por celdas para que quede repartida
  // por todo el mapa en lugar de aglomerarse al azar. Pre-genera puntos
  // candidatos en una grilla, los baraja, y reparte tipo a tipo.
  async _PopulateDecor() {
    // Pre-cargar solo un subset representativo (no todos los archivos) para
    // ahorrar memoria y tiempo de parseo. Tomamos hasta 2 variantes por set.
    const pickFew = (set, max) => set.slice(0, max);
    const trees   = pickFew(DECOR_TREES,   3);
    const grasses = pickFew(DECOR_GRASS,   2);
    const bushes  = pickFew(DECOR_BUSHES,  2);
    const rocks   = pickFew(DECOR_ROCKS,   2);
    const flowers = pickFew(DECOR_FLOWERS, 2);

    const allPaths = [...trees, ...grasses, ...bushes, ...rocks, ...flowers]
      .map((d) => d.path);
    await preloadAll(allPaths);

    // ── Generar puntos candidatos en grilla con jitter ──
    // Esto garantiza que la decoración cubre TODO el círculo del mundo en
    // vez de quedar pegada a un sector aleatorio.
    const CELL = 8;                                    // tamaño de celda
    const candidates = [];
    for (let x = -WORLD_RADIUS; x <= WORLD_RADIUS; x += CELL) {
      for (let z = -WORLD_RADIUS; z <= WORLD_RADIUS; z += CELL) {
        const jx = (Math.random() - 0.5) * CELL * 0.8;
        const jz = (Math.random() - 0.5) * CELL * 0.8;
        const px = x + jx;
        const pz = z + jz;
        const r  = Math.hypot(px, pz);
        // Excluir centro (donde spawnan los jugadores) y borde
        if (r < 5 || r > WORLD_RADIUS - 3) continue;
        candidates.push({ x: px, z: pz });
      }
    }
    // Barajar para que cada categoría tome un subconjunto aleatorio
    for (let i = candidates.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [candidates[i], candidates[j]] = [candidates[j], candidates[i]];
    }

    let cursor = 0;
    const takePoints = (n) => {
      const slice = candidates.slice(cursor, cursor + n);
      cursor += n;
      return slice;
    };

    const placeAt = async (set, points, scaleJitter = 0.25, collisionBase = 0) => {
      for (const pt of points) {
        const def = set[(Math.random() * set.length) | 0];
        try {
          const { object } = await cloneFBXAsync(def.path, { skinned: false });
          object.position.set(pt.x, 0, pt.z);
          const s = def.scale * (1 - scaleJitter + Math.random() * scaleJitter * 2);
          object.scale.setScalar(s);
          object.rotation.y = Math.random() * Math.PI * 2;
          object.traverse((c) => {
            if (c.isMesh) {
              c.castShadow = true;
              c.receiveShadow = true;
            }
          });
          this._group.add(object);

          // Registrar como obstáculo si la categoría es sólida.
          // Escalamos el radio según el factor de escala REAL aplicado
          // a la malla (def.scale es la escala "promedio" de la categoría).
          if (collisionBase > 0 && def.scale > 0) {
            const scaledRadius = collisionBase * (s / def.scale);
            this._obstacles.push({ x: pt.x, z: pt.z, radius: scaledRadius });
          }
        } catch (_) { /* asset faltante: ignorar */ }
      }
    };

    // Cantidades AJUSTADAS A LA BAJA para no sobrecargar el render.
    // Total: ~50 instancias (antes ~183). Repartidas por toda la grilla.
    // Solo árboles, arbustos y rocas tienen colisión. Hierba/flores no.
    await Promise.all([
      placeAt(trees,   takePoints(14), 0.30, COLLISION_RADIUS_TREE),
      placeAt(grasses, takePoints(16), 0.40, COLLISION_RADIUS_GRASS),
      placeAt(bushes,  takePoints(8),  0.25, COLLISION_RADIUS_BUSH),
      placeAt(rocks,   takePoints(6),  0.30, COLLISION_RADIUS_ROCK),
      placeAt(flowers, takePoints(10), 0.30, COLLISION_RADIUS_FLOWER),
    ]);
  }

  // ─── Colisiones con la decoración ────────────────────────────────────────
  /**
   * Empuja al jugador fuera de cualquier obstáculo sólido en el que se haya
   * "metido" tras moverse. Resolución radial XZ (cilindros verticales).
   *
   * @param {THREE.Object3D} model         El modelo del jugador (se modifica .position)
   * @param {number}        [playerRadius] Radio del cuerpo del jugador
   */
  resolveCollisions(model, playerRadius = PLAYER_COLLISION_RADIUS) {
    if (!this._active || !model) return;
    if (this._obstacles.length === 0) return;

    // Una pasada es suficiente porque los obstáculos están separados.
    // Leemos model.position fresh en cada iteración para que las colisiones
    // cascadeen si el jugador toca dos obstáculos casi contiguos.
    for (const obs of this._obstacles) {
      const dx = model.position.x - obs.x;
      const dz = model.position.z - obs.z;
      const dist = Math.hypot(dx, dz);
      const minDist = obs.radius + playerRadius;

      if (dist >= minDist) continue;

      if (dist < 1e-4) {
        // Estamos exactamente en el centro del obstáculo → empuje arbitrario.
        model.position.x += minDist;
      } else {
        const push = (minDist - dist) / dist;
        model.position.x += dx * push;
        model.position.z += dz * push;
      }
    }
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
  // Distribución: la mayoría débiles (Enemy_ExtraSmall), algunos medios
  // (Enemy_Large) y pocos fuertes (Skeleton).
  _PickEnemyType() {
    const r = Math.random();
    if (r < 0.60) return EnemyType.WEAK;
    if (r < 0.88) return EnemyType.MEDIUM;
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
      // Distribuir el valor total entre un máximo de 6 monedas visuales
      // para no spawnar mallas de más cuando un enemigo suelta muchas.
      const MAX_VISUAL_COINS = 6;
      const drops = Math.min(coins, MAX_VISUAL_COINS);
      const base  = Math.floor(coins / drops);
      const extra = coins - base * drops; // remainder
      for (let i = 0; i < drops; i++) {
        const a = Math.random() * Math.PI * 2;
        const d = 0.6 + Math.random() * 1.5;
        const cx = position.x + Math.cos(a) * d;
        const cz = position.z + Math.sin(a) * d;
        const value = base + (i < extra ? 1 : 0);
        const coin = new Coin(this.scene, new THREE.Vector3(cx, 0, cz), value);
        this.coins.push(coin);
      }
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

    // Vector "frente" del jugador en XZ. Convención Three.js: -Z local
    // = hacia donde se está mirando (después de lookAt).
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(attacker._model.quaternion);
    fwd.y = 0;
    if (fwd.lengthSq() < 1e-6) { fwd.set(0, 0, 1); }
    fwd.normalize();

    const cosHalf = Math.cos(halfCone);
    let connected = false;
    let nearestForwardEnemy = null;
    let nearestForwardDist  = Infinity;

    for (const enemy of this.enemies) {
      if (enemy.isDead) continue;
      const dx = enemy.mesh.position.x - attacker._model.position.x;
      const dz = enemy.mesh.position.z - attacker._model.position.z;
      const dist = Math.hypot(dx, dz);

      // 1) Fuera de rango total → ignorar
      if (dist > range) continue;

      // 2) Enemigo "tocando" al jugador → daño SIEMPRE, sin cono.
      //    Esto cubre los casos en que el cono falla por unos grados porque
      //    el jugador todavía estaba rotando o el enemigo se movió.
      if (dist <= ATTACK_TOUCH_RADIUS) {
        enemy.takeDamage(damage, attacker);
        connected = true;
        continue;
      }

      // 3) Enemigo a media distancia → revisar cono frontal (180°).
      const inv  = 1 / (dist || 1);
      const dirX = dx * inv;
      const dirZ = dz * inv;
      const dot  = dirX * fwd.x + dirZ * fwd.z;
      if (dot < cosHalf) {
        // Falla cono. Lo guardamos como candidato a "auto-asistencia"
        // si está casi de frente (dot > 0, < 90°), por si NO conectamos
        // con nadie y estamos claramente intentando golpear.
        if (dot > 0 && dist < nearestForwardDist) {
          nearestForwardDist  = dist;
          nearestForwardEnemy = enemy;
        }
        continue;
      }
      enemy.takeDamage(damage, attacker);
      connected = true;
    }

    // 4) Aim-assist: si NO conectamos con nadie pero hay un enemigo en rango
    //    "casi de frente" (dot > 0, ángulo < 90° de la dirección del jugador),
    //    cuenta como golpe. Quita la frustración cuando el cono falla por
    //    pocos grados. Hacemos snap a la rotación para coherencia visual.
    if (!connected && nearestForwardEnemy) {
      nearestForwardEnemy.takeDamage(damage, attacker);
      connected = true;
      // Mirar al enemigo asistido (pequeño feedback visual)
      const e = nearestForwardEnemy;
      if (attacker._model && e.mesh) {
        attacker._model.lookAt(
          e.mesh.position.x,
          attacker._model.position.y,
          e.mesh.position.z,
        );
      }
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
