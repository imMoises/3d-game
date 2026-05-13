/**
 * Enemy.js
 *
 * Enemigos del mundo RPG. Tres tipos: WEAK, STRONG, FAST.
 * Modelo: geometría simple (sin FBX) para evitar dependencias de nuevos assets.
 *
 *  - WEAK   → slime verde, lento, poco HP, dropea 1 moneda
 *  - STRONG → bloque rojo, lento, mucho HP y daño, dropea 4 monedas
 *  - FAST   → cono amarillo, rápido y frágil, dropea 2 monedas
 *
 * AI: persigue al jugador con HP > 0 más cercano. Al contacto, ataca con
 * cooldown. Muere → emite 'death' con la cantidad de monedas a soltar.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

export const EnemyType = {
  WEAK:   'weak',
  STRONG: 'strong',
  FAST:   'fast',
};

const STATS = {
  weak:   { hp: 20,  dmg: 4,  speed: 3.5, coins: 1, color: 0x44dd66, scale: 1.0, attackCooldown: 1.2, range: 2.2 },
  strong: { hp: 60,  dmg: 12, speed: 2.2, coins: 4, color: 0xdd3333, scale: 1.6, attackCooldown: 1.8, range: 2.8 },
  fast:   { hp: 12,  dmg: 6,  speed: 7.0, coins: 2, color: 0xffcc22, scale: 0.9, attackCooldown: 0.7, range: 1.8 },
};

export class Enemy {

  constructor(scene, type, position) {
    this.scene = scene;
    this.type  = type;
    const s    = STATS[type];

    this.hp              = s.hp;
    this.maxHp           = s.hp;
    this.dmg             = s.dmg;
    this.speed           = s.speed;
    this.coinDrop        = s.coins;
    this.range           = s.range;
    this.attackCooldown  = s.attackCooldown;
    this._attackTimer    = 0;
    this.isDead          = false;
    this._hitFlash       = 0;

    this._listeners = {};

    this._BuildMesh(s, position);
  }

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }
  _emit(event, data = {}) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach((fn) => fn(data));
  }

  _BuildMesh(s, position) {
    const group = new THREE.Group();

    let bodyGeom;
    if (this.type === EnemyType.WEAK) {
      bodyGeom = new THREE.SphereGeometry(1.0, 16, 12);
    } else if (this.type === EnemyType.STRONG) {
      bodyGeom = new THREE.BoxGeometry(1.5, 2.2, 1.5);
    } else {
      bodyGeom = new THREE.ConeGeometry(0.8, 1.8, 12);
    }

    const mat = new THREE.MeshStandardMaterial({
      color:     s.color,
      roughness: 0.6,
      metalness: 0.1,
    });
    const body = new THREE.Mesh(bodyGeom, mat);
    body.castShadow    = true;
    body.receiveShadow = true;
    body.position.y    = this.type === EnemyType.STRONG ? 1.1 : 1.0;
    group.add(body);
    this._bodyMat = mat;
    this._body    = body;

    // Mini "barra de HP" flotante encima
    const barBG = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 0.25),
      new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7 }),
    );
    barBG.position.y = 3.0;
    group.add(barBG);
    const barFG = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 0.18),
      new THREE.MeshBasicMaterial({ color: 0xff4444 }),
    );
    barFG.position.set(0, 3.0, 0.01);
    group.add(barFG);
    this._hpBar = barFG;
    this._hpBarFull = 2.0;
    this._hpBarObjs = [barBG, barFG];

    group.position.copy(position);
    group.scale.setScalar(s.scale);
    this.mesh = group;
    this.scene.add(group);
  }

  // ─── Daño recibido ──────────────────────────────────────────────────────
  takeDamage(amount, fromPlayer) {
    if (this.isDead) return;
    this.hp = Math.max(0, this.hp - amount);
    this._hitFlash = 0.15;
    // Mini knockback alejándose del jugador
    if (fromPlayer?._model) {
      const dx = this.mesh.position.x - fromPlayer._model.position.x;
      const dz = this.mesh.position.z - fromPlayer._model.position.z;
      const len = Math.hypot(dx, dz) || 1;
      this.mesh.position.x += (dx / len) * 0.6;
      this.mesh.position.z += (dz / len) * 0.6;
    }
    if (this.hp === 0) {
      this.isDead = true;
      this._emit('death', { coins: this.coinDrop, position: this.mesh.position.clone() });
    }
  }

  // ─── Update por frame ───────────────────────────────────────────────────
  update(delta, players) {
    if (this.isDead) return;

    // Decremento de cooldowns / flash
    this._attackTimer = Math.max(0, this._attackTimer - delta);
    if (this._hitFlash > 0) {
      this._hitFlash -= delta;
      this._bodyMat.emissive = new THREE.Color(0xffffff);
      this._bodyMat.emissiveIntensity = Math.max(0, this._hitFlash * 4);
    } else {
      this._bodyMat.emissiveIntensity = 0;
    }

    // Buscar jugador más cercano vivo
    let target = null;
    let bestDist = Infinity;
    for (const p of players) {
      if (!p?._model || p.stats?.hp_current <= 0) continue;
      const dx = p._model.position.x - this.mesh.position.x;
      const dz = p._model.position.z - this.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist) { bestDist = d2; target = p; }
    }
    if (!target) return;

    const dx = target._model.position.x - this.mesh.position.x;
    const dz = target._model.position.z - this.mesh.position.z;
    const dist = Math.hypot(dx, dz);

    // Persecución
    if (dist > this.range * 0.9) {
      const vx = (dx / (dist || 1)) * this.speed * delta;
      const vz = (dz / (dist || 1)) * this.speed * delta;
      this.mesh.position.x += vx;
      this.mesh.position.z += vz;
      // Orientación: mirar al jugador
      this.mesh.rotation.y = Math.atan2(dx, dz);
      // Bobbing al caminar
      this._bobTimer = (this._bobTimer ?? 0) + delta;
      this._body.position.y = (this.type === EnemyType.STRONG ? 1.1 : 1.0)
                             + Math.sin(this._bobTimer * 10) * 0.08;
    } else if (this._attackTimer === 0) {
      // Ataque al contacto — usar _OnEnemyHit para que el Player aplique
      // daño + animación de hit-recieve (no solo bajar HP).
      if (typeof target._OnEnemyHit === 'function') {
        target._OnEnemyHit(this.dmg);
      } else {
        target.stats?.takeDamage(this.dmg);
      }
      this._attackTimer = this.attackCooldown;
      // Pequeño "lunge" visual hacia el jugador
      this.mesh.position.x += (dx / (dist || 1)) * 0.3;
      this.mesh.position.z += (dz / (dist || 1)) * 0.3;
    }

    // Actualizar barra de HP
    const pct = this.hp / this.maxHp;
    this._hpBar.scale.x = pct;
    this._hpBar.position.x = -(this._hpBarFull * (1 - pct)) / 2;
    // Que las barras miren a cámara aproximadamente (billboard simple)
    for (const b of this._hpBarObjs) b.rotation.set(0, 0, 0);
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.traverse((c) => {
        if (c.geometry) c.geometry.dispose();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
          else c.material.dispose();
        }
      });
    }
    this.mesh = null;
  }
}
