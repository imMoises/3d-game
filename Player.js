
// src/Player.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import { CombatSystem } from './CombatSystem.js';

// ─── Máquina de estados ───────────────────────────────────────────────────────
export const PlayerState = {
  IDLE:         'idle',
  WALKING:      'walking',
  ATTACKING:    'attacking',
  KICKING:      'kicking',
  BLOCKING:     'blocking',
  HIT_STUN:     'hit_stun',
  STUNNED:      'stunned',
  KNOCKED_DOWN: 'knocked_down',
  KO:           'ko',
};

const MOVEMENT_LOCKED = new Set([
  PlayerState.ATTACKING, PlayerState.KICKING,
  PlayerState.HIT_STUN,  PlayerState.STUNNED,
  PlayerState.KNOCKED_DOWN, PlayerState.KO,
]);

const ATTACK_LOCKED = new Set([
  PlayerState.HIT_STUN,  PlayerState.STUNNED,
  PlayerState.KNOCKED_DOWN, PlayerState.KO,
  PlayerState.BLOCKING,
]);

// ─────────────────────────────────────────────────────────────────────────────

export class Player {

  constructor(params) {
    this._Init(params);
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  _Init(params) {
    this._params        = params;
    this._animaciones   = {};
    this._currentAction = null;
    this._moveSpeed     = 8;
    this._posicionInicial = params.position || new THREE.Vector3(0, 0, 0);

    // FSM
    this.state          = PlayerState.IDLE;
    this._hitStunTimer  = 0;
    this._stunTimer     = 0;
    this._attackTimer   = 0;

    // Duración de estados temporales (segundos)
    this._HIT_STUN_DURATION = 0.35;
    this._STUN_DURATION     = 1.8;
    this._ATTACK_DURATION   = 0.55;
    this._KICK_DURATION     = 0.65;

    // Hitbox extendida: fracción de la duración del ataque que son "frames activos"
    this._ACTIVE_START = 0.20;  // 20% del clip → empieza el golpe
    this._ACTIVE_END   = 0.75;  // 75% del clip → termina el golpe

    this.oponente = null;

    this._input = params.input;
    this._LoadModel();

    // Sistema de combate
    this.combat = new CombatSystem(params.id || 'p1');
    this._BindCombatEvents();
  }

  // ─── Eventos de combate ────────────────────────────────────────────────────

  _BindCombatEvents() {
    this.combat.on('hit', ({ knockback }) => {
      if (knockback > 0 && this._model && this.oponente?._model) {
        const dir = this._model.position.x < this.oponente._model.position.x ? -1 : 1;
        this._model.position.x += dir * knockback;
      }
      this._hitStunTimer = this._HIT_STUN_DURATION;
      this._transition(PlayerState.HIT_STUN);
    });

    this.combat.on('stunStart', () => {
      this._stunTimer = this._STUN_DURATION;
      this._transition(PlayerState.STUNNED);
    });

    this.combat.on('guardBroken', () => {
      this._stunTimer = 0.8;
      this._transition(PlayerState.STUNNED);
    });

    this.combat.on('stunEnd', () => {
      this._transition(PlayerState.IDLE);
    });

    this.combat.on('death', () => {
      this._transition(PlayerState.KO);
      console.log(`${this.combat.id} ha muerto`);
    });
  }

  // ─── FSM ──────────────────────────────────────────────────────────────────

  _transition(newState) {
    if (this.state === PlayerState.KO) return false;

    const isAttack = newState === PlayerState.ATTACKING || newState === PlayerState.KICKING;
    if (isAttack && ATTACK_LOCKED.has(this.state)) return false;

    this.state = newState;
    return true;
  }

  get isBlocking() {
    return this.state === PlayerState.BLOCKING;
  }

  // ─── Carga de modelo ──────────────────────────────────────────────────────

  _LoadModel() {
    const loader = new FBXLoader();
    loader.setPath(this._params.modelPath);
    loader.load('malla.fbx', (fbx) => {
      fbx.scale.setScalar(0.1);
      fbx.traverse(c => {
        c.castShadow = true;
        c.layers.set(1);
      });
      fbx.position.copy(this._posicionInicial);

      const luzLocal = new THREE.AmbientLight(0xffffff, 1);
      luzLocal.layers.set(1);
      fbx.add(luzLocal);

      this._model = fbx;
      this._params.scene.add(this._model);

      this._mixer  = new THREE.AnimationMixer(this._model);
      this._manager = new THREE.LoadingManager();

      this._manager.onLoad = () => {
        this._SetAction('Idle');
      };

      // Cuando termina un ataque/patada, volver a idle
      this._mixer.addEventListener('finished', () => {
        if (
          this.state === PlayerState.ATTACKING ||
          this.state === PlayerState.KICKING
        ) {
          this._transition(PlayerState.IDLE);
        }
      });

      if (this._params.onModelLoaded) {
        this._params.onModelLoaded(this);
      }

      const _OnLoad = (nombre, animacion) => {
        const clip   = animacion.animations[0];
        const action = this._mixer.clipAction(clip);
        this._animaciones[nombre] = { clip, action };
      };

      const animLoader = new FBXLoader(this._manager);
      animLoader.setPath('./assets/james/');
      animLoader.load('caminar.fbx', a => _OnLoad('caminar', a));
      animLoader.load('Idle.fbx',    a => _OnLoad('Idle',    a));
      animLoader.load('golpear.fbx', a => _OnLoad('golpear', a));
      animLoader.load('patear.fbx',  a => _OnLoad('patear',  a));
    });
  }

  // ─── Orientación ──────────────────────────────────────────────────────────

  faceTarget(targetPlayer) {
    if (!this._model || !targetPlayer?._model) return;
    const myPos     = this._model.position.clone();
    const targetPos = targetPlayer._model.position.clone();
    this._model.lookAt(new THREE.Vector3(targetPos.x, myPos.y, targetPos.z));
  }

  // ─── Animaciones ──────────────────────────────────────────────────────────

  _SetAction(nombre, once = false, forceRestart = false) {
    const animacion = this._animaciones[nombre];
    if (!animacion) return;
    if (this._currentAction === nombre && !forceRestart) return;

    const siguiente = animacion.action;
    const anterior  = this._currentAction
      ? this._animaciones[this._currentAction]?.action
      : null;

    if (anterior && anterior !== siguiente) {
      anterior.fadeOut(0.15);
    } else if (anterior === siguiente) {
      siguiente.stop();
    }

    siguiente.reset();
    siguiente.enabled = true;
    siguiente.setEffectiveTimeScale(1);
    siguiente.setEffectiveWeight(1);

    if (once) {
      siguiente.setLoop(THREE.LoopOnce, 1);
      siguiente.clampWhenFinished = true;
    } else {
      siguiente.setLoop(THREE.LoopRepeat, Infinity);
      siguiente.clampWhenFinished = false;
    }

    siguiente.play();
    this._currentAction = nombre;
  }

  _UpdateAnimation() {
    switch (this.state) {
      case PlayerState.ATTACKING:    this._SetAction('golpear', true); break;
      case PlayerState.KICKING:      this._SetAction('patear',  true); break;
      case PlayerState.WALKING:      this._SetAction('caminar', true); break;
      case PlayerState.IDLE:
      case PlayerState.BLOCKING:
      case PlayerState.HIT_STUN:
      case PlayerState.STUNNED:
      case PlayerState.KNOCKED_DOWN:
      case PlayerState.KO:
      default:
        this._SetAction('Idle');
        break;
    }
  }

  // ─── Temporizadores ───────────────────────────────────────────────────────

  _TickTimers(delta) {
    switch (this.state) {

      case PlayerState.HIT_STUN:
        this._hitStunTimer -= delta;
        // Micro-shake visual
        if (this._model) {
          this._model.position.x += Math.sin(Date.now() * 0.08) * 0.015;
        }
        if (this._hitStunTimer <= 0) this._transition(PlayerState.IDLE);
        break;

      case PlayerState.STUNNED:
        this._stunTimer -= delta;
        if (this._stunTimer <= 0) this._transition(PlayerState.IDLE);
        break;

      case PlayerState.ATTACKING:
        this._attackTimer -= delta;
        // Ventana de frames activos: intentar golpe una sola vez
        this._TryLandHitInWindow('punch');
        if (this._attackTimer <= 0) this._transition(PlayerState.IDLE);
        break;

      case PlayerState.KICKING:
        this._attackTimer -= delta;
        this._TryLandHitInWindow('kick');
        if (this._attackTimer <= 0) this._transition(PlayerState.IDLE);
        break;
    }
  }

  // ─── Golpe con ventana de frames activos ──────────────────────────────────

  /**
   * Se llama cada frame mientras el personaje está en ATTACKING o KICKING.
   * Usa _hitLanded para garantizar que el golpe conecta una sola vez por ataque.
   */
  _TryLandHitInWindow(type) {
    if (this._hitLanded) return; // ya conectó en este ataque
    if (!this.oponente?._model || !this._model) return;

    const totalDur  = type === 'punch' ? this._ATTACK_DURATION : this._KICK_DURATION;
    const elapsed   = totalDur - this._attackTimer;
    const progress  = elapsed / totalDur;

    // Solo durante la ventana activa del clip
    const inWindow  = progress >= this._ACTIVE_START && progress <= this._ACTIVE_END;
    if (!inWindow) return;

    const distX = Math.abs(
      this._model.position.x - this.oponente._model.position.x
    );

    // Rango extendido durante frames activos
    const result = this.combat.landHit(type, distX, this.oponente.combat, true);

    if (result?.hit) {
      this._hitLanded = true; // evitar golpear más de una vez por acción
      const dir = Math.sign(
        this.oponente._model.position.x - this._model.position.x
      );
      this.oponente._model.position.x += dir * (result.blocked ? 0.4 : 1.1);
    }
  }

  // ─── Movimiento ───────────────────────────────────────────────────────────

  _HandleMovement(delta) {
    const keys = this._input._keys;
    const moving = keys.izquierda || keys.derecha;

    if (keys.izquierda) {
      this._model.position.x -= this._moveSpeed * delta; // ← eje X correcto
    }
    if (keys.derecha) {
      this._model.position.x += this._moveSpeed * delta;
    }

    if (moving && this.state === PlayerState.IDLE) {
      this._transition(PlayerState.WALKING);
    } else if (!moving && this.state === PlayerState.WALKING) {
      this._transition(PlayerState.IDLE);
    }
  }

  // ─── Input de combate ─────────────────────────────────────────────────────

  _HandleCombatInput() {
    // ConsumeAttackPress/ConsumeKickPress devuelven true UNA sola vez por pulsación
    const attackPressed = this._input.ConsumeAttackPress?.();
    const kickPressed   = this._input.ConsumeKickPress?.();

    if (attackPressed && this._transition(PlayerState.ATTACKING)) {
      this._attackTimer = this._ATTACK_DURATION;
      this._hitLanded   = false; // reset de la ventana
    }

    if (kickPressed && this._transition(PlayerState.KICKING)) {
      this._attackTimer = this._KICK_DURATION;
      this._hitLanded   = false;
    }
  }

  // ─── Update principal ─────────────────────────────────────────────────────

  Update(delta) {
    if (!this._model || !this._mixer) return;

    // Siempre actualizar el sistema de combate (regenera guardia, etc.)
    const cubriendo = this._input._keys?.cubrirse ?? false;
    this.combat.update(delta, cubriendo);

    // Bloquear todo si está muerto
    if (this.combat.isDead) {
      this._mixer.update(delta);
      return;
    }

    // Siempre mirar al rival
    if (this.oponente) this.faceTarget(this.oponente);

    // Temporizadores de estado (HIT_STUN, STUNNED, ATTACKING, KICKING)
    this._TickTimers(delta);

    // Bloqueo: se puede activar/desactivar en estados no bloqueados
    if (!MOVEMENT_LOCKED.has(this.state)) {
      if (cubriendo) {
        this._transition(PlayerState.BLOCKING);
      } else if (this.state === PlayerState.BLOCKING) {
        this._transition(PlayerState.IDLE);
      }
    }

    // Movimiento solo si el estado lo permite
    if (!MOVEMENT_LOCKED.has(this.state) && this.state !== PlayerState.BLOCKING) {
      this._HandleMovement(delta);
    }

    // Input de ataque solo si el estado lo permite
    if (!ATTACK_LOCKED.has(this.state)) {
      this._HandleCombatInput();
    }

    // Animación según estado
    this._UpdateAnimation();

    this._mixer.update(delta);
  }
}