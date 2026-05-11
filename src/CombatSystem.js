/**
 * CombatSystem.js
 *
 * Sistema de combate estilo Mortal Kombat 2D sobre escena 3D.
 *
 * Responsabilidades:
 *  - Vida (HP)
 *  - Barra de guardia (Guard)
 *  - Estado de stun con escalonamiento por combos
 *  - Detección de golpe con rango en X
 *  - Knockback en X
 *  - Eventos que Player.js puede escuchar
 *
 * NO toca Three.js directamente. Solo datos y lógica.
 * Player.js consume el estado y aplica las consecuencias visuales.
 */

export class CombatSystem {
  // ─── Constantes de diseño ────────────────────────────────────────────────

  static HP_MAX           = 100;

  // Guardia
  static GUARD_MAX        = 100;   // Barra llena
  static GUARD_DRAIN_RATE = 18;    // Por segundo mientras está cubriendo
  static GUARD_REGEN_RATE = 14;    // Por segundo cuando NO cubre
  static GUARD_BREAK_STUN = 1.2;   // Segundos de stun al romper guardia

  // Daño base
  static DMG_PUNCH        = 8;
  static DMG_KICK         = 12;
  static DMG_PUNCH_BLOCK  = 2;     // Daño que pasa aunque esté bloqueando
  static DMG_KICK_BLOCK   = 3;

  // Stun por hits consecutivos (juggling)
  // hits  → duración stun
  static STUN_TABLE = [
    { hitsNeeded: 1, duration: 0.35 },  // 1er golpe: stun corto
    { hitsNeeded: 2, duration: 0.50 },  // 2do golpe seguido
    { hitsNeeded: 3, duration: 0.65 },  // 3er golpe
    { hitsNeeded: 4, duration: 0.85 },  // 4to+
  ];
  static COMBO_RESET_TIME = 1.8;    // Segundos sin golpear para resetear combo
  static STUN_MAX_DURATION = 1.2;   // Techo de stun independiente del combo

  // Rango de golpe (distancia en X para que el hit conecte)
  static PUNCH_RANGE = 1.8;
  static KICK_RANGE  = 2.2;

  // Knockback en X al recibir golpe (sin bloquear)
  static KNOCKBACK_PUNCH = 0.6;
  static KNOCKBACK_KICK  = 1.0;

  // ─── Constructor ────────────────────────────────────────────────────────

  /**
   * @param {string} id  - Identificador del jugador ("p1" | "p2")
   */
  constructor(id) {
    this.id = id;

    // Vida
    this.hp       = CombatSystem.HP_MAX;
    this.isDead   = false;

    // Guardia
    this.guard       = CombatSystem.GUARD_MAX;
    this.guardBroken = false;   // True mientras la guardia está rota

    // Stun
    this.isStunned    = false;
    this.stunTimer    = 0;

    // Combo (hits consecutivos recibidos sin que pase COMBO_RESET_TIME)
    this.comboHitsReceived = 0;
    this.comboResetTimer   = 0;

    // Combo infligido (para la UI del atacante)
    this.comboHitsLanded  = 0;
    this.comboDisplayTimer = 0;   // Cuánto tiempo mostrar el contador en HUD

    // Listeners internos
    this._listeners = {};
  }

  // ─── API pública ─────────────────────────────────────────────────────────

  /**
   * Llámalo cada frame desde Player.Update(deltaTime).
   * @param {number} deltaTime
   * @param {boolean} isBlocking  - Si el jugador tiene L presionado
   */
  update(deltaTime, isBlocking) {
    if (this.isDead) return;

    // Stun
    if (this.isStunned) {
      this.stunTimer -= deltaTime;
      if (this.stunTimer <= 0) {
        this.isStunned = false;
        this.stunTimer = 0;
        this._emit('stunEnd');
      }
    }

    // Guardia
    if (!this.guardBroken) {
      if (isBlocking && !this.isStunned) {
        this.guard -= CombatSystem.GUARD_DRAIN_RATE * deltaTime;
        if (this.guard <= 0) {
          this.guard = 0;
          this._breakGuard();
        }
      } else {
        this.guard = Math.min(
          CombatSystem.GUARD_MAX,
          this.guard + CombatSystem.GUARD_REGEN_RATE * deltaTime
        );
      }
    } else {
      // Guardia rota: se regenera lentamente, pero el personaje sigue vulnerable
      this.guard = Math.min(
        CombatSystem.GUARD_MAX,
        this.guard + (CombatSystem.GUARD_REGEN_RATE * 0.4) * deltaTime
      );
      if (this.guard >= CombatSystem.GUARD_MAX * 0.3) {
        // Cuando llega al 30% se considera "reparada"
        this.guardBroken = false;
        this._emit('guardRestored');
      }
    }

    // Reset combo recibido si pasó demasiado tiempo sin golpes
    if (this.comboHitsReceived > 0) {
      this.comboResetTimer -= deltaTime;
      if (this.comboResetTimer <= 0) {
        this.comboHitsReceived = 0;
      }
    }

    // Timer de display del combo infligido
    if (this.comboHitsLanded > 0) {
      this.comboDisplayTimer -= deltaTime;
      if (this.comboDisplayTimer <= 0) {
        this.comboHitsLanded  = 0;
        this.comboDisplayTimer = 0;
        this._emit('comboReset');
      }
    }
  }

  /**
   * Intenta aterrizar un golpe sobre el objetivo (otro CombatSystem).
   * Devuelve true si el golpe conectó (en rango).
   *
   * @param {'punch'|'kick'} attackType
   * @param {number} distanceX         - Distancia absoluta en X entre los dos jugadores
   * @param {CombatSystem} target      - Sistema de combate del rival
   * @returns {boolean}
   */
  landHit(attackType, distanceX, target) {
    const range = attackType === 'punch'
      ? CombatSystem.PUNCH_RANGE
      : CombatSystem.KICK_RANGE;

    if (distanceX > range) return false;   // Fuera de rango
    if (target.isDead)      return false;

    target._receiveHit(attackType, this);
    return true;
  }

  /**
   * Estado de solo lectura para la UI.
   */
  getState() {
    return {
      hp:            this.hp,
      hpPercent:     this.hp / CombatSystem.HP_MAX,
      guard:         this.guard,
      guardPercent:  this.guard / CombatSystem.GUARD_MAX,
      guardBroken:   this.guardBroken,
      isStunned:     this.isStunned,
      isDead:        this.isDead,
      comboLanded:   this.comboHitsLanded,
    };
  }

  // ─── Eventos ─────────────────────────────────────────────────────────────

  /**
   * Suscribirse a eventos del sistema.
   * Eventos disponibles:
   *   'hit'          → { attackType, blocked, damage, knockback }
   *   'guardBroken'  → {}
   *   'guardRestored'→ {}
   *   'stunStart'    → { duration }
   *   'stunEnd'      → {}
   *   'death'        → {}
   *   'comboReset'   → {}
   *
   * @param {string}   event
   * @param {Function} cb
   */
  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }

  off(event, cb) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(fn => fn !== cb);
  }

  // ─── Privados ────────────────────────────────────────────────────────────

  _receiveHit(attackType, attacker) {
    const blocked = this._canBlock();

    // Daño
    let damage;
    let knockback;
    if (blocked) {
      damage   = attackType === 'punch' ? CombatSystem.DMG_PUNCH_BLOCK : CombatSystem.DMG_KICK_BLOCK;
      knockback = 0;
    } else {
      damage    = attackType === 'punch' ? CombatSystem.DMG_PUNCH : CombatSystem.DMG_KICK;
      knockback = attackType === 'punch' ? CombatSystem.KNOCKBACK_PUNCH : CombatSystem.KNOCKBACK_KICK;
    }

    this.hp = Math.max(0, this.hp - damage);

    // Combo recibido (solo cuando NO bloquea)
    if (!blocked) {
      this.comboHitsReceived++;
      this.comboResetTimer = CombatSystem.COMBO_RESET_TIME;

      // Stun escalado
      const stunDuration = this._calcStunDuration(this.comboHitsReceived);
      this._applyStun(stunDuration);
    }

    // Guardia: absorber daño de guardia si está bloqueando
    if (blocked) {
      const guardDamage = attackType === 'punch' ? 20 : 28;
      this.guard = Math.max(0, this.guard - guardDamage);
      if (this.guard <= 0 && !this.guardBroken) {
        this._breakGuard();
      }
    }

    // Combo infligido (en el atacante)
    attacker.comboHitsLanded++;
    attacker.comboDisplayTimer = 2.5;
    attacker._emit('comboLanded', { count: attacker.comboHitsLanded });

    // Emitir evento al receptor del golpe
    this._emit('hit', { attackType, blocked, damage, knockback });

    // Muerte
    if (this.hp <= 0 && !this.isDead) {
      this.isDead = true;
      this._emit('death');
    }
  }

  _canBlock() {
    // No puede bloquear si está stunned, si la guardia está rota, o si está muerto
    return !this.isStunned && !this.guardBroken;
    // Nota: Player.js pasa isBlocking al update(); aquí asumimos que
    // el estado 'estaCubriendose' de Player ya fue verificado antes
    // de llamar a landHit(). Ver integración en Player.js.
  }

  _breakGuard() {
    this.guardBroken = true;
    this.guard = 0;
    this._applyStun(CombatSystem.GUARD_BREAK_STUN);
    this._emit('guardBroken');
  }

  _applyStun(duration) {
    const capped = Math.min(duration, CombatSystem.STUN_MAX_DURATION);
    // Si ya está stunned, extender solo si el nuevo stun es mayor
    if (!this.isStunned || capped > this.stunTimer) {
      this.isStunned = true;
      this.stunTimer = capped;
      this._emit('stunStart', { duration: capped });
    }
  }

  _calcStunDuration(hitCount) {
    const table = CombatSystem.STUN_TABLE;
    let duration = table[0].duration;
    for (let i = table.length - 1; i >= 0; i--) {
      if (hitCount >= table[i].hitsNeeded) {
        duration = table[i].duration;
        break;
      }
    }
    return duration;
  }

  _emit(event, data = {}) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach(fn => fn(data));
  }
}