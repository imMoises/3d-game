/**
 * Enemy.js
 *
 * Enemigos del mundo RPG. Tres tipos:
 *  - WEAK   → Enemy_ExtraSmall  (rápido y frágil)
 *  - MEDIUM → Enemy_Large       (intermedio)
 *  - STRONG → Skeleton          (lento, mucha vida y daño)
 *
 * Cada uno usa un FBX con animaciones embebidas. Mientras los modelos
 * cargan se muestra un placeholder geométrico para que el spawn no
 * "salte" en cuanto tienen su mesh real.
 *
 * Animaciones esperadas en cada FBX:
 *   - Enemy_Large / Enemy_ExtraSmall: Fast_Flying, Death, HitReact, Punch
 *   - Skeleton: Skeleton_Running, Skeleton_Attack, Skeleton_Death
 *
 * Eventos: 'death' { coins, position }
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { cloneFBXAsync, loadFBX } from './AssetCache.js';

export const EnemyType = {
  WEAK:   'weak',
  MEDIUM: 'medium',
  STRONG: 'strong',
};

// Stats balanceados (más suaves que la versión anterior para que no maten
// al jugador en cuestión de segundos). Daño y cooldown ajustados a la baja.
// Escalas pensadas para que coincidan con el player (escala 0.01 en RPG):
//   weak   ≈ 0.7×, medium ≈ 1.1×, strong ≈ 1.4× del jugador
// Drops de monedas más generosos para que el progreso del skill tree sea
// rápido y satisfactorio.
const STATS = {
  weak: {
    hp: 8, dmg: 3, speed: 5.5, coins: 4,
    color: 0x44dd66, scale: 0.008, attackCooldown: 1.5, range: 2.5,
    fbx: 'assets/enemigos/Enemy-Small/Enemy_ExtraSmall.fbx',
    anims: { run: 'Fast_Flying', attack: 'Punch', hit: 'HitReact', death: 'Death' },
    yOffset: 0.0,
  },
  medium: {
    hp: 20, dmg: 5, speed: 3.6, coins: 8,
    color: 0xffa726, scale: 0.012, attackCooldown: 1.9, range: 2.8,
    fbx: 'assets/enemigos/Enemy-Large/Enemy_Large.fbx',
    anims: { run: 'Walk', attack: 'Punch', hit: 'HitReact', death: 'Death' },
    yOffset: 0.0,
  },
  strong: {
    hp: 30, dmg: 8, speed: 3.2, coins: 18,
    color: 0xb0bec5, scale: 0.016, attackCooldown: 2.2, range: 3.0,
    fbx: 'assets/enemigos/Skeleton/Skeleton.fbx',
    anims: { run: 'Skeleton_Running', attack: 'Skeleton_Attack', hit: null, death: 'Skeleton_Death' },
    yOffset: 0.0,
  },
};

// Pre-carga inmediata para evitar parones la primera vez que spawnea cada tipo.
let _preloadStarted = false;
export function preloadEnemyAssets() {
  if (_preloadStarted) return;
  _preloadStarted = true;
  Object.values(STATS).forEach((s) => loadFBX(s.fbx).catch(() => {}));
}

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
    this._yOffset        = s.yOffset || 0;
    this._scale          = s.scale;
    this._anims          = s.anims;
    this._stats          = s;
    this._listeners      = {};

    // Estado interno de animación
    this._mixer        = null;
    this._actions      = {};   // alias → AnimationAction
    this._currentAnim  = null;
    this._modelReady   = false;
    this._deathPlayedAt = 0;

    this._BuildPlaceholder(s, position);
    this._LoadModel(s, position);
  }

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }
  _emit(event, data = {}) {
    (this._listeners[event] || []).forEach((fn) => fn(data));
  }

  // ─── Placeholder mientras carga el FBX ──────────────────────────────────
  _BuildPlaceholder(s, position) {
    const group = new THREE.Group();
    group.position.copy(position);
    this.mesh = group;

    let bodyGeom;
    if (this.type === EnemyType.WEAK)        bodyGeom = new THREE.SphereGeometry(0.7, 12, 8);
    else if (this.type === EnemyType.STRONG) bodyGeom = new THREE.BoxGeometry(1.2, 2.0, 1.0);
    else if (THREE.CapsuleGeometry)          bodyGeom = new THREE.CapsuleGeometry(0.6, 1.4, 4, 8);
    else                                     bodyGeom = new THREE.CylinderGeometry(0.6, 0.7, 2.0, 10);

    const mat = new THREE.MeshStandardMaterial({
      color: s.color, roughness: 0.7, metalness: 0.05,
      transparent: true, opacity: 0.9,
    });
    const body = new THREE.Mesh(bodyGeom, mat);
    body.position.y = 1.0;
    body.castShadow = true;
    group.add(body);
    this._placeholder = body;
    this._placeholderMat = mat;

    // Mini "barra de HP" flotante encima
    const barBG = new THREE.Mesh(
      new THREE.PlaneGeometry(2.0, 0.22),
      new THREE.MeshBasicMaterial({ color: 0x111111, transparent: true, opacity: 0.7, depthTest: false }),
    );
    barBG.position.y = 3.2;
    barBG.renderOrder = 998;
    group.add(barBG);

    const barFG = new THREE.Mesh(
      new THREE.PlaneGeometry(1.85, 0.16),
      new THREE.MeshBasicMaterial({ color: 0xff4444, depthTest: false }),
    );
    barFG.position.set(0, 3.2, 0.01);
    barFG.renderOrder = 999;
    group.add(barFG);
    this._hpBar = barFG;
    this._hpBarFull = 1.85;

    this.scene.add(group);
  }

  // ─── Carga del modelo real (FBX) ────────────────────────────────────────
  async _LoadModel(s, position) {
    try {
      const { object, animations } = await cloneFBXAsync(s.fbx, { skinned: true });
      object.scale.setScalar(s.scale);
      object.position.set(0, this._yOffset, 0);
      object.traverse((c) => {
        if (c.isMesh) {
          c.castShadow = true;
          c.receiveShadow = false;
          if (Array.isArray(c.material)) {
            c.material.forEach((m) => { m.transparent = false; m.opacity = 1; });
          } else if (c.material) {
            c.material.transparent = false; c.material.opacity = 1;
          }
        }
      });

      // Reemplazar placeholder
      if (this._placeholder) {
        this.mesh.remove(this._placeholder);
        this._placeholder.geometry?.dispose?.();
        this._placeholderMat?.dispose?.();
        this._placeholder = null;
      }
      this.mesh.add(object);
      this._fbxRoot = object;

      // Mixer + acciones
      this._mixer = new THREE.AnimationMixer(object);
      const findClip = (name) => animations.find((c) =>
        c.name === name || c.name.toLowerCase() === name.toLowerCase()
        || c.name.endsWith('|' + name)
      );
      for (const [alias, name] of Object.entries(this._anims)) {
        if (!name) continue;
        const clip = findClip(name);
        if (clip) {
          this._actions[alias] = this._mixer.clipAction(clip);
        } else {
          // Fallback: cualquier clip cuyo nombre contenga el alias buscado
          const fb = animations.find((c) => c.name.toLowerCase().includes(name.toLowerCase()));
          if (fb) this._actions[alias] = this._mixer.clipAction(fb);
        }
      }

      // Listener para terminar la animación de muerte
      this._mixer.addEventListener('finished', () => {
        if (this.isDead) {
          // Quedará marcado como _toRemove para que RPGWorld lo limpie
          this._toRemove = true;
        }
      });

      this._modelReady = true;
      // Iniciar en modo "run" (idle/walk) por defecto
      this._SetAnim('run', false);
    } catch (err) {
      console.warn('[Enemy] No se pudo cargar FBX', s.fbx, err);
    }
  }

  _SetAnim(alias, once = false) {
    const action = this._actions[alias];
    if (!action || this._currentAnim === alias) return;
    const prev = this._currentAnim ? this._actions[this._currentAnim] : null;
    if (prev && prev !== action) prev.fadeOut(0.18);
    action.reset();
    action.enabled = true;
    action.setEffectiveTimeScale(1);
    action.setEffectiveWeight(1);
    if (once) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    } else {
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = false;
    }
    action.play();
    this._currentAnim = alias;
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
      this.mesh.position.x += (dx / len) * 0.55;
      this.mesh.position.z += (dz / len) * 0.55;
    }
    if (this.hp === 0) {
      this.isDead = true;
      // Animación de muerte (si existe). Sino, marcar para limpiar inmediatamente.
      if (this._actions.death) {
        this._SetAnim('death', true);
        this._deathPlayedAt = performance.now();
      } else {
        this._toRemove = true;
      }
      this._emit('death', { coins: this.coinDrop, position: this.mesh.position.clone() });
    } else if (this._actions.hit) {
      // HitReact corto y volver a run
      this._SetAnim('hit', true);
      this._scheduleReturnToRun();
    }
  }

  _scheduleReturnToRun() {
    clearTimeout(this._hitReturnTimer);
    this._hitReturnTimer = setTimeout(() => {
      if (!this.isDead) this._SetAnim('run', false);
    }, 380);
  }

  // ─── Update por frame ───────────────────────────────────────────────────
  update(delta, players) {
    // Avanzar mixer SIEMPRE (también para la animación de muerte)
    if (this._mixer) this._mixer.update(delta);

    if (this.isDead) {
      // Failsafe: si death no dispara 'finished' tras 2s, eliminar.
      if (this._deathPlayedAt && performance.now() - this._deathPlayedAt > 2000) {
        this._toRemove = true;
      }
      return;
    }

    // Decremento de cooldowns / flash
    this._attackTimer = Math.max(0, this._attackTimer - delta);
    if (this._hitFlash > 0) {
      this._hitFlash -= delta;
      if (this._placeholderMat) {
        this._placeholderMat.emissive = new THREE.Color(0xffffff);
        this._placeholderMat.emissiveIntensity = Math.max(0, this._hitFlash * 4);
      } else if (this._fbxRoot) {
        // Tinte al recibir daño en los materiales del FBX
        this._fbxRoot.traverse((c) => {
          if (c.isMesh && c.material) {
            const m = Array.isArray(c.material) ? c.material[0] : c.material;
            if (m.emissive) {
              m.emissive.setRGB(1, 1, 1);
              m.emissiveIntensity = Math.max(0, this._hitFlash * 3);
            }
          }
        });
      }
    } else if (this._fbxRoot) {
      this._fbxRoot.traverse((c) => {
        if (c.isMesh && c.material) {
          const m = Array.isArray(c.material) ? c.material[0] : c.material;
          if (m && 'emissiveIntensity' in m) m.emissiveIntensity = 0;
        }
      });
    }

    // Buscar jugador más cercano vivo
    let target = null;
    let bestDist = Infinity;
    for (const p of players) {
      if (!p?._model) continue;
      if (p.stats && p.stats.hp_current <= 0) continue;
      const dx = p._model.position.x - this.mesh.position.x;
      const dz = p._model.position.z - this.mesh.position.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestDist) { bestDist = d2; target = p; }
    }
    if (!target) {
      this._SetAnim('run', false);
      return;
    }

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
      // Animación de movimiento
      this._SetAnim('run', false);
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
      this.mesh.position.x += (dx / (dist || 1)) * 0.25;
      this.mesh.position.z += (dz / (dist || 1)) * 0.25;
      // Animación de ataque (one-shot)
      if (this._actions.attack) {
        this._SetAnim('attack', true);
        // Volver a run después del cooldown reducido
        clearTimeout(this._atkReturnTimer);
        this._atkReturnTimer = setTimeout(() => {
          if (!this.isDead) this._SetAnim('run', false);
        }, Math.max(280, this.attackCooldown * 1000 * 0.6));
      }
    } else {
      // En rango pero esperando cooldown → seguir mirando al objetivo
      this.mesh.rotation.y = Math.atan2(dx, dz);
    }

    // Actualizar barra de HP
    const pct = this.hp / this.maxHp;
    if (this._hpBar) {
      this._hpBar.scale.x = pct;
      this._hpBar.position.x = -(this._hpBarFull * (1 - pct)) / 2;
    }
  }

  dispose() {
    clearTimeout(this._hitReturnTimer);
    clearTimeout(this._atkReturnTimer);
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.traverse((c) => {
        if (c.geometry) c.geometry.dispose?.();
        if (c.material) {
          if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose?.());
          else c.material.dispose?.();
        }
      });
    }
    this.mesh = null;
  }
}
