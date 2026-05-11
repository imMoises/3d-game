export class CombatSystem {
  // ─── Constantes de diseño ────────────────────────────────────────────────

  static HP_MAX           = 100;

  // Guardia
  static GUARD_MAX        = 100;
  static GUARD_DRAIN_RATE = 18;
  static GUARD_REGEN_RATE = 14;
  static GUARD_BREAK_STUN = 1.2;

  // Daño base
  static DMG_PUNCH        = 8;
  static DMG_KICK         = 12;
  static DMG_PUNCH_BLOCK  = 2;
  static DMG_KICK_BLOCK   = 3;

  // Stun por hits consecutivos
  static STUN_TABLE = [
    { hitsNeeded: 1, duration: 0.35 },
    { hitsNeeded: 2, duration: 0.50 },
    { hitsNeeded: 3, duration: 0.65 },
    { hitsNeeded: 4, duration: 0.85 },
  ];
  static COMBO_RESET_TIME  = 1.8;
  static STUN_MAX_DURATION = 1.2;

  // ─── Rangos de golpe ─────────────────────────────────────────────────────
  // Rango base: solo se usa fuera de la ventana de frames activos
  static PUNCH_RANGE          = 10;
  static KICK_RANGE           = 20;
  // Rango extendido: activo durante la ventana de animación (20%–75% del clip)
  // Permite que el golpe conecte sin estar encima del rival
  static PUNCH_RANGE_EXTENDED = 3.8;
  static KICK_RANGE_EXTENDED  = 4.5;

  // Knockback
  static KNOCKBACK_PUNCH = 0.6;
  static KNOCKBACK_KICK  = 1.0;

  // ─── Constructor ─────────────────────────────────────────────────────────

  constructor(id) {
    this.id = id;

    this.hp     = CombatSystem.HP_MAX;
    this.isDead = false;

    this.guard       = CombatSystem.GUARD_MAX;
    this.guardBroken = false;

    this.isStunned = false;
    this.stunTimer = 0;

    // Flag que Player.js escribe antes de llamar landHit
    // para que _canBlock() sepa si el rival realmente está bloqueando
    this.isBlocking = false;

    this.comboHitsReceived = 0;
    this.comboResetTimer   = 0;
    this.comboHitsLanded   = 0;
    this.comboDisplayTimer = 0;

    this._listeners = {};
  }

  // ─── Update ──────────────────────────────────────────────────────────────

  update(deltaTime, isBlocking) {
    if (this.isDead) return;

    // Sincronizar el flag de bloqueo para que _canBlock() lo use
    this.isBlocking = isBlocking;

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
      this.guard = Math.min(
        CombatSystem.GUARD_MAX,
        this.guard + (CombatSystem.GUARD_REGEN_RATE * 0.4) * deltaTime
      );
      if (this.guard >= CombatSystem.GUARD_MAX * 0.3) {
        this.guardBroken = false;
        this._emit('guardRestored');
      }
    }

    // Reset combo recibido
    if (this.comboHitsReceived > 0) {
      this.comboResetTimer -= deltaTime;
      if (this.comboResetTimer <= 0) {
        this.comboHitsReceived = 0;
      }
    }

    // Timer de display combo infligido
    if (this.comboHitsLanded > 0) {
      this.comboDisplayTimer -= deltaTime;
      if (this.comboDisplayTimer <= 0) {
        this.comboHitsLanded   = 0;
        this.comboDisplayTimer = 0;
        this._emit('comboReset');
      }
    }
  }

  // ─── landHit ─────────────────────────────────────────────────────────────

  /**
   * Intenta conectar un golpe sobre el objetivo.
   *
   * @param {'punch'|'kick'} attackType
   * @param {number}         distanceX              Distancia absoluta en X entre jugadores
   * @param {CombatSystem}   target                 CombatSystem del rival
   * @param {boolean}        attackerIsInActiveFrames
   *   true  → usar rango extendido (ventana activa de la animación, 20%–75%)
   *   false → usar rango base (startup o recovery, prácticamente no conecta)
   *
   * @returns {{ hit: boolean, blocked: boolean } | false}
   */
  landHit(attackType, distanceX, target, attackerIsInActiveFrames = false) {
    if (target.isDead) return { hit: false, blocked: false };

    // Seleccionar rango según si estamos en frames activos o no
    const baseRange     = attackType === 'punch'
      ? CombatSystem.PUNCH_RANGE
      : CombatSystem.KICK_RANGE;

    const extendedRange = attackType === 'punch'
      ? CombatSystem.PUNCH_RANGE_EXTENDED
      : CombatSystem.KICK_RANGE_EXTENDED;

    const effectiveRange = attackerIsInActiveFrames ? extendedRange : baseRange;

    if (distanceX > effectiveRange) return { hit: false, blocked: false };

    // Conectó — procesar en el receptor
    const blocked = target._receiveHit(attackType, this);
    return { hit: true, blocked };
  }

  // ─── getState ────────────────────────────────────────────────────────────

  getState() {
    return {
      hp:           this.hp,
      hpPercent:    this.hp / CombatSystem.HP_MAX,
      guard:        this.guard,
      guardPercent: this.guard / CombatSystem.GUARD_MAX,
      guardBroken:  this.guardBroken,
      isStunned:    this.isStunned,
      isDead:       this.isDead,
      comboLanded:  this.comboHitsLanded,
    };
  }

  // ─── Eventos ─────────────────────────────────────────────────────────────

  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }

  off(event, cb) {
    if (!this._listeners[event]) return;
    this._listeners[event] = this._listeners[event].filter(fn => fn !== cb);
  }

  // ─── Privados ────────────────────────────────────────────────────────────

  /**
   * Procesa el golpe en el receptor. Devuelve true si fue bloqueado.
   */
  _receiveHit(attackType, attacker) {
    const blocked = this._canBlock();

    let damage;
    let knockback;

    if (blocked) {
      damage    = attackType === 'punch' ? CombatSystem.DMG_PUNCH_BLOCK : CombatSystem.DMG_KICK_BLOCK;
      knockback = 0;
    } else {
      damage    = attackType === 'punch' ? CombatSystem.DMG_PUNCH : CombatSystem.DMG_KICK;
      knockback = attackType === 'punch' ? CombatSystem.KNOCKBACK_PUNCH : CombatSystem.KNOCKBACK_KICK;
    }

    this.hp = Math.max(0, this.hp - damage);

    if (!blocked) {
      this.comboHitsReceived++;
      this.comboResetTimer = CombatSystem.COMBO_RESET_TIME;
      this._applyStun(this._calcStunDuration(this.comboHitsReceived));
    }

    if (blocked) {
      const guardDamage = attackType === 'punch' ? 20 : 28;
      this.guard = Math.max(0, this.guard - guardDamage);
      if (this.guard <= 0 && !this.guardBroken) {
        this._breakGuard();
      }
    }

    attacker.comboHitsLanded++;
    attacker.comboDisplayTimer = 2.5;
    attacker._emit('comboLanded', { count: attacker.comboHitsLanded });

    this._emit('hit', { attackType, blocked, damage, knockback });

    if (this.hp <= 0 && !this.isDead) {
      this.isDead = true;
      this._emit('death');
    }

    return blocked;
  }

  /**
   * Ahora lee this.isBlocking que se sincroniza en update() cada frame.
   * El bloqueo falla si está stunned, guardia rota, o simplemente no está bloqueando.
   */
  _canBlock() {
    return this.isBlocking && !this.isStunned && !this.guardBroken;
  }

  _breakGuard() {
    this.guardBroken = true;
    this.guard = 0;
    this._applyStun(CombatSystem.GUARD_BREAK_STUN);
    this._emit('guardBroken');
  }

  _applyStun(duration) {
    const capped = Math.min(duration, CombatSystem.STUN_MAX_DURATION);
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