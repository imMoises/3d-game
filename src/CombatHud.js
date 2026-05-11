/**
 * CombatHUD.js
 *
 * UI de combate estilo Mortal Kombat.
 * Monta un overlay de HTML/CSS sobre el canvas de Three.js.
 *
 * Uso:
 *   const hud = new CombatHUD();
 *   hud.mount(document.getElementById('game-container'));
 *   // cada frame:
 *   hud.update(p1State, p2State);
 *
 * p1State / p2State son objetos que devuelve CombatSystem.getState():
 *   { hpPercent, guardPercent, guardBroken, isStunned, isDead, comboLanded }
 */

export class CombatHUD {

  constructor() {
    this._root       = null;
    this._p1Elements = {};
    this._p2Elements = {};
    this._built      = false;
  }

  // ─── Montar en el DOM ────────────────────────────────────────────────────

  mount(container) {
    this._injectStyles();

    this._root = document.createElement('div');
    this._root.id = 'combat-hud';

    this._root.innerHTML = `
      <!-- ── P1 (izquierda) ────────────────────────────────── -->
      <div class="fighter-hud fighter-hud--p1">
        <div class="fighter-name">JAMES</div>

        <div class="bars-wrapper bars-wrapper--p1">
          <!-- HP: se vacía de derecha a izquierda para P1 -->
          <div class="bar-track bar-track--hp">
            <div class="bar-fill bar-fill--hp" id="p1-hp"></div>
            <div class="bar-fill bar-fill--hp-damage" id="p1-hp-damage"></div>
          </div>
          <!-- Guardia -->
          <div class="bar-track bar-track--guard">
            <div class="bar-fill bar-fill--guard" id="p1-guard"></div>
          </div>
          <div class="guard-label" id="p1-guard-label">GUARDIA</div>
        </div>
      </div>

      <!-- ── Centro ────────────────────────────────────────── -->
      <div class="hud-center">
        <div class="round-timer" id="round-timer">99</div>
      </div>

      <!-- ── P2 (derecha) ───────────────────────────────────── -->
      <div class="fighter-hud fighter-hud--p2">
        <div class="fighter-name">P2</div>

        <div class="bars-wrapper bars-wrapper--p2">
          <div class="bar-track bar-track--hp">
            <div class="bar-fill bar-fill--hp" id="p2-hp"></div>
            <div class="bar-fill bar-fill--hp-damage" id="p2-hp-damage"></div>
          </div>
          <div class="bar-track bar-track--guard">
            <div class="bar-fill bar-fill--guard" id="p2-guard"></div>
          </div>
          <div class="guard-label" id="p2-guard-label">GUARDIA</div>
        </div>
      </div>

      <!-- ── Combo counter (global, centrado abajo) ─────────── -->
      <div class="combo-counter" id="combo-counter">
        <span class="combo-hits" id="combo-hits">0</span>
        <span class="combo-text">COMBO</span>
      </div>

      <!-- ── Mensajes de estado ──────────────────────────────── -->
      <div class="status-msg" id="status-msg"></div>
    `;

    container.appendChild(this._root);

    // Referencias rápidas P1
    this._p1Elements = {
      hp:          this._root.querySelector('#p1-hp'),
      hpDamage:    this._root.querySelector('#p1-hp-damage'),
      guard:       this._root.querySelector('#p1-guard'),
      guardLabel:  this._root.querySelector('#p1-guard-label'),
    };
    // Referencias rápidas P2
    this._p2Elements = {
      hp:          this._root.querySelector('#p2-hp'),
      hpDamage:    this._root.querySelector('#p2-hp-damage'),
      guard:       this._root.querySelector('#p2-guard'),
      guardLabel:  this._root.querySelector('#p2-guard-label'),
    };

    this._comboCounter = this._root.querySelector('#combo-counter');
    this._comboHits    = this._root.querySelector('#combo-hits');
    this._statusMsg    = this._root.querySelector('#status-msg');

    // Animación de daño HP retardada
    this._p1DamageTimer = null;
    this._p2DamageTimer = null;
    this._prevP1HP = 1;
    this._prevP2HP = 1;

    this._built = true;
  }

  // ─── Update (llamar cada frame) ──────────────────────────────────────────

  /**
   * @param {object} p1State  resultado de CombatSystem.getState() del P1
   * @param {object} p2State  resultado de CombatSystem.getState() del P2
   * @param {object} [opts]   { comboOwner: 'p1'|'p2'|null, statusText: string }
   */
  update(p1State, p2State, opts = {}) {
    if (!this._built) return;

    this._updateFighter(this._p1Elements, p1State, 'p1');
    this._updateFighter(this._p2Elements, p2State, 'p2');

    // Combo counter: mostrar el combo del atacante
    const comboOwner = opts.comboOwner;
    const comboCount = comboOwner === 'p1'
      ? p1State.comboLanded
      : comboOwner === 'p2'
        ? p2State.comboLanded
        : 0;

    if (comboCount >= 2) {
      this._comboHits.textContent = comboCount;
      this._comboCounter.classList.add('combo-counter--visible');
    } else {
      this._comboCounter.classList.remove('combo-counter--visible');
    }

    // Mensaje de estado (STUNNED, GUARD BREAK, KO…)
    if (opts.statusText) {
      this._statusMsg.textContent = opts.statusText;
      this._statusMsg.classList.add('status-msg--visible');
    } else {
      this._statusMsg.classList.remove('status-msg--visible');
    }
  }

  // ─── Privados ────────────────────────────────────────────────────────────

  _updateFighter(els, state, player) {
    // HP
    const hpPct = Math.max(0, Math.min(1, state.hpPercent));
    els.hp.style.width = `${hpPct * 100}%`;

    // Color de HP según cantidad
    if (hpPct > 0.5)       els.hp.style.background = 'var(--hp-high)';
    else if (hpPct > 0.25) els.hp.style.background = 'var(--hp-mid)';
    else                   els.hp.style.background = 'var(--hp-low)';

    // Barra de daño retardada (se va achicando lento después de recibir daño)
    const prevKey = player === 'p1' ? '_prevP1HP' : '_prevP2HP';
    const timerKey = player === 'p1' ? '_p1DamageTimer' : '_p2DamageTimer';
    if (hpPct < this[prevKey]) {
      // HP bajó: mostrar barra de daño al nivel anterior, luego animar
      els.hpDamage.style.width = `${this[prevKey] * 100}%`;
      clearTimeout(this[timerKey]);
      this[timerKey] = setTimeout(() => {
        els.hpDamage.style.transition = 'width 0.7s ease';
        els.hpDamage.style.width = `${hpPct * 100}%`;
        setTimeout(() => { els.hpDamage.style.transition = ''; }, 750);
      }, 400);
      this[prevKey] = hpPct;
    }

    // Guardia
    const gPct = Math.max(0, Math.min(1, state.guardPercent));
    els.guard.style.width = `${gPct * 100}%`;

    if (state.guardBroken) {
      els.guard.style.background = 'var(--guard-broken)';
      els.guardLabel.textContent  = '¡GUARDIA ROTA!';
      els.guardLabel.classList.add('guard-label--broken');
    } else {
      els.guard.style.background = gPct < 0.3
        ? 'var(--guard-low)'
        : 'var(--guard-normal)';
      els.guardLabel.textContent  = 'GUARDIA';
      els.guardLabel.classList.remove('guard-label--broken');
    }
  }

  // ─── Estilos ─────────────────────────────────────────────────────────────

  _injectStyles() {
    if (document.getElementById('combat-hud-styles')) return;

    const style = document.createElement('style');
    style.id = 'combat-hud-styles';
    style.textContent = `
      /* ── Variables ─────────────────────────────────────────── */
      :root {
        --hp-high:        #22dd55;
        --hp-mid:         #f5c400;
        --hp-low:         #e83030;
        --hp-damage:      #cc3300;
        --guard-normal:   #3ab4f2;
        --guard-low:      #f09030;
        --guard-broken:   #888;
        --bar-bg:         rgba(0,0,0,0.55);
        --bar-border:     rgba(255,255,255,0.18);
        --hud-font:       'Impact', 'Arial Black', sans-serif;
      }

      /* ── Overlay ────────────────────────────────────────────── */
      #combat-hud {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        pointer-events: none;
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        padding: 14px 18px 0;
        box-sizing: border-box;
        z-index: 10;
        font-family: var(--hud-font);
        user-select: none;
      }

      /* ── Bloques de luchador ─────────────────────────────────── */
      .fighter-hud {
        display: flex;
        flex-direction: column;
        gap: 5px;
        width: 38%;
      }

      .fighter-name {
        font-size: 13px;
        letter-spacing: 3px;
        color: #fff;
        text-shadow: 0 0 8px rgba(0,0,0,0.9);
        text-transform: uppercase;
      }
      .fighter-hud--p2 .fighter-name { text-align: right; }

      /* ── Wrapper de barras ───────────────────────────────────── */
      .bars-wrapper { display: flex; flex-direction: column; gap: 4px; }

      /* P1: barras van de izq. a der. (transform: none)  */
      /* P2: barras van de der. a izq. (invertir con scaleX) */
      .bars-wrapper--p2 { transform: scaleX(-1); }

      /* ── Pista de barra ──────────────────────────────────────── */
      .bar-track {
        position: relative;
        width: 100%;
        background: var(--bar-bg);
        border: 1px solid var(--bar-border);
        border-radius: 2px;
        overflow: hidden;
      }
      .bar-track--hp    { height: 22px; }
      .bar-track--guard { height: 10px; }

      /* ── Relleno de barra ────────────────────────────────────── */
      .bar-fill {
        position: absolute;
        top: 0; left: 0;
        height: 100%;
        border-radius: 2px;
        transition: width 0.08s linear;
      }
      .bar-fill--hp {
        background: var(--hp-high);
        z-index: 2;
      }
      .bar-fill--hp-damage {
        background: var(--hp-damage);
        opacity: 0.7;
        z-index: 1;
      }
      .bar-fill--guard {
        background: var(--guard-normal);
        z-index: 2;
        transition: width 0.12s linear, background 0.3s;
      }

      /* ── Etiqueta de guardia ─────────────────────────────────── */
      .guard-label {
        font-size: 9px;
        letter-spacing: 2px;
        color: rgba(255,255,255,0.55);
        text-transform: uppercase;
        margin-top: -2px;
      }
      .guard-label--broken {
        color: #ff4444;
        animation: guardBrokenPulse 0.4s ease infinite alternate;
      }
      @keyframes guardBrokenPulse {
        from { opacity: 1; }
        to   { opacity: 0.4; }
      }

      /* ── Centro / timer ──────────────────────────────────────── */
      .hud-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        flex-shrink: 0;
        padding-top: 2px;
      }
      .round-timer {
        font-size: 36px;
        color: #fff;
        text-shadow: 0 2px 12px rgba(0,0,0,0.8), 0 0 20px rgba(255,160,0,0.4);
        letter-spacing: -1px;
        line-height: 1;
        min-width: 54px;
        text-align: center;
      }

      /* ── Combo counter ───────────────────────────────────────── */
      .combo-counter {
        position: absolute;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%) scale(0.6);
        display: flex;
        flex-direction: column;
        align-items: center;
        opacity: 0;
        transition: opacity 0.15s, transform 0.15s;
        pointer-events: none;
      }
      .combo-counter--visible {
        opacity: 1;
        transform: translateX(-50%) scale(1);
      }
      .combo-hits {
        font-size: 72px;
        color: #fff;
        text-shadow:
          0 0 20px rgba(255,80,0,0.9),
          0 0 40px rgba(255,80,0,0.5),
          2px 2px 0 #c00;
        line-height: 1;
        animation: comboHitPop 0.12s ease;
      }
      .combo-text {
        font-size: 16px;
        letter-spacing: 6px;
        color: #f90;
        text-shadow: 0 0 10px rgba(255,140,0,0.8);
        text-transform: uppercase;
        margin-top: -6px;
      }
      @keyframes comboHitPop {
        0%   { transform: scale(1.4); }
        100% { transform: scale(1);   }
      }

      /* ── Mensaje de estado ───────────────────────────────────── */
      .status-msg {
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%) scale(0.8);
        font-size: 28px;
        letter-spacing: 6px;
        color: #fff;
        text-shadow: 0 0 30px rgba(255,0,0,0.8), 2px 2px 0 #900;
        opacity: 0;
        transition: opacity 0.1s, transform 0.1s;
        text-align: center;
        text-transform: uppercase;
        pointer-events: none;
        white-space: nowrap;
      }
      .status-msg--visible {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
    `;

    document.head.appendChild(style);
  }
}