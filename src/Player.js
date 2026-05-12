
// src/Player.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import { CombatSystem } from './CombatSystem.js';
import { Audio, initGameAudio } from './AudioManager.js';

// Inicializar el banco de sonidos una sola vez (idempotente porque los Player
// se crean en el mismo arranque). Si se importa antes de tiempo, igual funciona.
let _audioReady = false;
function _ensureAudio() {
  if (_audioReady) return;
  initGameAudio('assets/audios/');
  _audioReady = true;
}

// ─── Máquina de estados ───────────────────────────────────────────────────────
export const PlayerState = {
  IDLE:           'idle',
  WALKING:        'walking',
  JUMPING:        'jumping',
  ATTACKING:      'attacking',
  KICKING:        'kicking',
  BLOCKING:       'blocking',
  HIT_RECIEVE:    'hitReceive',     // puño
  HIT_RECIEVE_2:  'hitReceive_2',   // patada
  STUNNED:        'stunned',
  KNOCKED_DOWN:   'knocked_down',
  KO:             'ko',
};

const MOVEMENT_LOCKED = new Set([
  PlayerState.ATTACKING, PlayerState.KICKING,
  PlayerState.HIT_RECIEVE, PlayerState.HIT_RECIEVE_2,
  PlayerState.STUNNED,
  PlayerState.KNOCKED_DOWN, PlayerState.KO,
]);

const ATTACK_LOCKED = new Set([
  PlayerState.HIT_RECIEVE, PlayerState.HIT_RECIEVE_2,
  PlayerState.STUNNED,
  PlayerState.KNOCKED_DOWN, PlayerState.KO,
  PlayerState.BLOCKING,
  PlayerState.JUMPING,
]);

// ─────────────────────────────────────────────────────────────────────────────

export class Player {

  constructor(params) {
    this._Init(params);
  }

  // ─── Init ──────────────────────────────────────────────────────────────────

  _Init(params) {
    _ensureAudio();

    this._params        = params;
    this._animaciones   = {};
    this._currentAction = null;
    this._moveSpeed     = 16;
    this._posicionInicial = params.position || new THREE.Vector3(0, 0, 0);

    // Velocidad de reproducción para animaciones de ataque (golpear / patear)
    // Hace que los combos se sientan mucho más responsivos.
    this._ATTACK_ANIM_SPEED = 2.4;
    this._KICK_ANIM_SPEED   = 2.2;

    // FSM
    this.state          = PlayerState.IDLE;
    this._hitStunTimer  = 0;
    this._stunTimer     = 0;
    this._attackTimer   = 0;

    // Resultado del ataque actual: 'pending' | 'hit' | 'miss'
    // Determina qué sonido se reproduce (uno solo por ataque).
    this._attackOutcome = 'none';
    this._attackKind    = null; // 'punch' | 'kick'

    // ── Anti-spam por extremidad ──
    // El jugador puede encadenar hasta SAME_LIMB_MAX golpes seguidos de la
    // misma extremidad. Al alcanzar el límite, esa extremidad queda en
    // cooldown durante LIMB_COOLDOWN segundos (la otra extremidad sigue libre).
    // Alternar de puño a patada (o viceversa) resetea el contador.
    // Si el jugador deja de atacar durante LIMB_SERIES_RESET segundos, los
    // contadores también se resetean.
    this._SAME_LIMB_MAX     = 2;
    this._LIMB_COOLDOWN     = 1.2;
    this._LIMB_SERIES_RESET = 1.2;

    this._punchSeries      = 0;
    this._kickSeries       = 0;
    this._punchCooldown    = 0;
    this._kickCooldown     = 0;
    this._lastAttackType   = null; // 'punch' | 'kick' | null
    this._sinceLastAttack  = 0;

    // Duración de estados temporales (segundos)
    // Ataques mucho más rápidos → combos fluidos.
    this._HIT_STUN_DURATION = 0.25;
    this._STUN_DURATION     = 1.8;
    this._ATTACK_DURATION   = 0.26;
    this._KICK_DURATION     = 0.80;

    // Hitbox extendida: fracción de la duración del ataque que son "frames activos"
    this._ACTIVE_START = 0.20;  // 20% del clip → empieza el golpe
    this._ACTIVE_END   = 0.75;  // 75% del clip → termina el golpe

    // Alternancia de golpes (cada pulsación cambia el lado)
    this._nextPunchSide = 'right'; // 'right' | 'left'
    this._nextKickSide  = 'right';
    this._currentPunchSide = 'right';
    this._currentKickSide  = 'right';
    // Tipo del hit-receive en curso ('punch' | 'kick')
    this._currentHitKind = 'punch';

    // ── Salto (física simple) ──
    // Calibrado para que el salto pase por encima del oponente:
    //   altura_max objetivo ≈ altura del personaje
    // Gravedad alta + impulso recalibrado → mismo techo pero MENOS tiempo
    // en el aire, igual de "snappy" que la velocidad horizontal aumentada.
    this._velocityY     = 0;
    this._gravity       = 110;  // u/s²  (antes 55, ahora 2× para saltos rápidos)
    this._jumpImpulse   = 42;   // se recalibra al cargar el modelo
    this._jumpHeightFactor = 1.20; // 120% de la altura → pasa por encima cómodamente
    this._characterHeight = 7.5;   // fallback hasta conocer el modelo
    this._isGrounded    = true;
    this._groundY       = (params.position?.y) ?? 0;

    // Umbral de altura para considerar que el jugador está "claramente en el aire"
    // (usado por SceneManager para permitir cruzar por debajo).
    this._airCrossThreshold = 1.5;

    // ── Orientación (facing) ──
    // +1 mira hacia +X, -1 mira hacia -X. Se recalcula cada frame.
    this._facing        = 1;

    // ── Escudo / guardia (estilo Smash Bros) ──
    this._shieldMesh    = null;
    this._shieldScale   = 0;     // escala actual (suavizada)
    this._shieldCenterYOffset = 2.2;
    this._shieldBaseRadius = new THREE.Vector3(1.4, 2.4, 1.1); // elipse base (x,y,z)

    this.oponente = null;

    this._input = params.input;
    this._LoadModel();
    this._CreateGuardShield();

    // Sistema de combate
    this.combat = new CombatSystem(params.id || 'p1');
    this._BindCombatEvents();
  }

  // ─── Eventos de combate ────────────────────────────────────────────────────

  _BindCombatEvents() {
    this.combat.on('hit', ({ attackType, blocked, knockback }) => {
      if (knockback > 0 && this._model && this.oponente?._model) {
        const dir = this._model.position.x < this.oponente._model.position.x ? -1 : 1;
        this._model.position.x += dir * knockback;
      }
      // Si el golpe fue bloqueado, no se reproduce la animación de hit-receive
      // (el escudo "absorbe" el impacto visualmente).
      if (blocked) return;

      this._hitStunTimer   = this._HIT_STUN_DURATION;
      this._currentHitKind = attackType === 'kick' ? 'kick' : 'punch';
      const nextState = attackType === 'kick'
        ? PlayerState.HIT_RECIEVE_2
        : PlayerState.HIT_RECIEVE;
      this._transition(nextState);
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
      // "Finish Him" — sonido de KO. combat.isDead se setea antes de emitir
      // y death solo se emite una vez por jugador, así que se reproduce 1x.
      Audio.play('ko');
      console.log(`${this.combat.id} ha muerto`);
    });
  }

  // ─── FSM ──────────────────────────────────────────────────────────────────

  _transition(newState) {
    if (this.state === PlayerState.KO) return false;

    // KO siempre tiene prioridad (no hace falta cumplir restricciones)
    if (newState === PlayerState.KO) {
      this.state = newState;
      return true;
    }

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
    loader.load(this._params.modelPath, (fbx) => {
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

      // Ajustar salto y escudo en función del tamaño real del personaje.
      this._CalibrateFromModelBounds();

      this._mixer = new THREE.AnimationMixer(this._model);

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

      
      // Normalizar nombres de clips para mantener compatibilidad.
      // Devuelve la lista de alias bajo los que se debe registrar el clip.
      const _aliases = (rawName) => {
        const raw = (rawName || '').toString();
        const stripped = raw.replace(/^.*\|/, '');   // quita "CharacterArmature|"
        const n = stripped.toLowerCase();
        const out = new Set([raw, stripped]);

        // Mapeos canónicos (nuevos rigs de Quaternius / mixamo-like)
        if (n === 'idle_sword') out.add('Idle');
        if (n === 'walk') { out.add('caminar'); out.add('walk'); }
        if (n === 'run')  { out.add('run'); }
        if (n === 'death') { out.add('death'); out.add('Death'); }
        if (n === 'hitrecieve' || n === 'hit_recieve') {
          out.add('hitPunch'); out.add('HitRecieve');
        }
        if (n === 'hitrecieve_2' || n === 'hit_recieve_2') {
          out.add('hitKick'); out.add('HitRecieve_2');
        }
        if (n === 'punch_right') { out.add('punchRight'); out.add('golpear'); }
        if (n === 'punch_left')  { out.add('punchLeft');  out.add('golpear'); }
        if (n === 'kick_right')  { out.add('kickRight');  out.add('patear');  }
        if (n === 'kick_left')   { out.add('kickLeft');   out.add('patear');  }
        if (n === 'roll')        { out.add('roll'); out.add('jump'); }

        // Fallback heurístico (modelos antiguos)
        if (n.includes('idle_sword') && !out.has('idle_sword')) out.add('idle_sword');
        if ((n.includes('walk') || n.includes('caminar')) && !out.has('caminar')) out.add('caminar');
        if ((n.includes('punch') || n.includes('golpe')) && !out.has('golpear')) out.add('golpear');
        if ((n.includes('kick')  || n.includes('pate'))  && !out.has('patear'))  out.add('patear');

        return [...out];
      };

      // Registrar las animaciones que vienen embebidas en el modelo
      if (fbx.animations && fbx.animations.length) {
        fbx.animations.forEach((clip) => {
          console.log(`Registrando animación: ${clip.name}`);
          const action = this._mixer.clipAction(clip);
          // Registrar el clip bajo TODOS sus alias (sin pisar uno ya existente,
          // así si "Punch_Right" y "Punch_Left" comparten alias "golpear",
          // gana el primero pero ambos siguen siendo accesibles por su alias propio).
          for (const alias of _aliases(clip.name || clip.uuid)) {
            if (!this._animaciones[alias]) {
              this._animaciones[alias] = { clip, action };
            }
          }
        });

        // Seleccionar acción Idle si existe
        if (this._animaciones['Idle']) {
          this._SetAction('Idle');
        } else {
          // si no hay 'Idle', escoger la primera disponible
          const first = Object.keys(this._animaciones)[0];
          if (first) this._SetAction(first);
        }
      }
    });
  }

  // ─── Orientación ──────────────────────────────────────────────────────────

  faceTarget(targetPlayer) {
    if (!this._model || !targetPlayer?._model) return;
    const myPos     = this._model.position.clone();
    const targetPos = targetPlayer._model.position.clone();
    this._facing = targetPos.x >= myPos.x ? 1 : -1;
    this._model.lookAt(new THREE.Vector3(targetPos.x, myPos.y, targetPos.z));
  }

  _CalibrateFromModelBounds() {
    if (!this._model) return;

    const box = new THREE.Box3().setFromObject(this._model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    if (size.y > 0.01) {
      this._characterHeight = size.y;
      const jumpHeight = this._characterHeight * this._jumpHeightFactor;
      this._jumpImpulse = Math.sqrt(2 * this._gravity * jumpHeight);
    }

    // Centro del escudo en el centro del personaje.
    this._shieldCenterYOffset = center.y - this._model.position.y;

    // Elipse que envuelve todo el cuerpo con un pequeño padding.
    const pad = 0.25;
    this._shieldBaseRadius.set(
      Math.max(size.x * 0.5 + pad, 0.9),
      Math.max(size.y * 0.5 + pad, 1.4),
      Math.max(size.z * 0.5 + pad, 0.8)
    );
  }

  // ─── Animaciones ──────────────────────────────────────────────────────────

  _SetAction(nombre, once = false, forceRestart = false, timeScale = 1) {
    const animacion = this._animaciones[nombre];
    if (!animacion) return;
    if (this._currentAction === nombre && !forceRestart) {
      // Asegurar que el timeScale se aplica aunque no se reinicie la acción
      animacion.action.setEffectiveTimeScale(timeScale);
      return;
    }

    const siguiente = animacion.action;
    const anterior  = this._currentAction
      ? this._animaciones[this._currentAction]?.action
      : null;

    if (anterior && anterior !== siguiente) {
      anterior.fadeOut(0.08);
    } else if (anterior === siguiente) {
      siguiente.stop();
    }

    siguiente.reset();
    siguiente.enabled = true;
    siguiente.setEffectiveTimeScale(timeScale);
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

  // Devuelve el primer alias existente de la lista (o null)
  _pickAnim(...candidates) {
    for (const c of candidates) {
      if (c && this._animaciones[c]) return c;
    }
    return null;
  }

  _UpdateAnimation() {
    switch (this.state) {

      case PlayerState.ATTACKING: {
        const side = this._currentPunchSide === 'left' ? 'punchLeft' : 'punchRight';
        const anim = this._pickAnim(side, 'golpear');
        if (anim) this._SetAction(anim, true, false, this._ATTACK_ANIM_SPEED);
        break;
      }

      case PlayerState.KICKING: {
        const side = this._currentKickSide === 'left' ? 'kickLeft' : 'kickRight';
        const anim = this._pickAnim(side, 'patear');
        if (anim) this._SetAction(anim, true, false, this._KICK_ANIM_SPEED);
        break;
      }

      case PlayerState.HIT_RECIEVE: {
        const anim = this._pickAnim('hitPunch', 'HitRecieve', 'Idle');
        if (anim) this._SetAction(anim, true);
        break;
      }

      case PlayerState.HIT_RECIEVE_2: {
        const anim = this._pickAnim('hitKick', 'HitRecieve_2', 'hitPunch', 'HitRecieve', 'Idle');
        if (anim) this._SetAction(anim, true);
        break;
      }

      case PlayerState.KO: {
        const anim = this._pickAnim('death', 'Death', 'Idle');
        if (anim) this._SetAction(anim, true);
        break;
      }

      case PlayerState.JUMPING: {
        // No hay clip de Jump explícito: usar Roll como fallback o mantener Idle.
        const anim = this._pickAnim('jump', 'roll', 'Idle');
        if (anim) this._SetAction(anim, false);
        break;
      }

      case PlayerState.WALKING: {
        const anim = this._pickAnim('caminar', 'walk', 'run', 'Idle');
        // Acelerar el ciclo de caminar para acompañar la mayor velocidad de
        // desplazamiento; evita el efecto "patinaje sobre hielo".
        if (anim) this._SetAction(anim, false, false, 2.0);
        break;
      }

      case PlayerState.IDLE:
      case PlayerState.BLOCKING:
      case PlayerState.STUNNED:
      case PlayerState.KNOCKED_DOWN:
      default:
        this._SetAction('Idle');
        break;
    }
  }

  // ─── Temporizadores ───────────────────────────────────────────────────────

  _TickTimers(delta) {
    switch (this.state) {

      case PlayerState.HIT_RECIEVE:
      case PlayerState.HIT_RECIEVE_2:
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
        // Ventana de frames activos: intentar golpe / decidir fallo
        this._TryLandHitInWindow('punch');
        if (this._attackTimer <= 0) {
          // Safety net: si el timer expira antes de que el cálculo de
          // progreso detectara el fallo, reproducir el sonido de miss aquí.
          if (this._attackOutcome === 'pending') {
            this._attackOutcome = 'miss';
            Audio.play('punch_miss');
          }
          this._transition(PlayerState.IDLE);
        }
        break;

      case PlayerState.KICKING:
        this._attackTimer -= delta;
        this._TryLandHitInWindow('kick');
        if (this._attackTimer <= 0) {
          if (this._attackOutcome === 'pending') {
            this._attackOutcome = 'miss';
            Audio.play('kick_miss');
          }
          this._transition(PlayerState.IDLE);
        }
        break;
    }
  }

  // ─── Golpe con ventana de frames activos ──────────────────────────────────

  /**
   * Se llama cada frame mientras el personaje está en ATTACKING o KICKING.
   *
   * Reglas de audio (un único sonido por ataque):
   *   - Si conecta dentro de la ventana activa → 'punch_hit' / 'kick_hit'
   *   - Si se pasa la ventana sin conectar      → 'punch_miss' / 'kick_miss'
   *
   * Se usa _attackOutcome (pending|hit|miss) en lugar del antiguo _hitLanded.
   */
  _TryLandHitInWindow(type) {
    if (this._attackOutcome === 'hit' || this._attackOutcome === 'miss') return;
    if (!this._model) return;

    const totalDur  = type === 'punch' ? this._ATTACK_DURATION : this._KICK_DURATION;
    const elapsed   = totalDur - this._attackTimer;
    const progress  = elapsed / totalDur;

    // ¿Se nos pasó la ventana activa sin conectar? → fallo
    if (progress > this._ACTIVE_END) {
      this._attackOutcome = 'miss';
      Audio.play(type === 'punch' ? 'punch_miss' : 'kick_miss');
      return;
    }

    // Aún no entramos a la ventana → esperar
    if (progress < this._ACTIVE_START) return;

    if (!this.oponente?._model) return;

    const distX = Math.abs(
      this._model.position.x - this.oponente._model.position.x
    );

    // Dentro de la ventana activa → intentar golpe con rango extendido
    const result = this.combat.landHit(type, distX, this.oponente.combat, true);

    if (result?.hit) {
      this._attackOutcome = 'hit';
      Audio.play(type === 'punch' ? 'punch_hit' : 'kick_hit');

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

    // ── PUÑO ──
    if (attackPressed) {
      // Bloqueado por cooldown anti-spam (puños): la pulsación se consume y
      // se ignora. La patada sigue disponible aunque el puño esté en cooldown.
      if (this._punchCooldown > 0) {
        // pulsación descartada
      } else if (this._transition(PlayerState.ATTACKING)) {
        this._attackTimer    = this._ATTACK_DURATION;
        this._attackOutcome  = 'pending';
        this._attackKind     = 'punch';
        this._hitLanded      = false; // legacy
        // Alternar lado para este ataque y preparar el siguiente
        this._currentPunchSide = this._nextPunchSide;
        this._nextPunchSide    = this._nextPunchSide === 'right' ? 'left' : 'right';

        // ── Anti-spam ──
        // Si la última extremidad usada fue la patada, esta es una nueva serie
        if (this._lastAttackType !== 'punch') this._punchSeries = 0;
        this._punchSeries++;
        this._kickSeries      = 0;      // alternar resetea el otro contador
        this._lastAttackType  = 'punch';
        this._sinceLastAttack = 0;

        if (this._punchSeries >= this._SAME_LIMB_MAX) {
          // Bloquear el puño durante el cooldown; resetear contador
          this._punchCooldown = this._LIMB_COOLDOWN;
          this._punchSeries   = 0;
        }
      }
    }

    // ── PATADA ──
    if (kickPressed) {
      if (this._kickCooldown > 0) {
        // pulsación descartada
      } else if (this._transition(PlayerState.KICKING)) {
        this._attackTimer    = this._KICK_DURATION;
        this._attackOutcome  = 'pending';
        this._attackKind     = 'kick';
        this._hitLanded      = false;
        this._currentKickSide = this._nextKickSide;
        this._nextKickSide    = this._nextKickSide === 'right' ? 'left' : 'right';

        if (this._lastAttackType !== 'kick') this._kickSeries = 0;
        this._kickSeries++;
        this._punchSeries     = 0;
        this._lastAttackType  = 'kick';
        this._sinceLastAttack = 0;

        if (this._kickSeries >= this._SAME_LIMB_MAX) {
          this._kickCooldown = this._LIMB_COOLDOWN;
          this._kickSeries   = 0;
        }
      }
    }
  }

  /**
   * Avanza los temporizadores anti-spam y resetea la serie por inactividad.
   */
  _TickLimbCooldowns(delta) {
    if (this._punchCooldown > 0) {
      this._punchCooldown -= delta;
      if (this._punchCooldown < 0) this._punchCooldown = 0;
    }
    if (this._kickCooldown > 0) {
      this._kickCooldown -= delta;
      if (this._kickCooldown < 0) this._kickCooldown = 0;
    }
    this._sinceLastAttack += delta;
    if (this._sinceLastAttack > this._LIMB_SERIES_RESET) {
      this._punchSeries = 0;
      this._kickSeries  = 0;
      // No reseteamos _lastAttackType porque ya da igual: ambas series están en 0
    }
  }

  /**
   * Lectura de estado para HUD u otros consumidores (opcional).
   * Devuelve cooldown restante por extremidad y golpes consecutivos actuales.
   */
  getLimbCooldownState() {
    return {
      punch:  { series: this._punchSeries, cooldown: this._punchCooldown, max: this._SAME_LIMB_MAX },
      kick:   { series: this._kickSeries,  cooldown: this._kickCooldown,  max: this._SAME_LIMB_MAX },
    };
  }

  // ─── Salto ────────────────────────────────────────────────────────────────

  _HandleJumpInput() {
    if (!this._input.ConsumeJumpPress) return;
    const jumpPressed = this._input.ConsumeJumpPress();
    if (!jumpPressed) return;
    if (!this._isGrounded) return;
    // No saltar si está atacando, golpeado, stunneado, muerto…
    if (ATTACK_LOCKED.has(this.state) && this.state !== PlayerState.BLOCKING) return;
    if (this.state === PlayerState.BLOCKING) return;

    this._velocityY  = this._jumpImpulse;
    this._isGrounded = false;
    this._transition(PlayerState.JUMPING);
  }

  _UpdateJump(delta) {
    if (!this._model) return;
    if (this._isGrounded && this.state !== PlayerState.JUMPING) return;

    this._velocityY -= this._gravity * delta;
    this._model.position.y += this._velocityY * delta;

    if (this._model.position.y <= this._groundY) {
      this._model.position.y = this._groundY;
      this._velocityY        = 0;
      if (!this._isGrounded) {
        this._isGrounded = true;
        if (this.state === PlayerState.JUMPING) {
          this._transition(PlayerState.IDLE);
        }
      }
    }
  }

  // ─── Escudo / guardia (estilo Smash Bros) ─────────────────────────────────

  _CreateGuardShield() {
    const geom = new THREE.SphereGeometry(1, 32, 24);
    const mat  = new THREE.MeshBasicMaterial({
      color:        0x66ddff,
      transparent:  true,
      opacity:      0.32,
      depthWrite:   false,
      side:         THREE.FrontSide,
    });
    this._shieldMesh = new THREE.Mesh(geom, mat);
    this._shieldMesh.visible = false;
    this._shieldMesh.renderOrder = 999;
    // Añadir directamente a la escena para evitar el scale 0.1 del fbx
    this._params.scene.add(this._shieldMesh);
  }

  _UpdateGuardShield(delta) {
    if (!this._shieldMesh || !this._model) return;

    const guardPct = Math.max(0, Math.min(1, this.combat.guard / 100));
    const isBlocking = this.state === PlayerState.BLOCKING && !this.combat.guardBroken;

    // Posicionar el escudo envolviendo al personaje
    this._shieldMesh.position.set(
      this._model.position.x,
      this._model.position.y + this._shieldCenterYOffset,
      this._model.position.z
    );

    // Escala objetivo: 1.0 cuando bloquea con guardia llena, 0 en otro caso
    const target = isBlocking ? guardPct : 0;
    // Lerp independiente del framerate
    const f = 1 - Math.exp(-12 * delta);
    this._shieldScale = THREE.MathUtils.lerp(this._shieldScale, target, f);

    if (this._shieldScale < 0.01) {
      this._shieldMesh.visible = false;
      this._shieldMesh.scale.set(0.01, 0.01, 0.01);
    } else {
      this._shieldMesh.visible = true;
      this._shieldMesh.scale.set(
        this._shieldBaseRadius.x * this._shieldScale,
        this._shieldBaseRadius.y * this._shieldScale,
        this._shieldBaseRadius.z * this._shieldScale
      );
      // Color: del cian al rojo conforme baja la guardia
      const c = this._shieldMesh.material.color;
      c.setRGB(
        1.0 - guardPct * 0.6,         // R: sube cuando guardia baja
        0.6 + guardPct * 0.4,         // G
        0.8 + guardPct * 0.2          // B
      );
      this._shieldMesh.material.opacity = 0.20 + guardPct * 0.20;
    }
  }

  // ─── Update principal ─────────────────────────────────────────────────────

  Update(delta) {
    if (!this._model || !this._mixer) return;

    // Siempre actualizar el sistema de combate (regenera guardia, etc.)
    const cubriendo = this._input._keys?.cubrirse ?? false;
    this.combat.update(delta, cubriendo);

    // Bloquear todo si está muerto, pero mantener animación de Death y escudo oculto
    if (this.combat.isDead) {
      this._UpdateAnimation();
      this._UpdateGuardShield(delta);
      this._mixer.update(delta);
      return;
    }

    // Siempre mirar al rival
    if (this.oponente) this.faceTarget(this.oponente);

    // Cooldowns anti-spam (siempre avanzan, también durante stun/hit-recieve)
    this._TickLimbCooldowns(delta);

    // Temporizadores de estado (HIT_RECIEVE, STUNNED, ATTACKING, KICKING)
    this._TickTimers(delta);

    // Bloqueo: solo si está en el suelo y no en estados restringidos
    if (!MOVEMENT_LOCKED.has(this.state) && this._isGrounded && this.state !== PlayerState.JUMPING) {
      if (cubriendo) {
        this._transition(PlayerState.BLOCKING);
      } else if (this.state === PlayerState.BLOCKING) {
        this._transition(PlayerState.IDLE);
      }
    }

    // Salto: leer input antes de aplicar física vertical
    if (!MOVEMENT_LOCKED.has(this.state) && this.state !== PlayerState.BLOCKING) {
      this._HandleJumpInput();
    }
    this._UpdateJump(delta);

    // Movimiento solo si el estado lo permite (también se permite en el aire)
    const canMove = (!MOVEMENT_LOCKED.has(this.state) && this.state !== PlayerState.BLOCKING)
                  || this.state === PlayerState.JUMPING;
    if (canMove) this._HandleMovement(delta);

    // Input de ataque solo si el estado lo permite
    if (!ATTACK_LOCKED.has(this.state)) {
      this._HandleCombatInput();
    }

    // Animación según estado
    this._UpdateAnimation();

    // Escudo de guardia
    this._UpdateGuardShield(delta);

    this._mixer.update(delta);
  }
}