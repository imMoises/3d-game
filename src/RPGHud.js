/**
 * RPGHud.js
 *
 * HUD del modo RPG. Se monta una vez y se actualiza cada frame.
 * Estructura:
 *   ┌────────────────────────────────┬────────────────────────────────┐
 *   │  P1 panel                     │  P2 panel                      │
 *   │   • HP bar                    │   • HP bar                     │
 *   │   • Monedas + daño            │   • Monedas + daño             │
 *   │   • Minimapa (canvas)         │   • Minimapa (canvas)          │
 *   │   • Menú de mejoras (modal)   │   • Menú de mejoras (modal)    │
 *   └────────────────────────────────┴────────────────────────────────┘
 *
 * Bottom-center: hint "Pulsa R cerca del otro jugador para combatir".
 */

import { RPG_WORLD_RADIUS } from './RPGWorld.js';
import { SKILL_TREE }       from './PlayerStats.js';

export class RPGHud {

  constructor() {
    this._root = null;
    this._built = false;
    this._panels = {};
    this._menuSelection = { p1: 0, p2: 0 };
  }

  mount(container) {
    this._injectStyles();
    this._root = document.createElement('div');
    this._root.id = 'rpg-hud';
    this._root.innerHTML = `
      <div class="rpg-half rpg-half--p1">
        ${this._panelHTML('p1', 'JUGADOR 1')}
      </div>
      <div class="rpg-divider"></div>
      <div class="rpg-half rpg-half--p2">
        ${this._panelHTML('p2', 'JUGADOR 2')}
      </div>
      <div class="rpg-bottom-hint" id="rpg-bottom-hint">
        Pulsa <b>R</b> cerca del otro jugador para iniciar el combate 1v1
      </div>
    `;
    container.appendChild(this._root);

    for (const key of ['p1', 'p2']) {
      this._panels[key] = {
        root:        this._root.querySelector(`.rpg-half--${key}`),
        hpFill:      this._root.querySelector(`#${key}-hp-fill`),
        hpText:      this._root.querySelector(`#${key}-hp-text`),
        coins:       this._root.querySelector(`#${key}-coins`),
        dmgPunch:    this._root.querySelector(`#${key}-dmg-punch`),
        dmgKick:     this._root.querySelector(`#${key}-dmg-kick`),
        minimap:     this._root.querySelector(`#${key}-minimap`),
        menu:        this._root.querySelector(`#${key}-menu`),
        menuList:    this._root.querySelector(`#${key}-menu-list`),
        hint:        this._root.querySelector(`#${key}-hint`),
      };
      this._panels[key].ctx = this._panels[key].minimap.getContext('2d');
    }

    this._built = true;
  }

  _panelHTML(key, title) {
    return `
      <div class="rpg-panel">
        <div class="rpg-panel-top">
          <div class="rpg-panel-title">${title}</div>
          <div class="rpg-hp-row">
            <div class="rpg-hp-track">
              <div class="rpg-hp-fill" id="${key}-hp-fill"></div>
            </div>
            <div class="rpg-hp-text" id="${key}-hp-text">100 / 100</div>
          </div>
          <div class="rpg-stats">
            <div class="rpg-stat"><span class="rpg-stat-ico">⛁</span> <span id="${key}-coins">0</span></div>
            <div class="rpg-stat"><span class="rpg-stat-ico">👊</span> <span id="${key}-dmg-punch">8</span></div>
            <div class="rpg-stat"><span class="rpg-stat-ico">🦵</span> <span id="${key}-dmg-kick">12</span></div>
          </div>
        </div>
        <canvas class="rpg-minimap" id="${key}-minimap" width="200" height="200"></canvas>
        <div class="rpg-hint" id="${key}-hint">Pulsa <b>E</b> para mejorar</div>

        <div class="rpg-menu" id="${key}-menu">
          <div class="rpg-menu-title">MEJORAS</div>
          <div class="rpg-menu-list" id="${key}-menu-list"></div>
          <div class="rpg-menu-foot">
            <span>↑/↓ Navegar · <b>${key === 'p1' ? 'J' : 'A'}</b> Comprar · <b>${key === 'p1' ? 'E' : 'X'}</b> Cerrar</span>
          </div>
        </div>
      </div>
    `;
  }

  // ─── Update por frame ────────────────────────────────────────────────────
  /**
   * @param {object} state  {
   *   p1: { stats, position },
   *   p2: { stats, position },
   *   enemies: [{ position, type, hp, maxHp }],
   *   coins:   [{ position }],
   *   menuOpen: { p1: bool, p2: bool },
   *   menuSelection: { p1: number, p2: number },
   *   playersClose: bool,
   * }
   */
  update(state) {
    if (!this._built) return;

    for (const key of ['p1', 'p2']) {
      const p = state[key];
      if (!p) continue;
      this._updatePanel(key, p, state, state.menuOpen?.[key], state.menuSelection?.[key] ?? 0);
    }

    // Hint inferior: cambia de color cuando los jugadores están cerca
    const hint = this._root.querySelector('#rpg-bottom-hint');
    if (hint) {
      hint.classList.toggle('rpg-bottom-hint--ready', !!state.playersClose);
    }
  }

  _updatePanel(key, player, world, menuOpen, menuSelection) {
    const els = this._panels[key];
    if (!els) return;

    const stats = player.stats;
    if (!stats) return;

    const hpPct = Math.max(0, Math.min(1, stats.hp_current / stats.hp_max));
    els.hpFill.style.width = `${hpPct * 100}%`;
    els.hpText.textContent = `${Math.round(stats.hp_current)} / ${stats.hp_max}`;
    if (hpPct > 0.5)        els.hpFill.style.background = 'var(--hp-high)';
    else if (hpPct > 0.25)  els.hpFill.style.background = 'var(--hp-mid)';
    else                    els.hpFill.style.background = 'var(--hp-low)';

    els.coins.textContent    = stats.coins;
    els.dmgPunch.textContent = stats.dmg_punch;
    els.dmgKick.textContent  = stats.dmg_kick;

    this._drawMinimap(key, player, world);

    // Menú
    if (menuOpen) {
      els.menu.classList.add('rpg-menu--visible');
      this._renderMenuList(key, stats, menuSelection);
    } else {
      els.menu.classList.remove('rpg-menu--visible');
    }

    // Hint contextual
    if (world.playersClose && !menuOpen) {
      els.hint.innerHTML = `Pulsa <b>R</b> para iniciar el combate 1v1`;
      els.hint.classList.add('rpg-hint--ready');
    } else if (menuOpen) {
      els.hint.innerHTML = `Menú abierto`;
      els.hint.classList.remove('rpg-hint--ready');
    } else {
      els.hint.innerHTML = `Pulsa <b>${key === 'p1' ? 'E' : 'X'}</b> para mejorar`;
      els.hint.classList.remove('rpg-hint--ready');
    }
  }

  // ─── Minimapa ────────────────────────────────────────────────────────────
  _drawMinimap(key, player, world) {
    const els = this._panels[key];
    const ctx = els.ctx;
    if (!ctx) return;
    const W = els.minimap.width;
    const H = els.minimap.height;
    ctx.clearRect(0, 0, W, H);

    // Fondo
    ctx.fillStyle = 'rgba(15,22,18,0.85)';
    ctx.fillRect(0, 0, W, H);

    // Centro del minimapa = posición del jugador
    const pos = player.position;
    if (!pos) return;

    // Escala: el minimapa muestra un radio fijo alrededor del jugador
    const VIEW_RADIUS = 35;
    const k = (W * 0.5) / VIEW_RADIUS;

    const worldToMinimap = (wx, wz) => {
      const dx = (wx - pos.x) * k;
      const dz = (wz - pos.z) * k;
      return { x: W * 0.5 + dx, y: H * 0.5 + dz };
    };

    // Anillo de límite del mundo (visible cuando estás cerca del borde)
    ctx.strokeStyle = 'rgba(255, 213, 79, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    const worldRingCenter = worldToMinimap(0, 0);
    ctx.arc(worldRingCenter.x, worldRingCenter.y, RPG_WORLD_RADIUS * k, 0, Math.PI * 2);
    ctx.stroke();

    // Grilla suave
    ctx.strokeStyle = 'rgba(255,255,255,0.07)';
    ctx.lineWidth = 1;
    for (let i = -3; i <= 3; i++) {
      const x = W * 0.5 + i * 25;
      const y = H * 0.5 + i * 25;
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }

    // Monedas (puntos amarillos)
    ctx.fillStyle = '#ffd23f';
    for (const c of (world.coins || [])) {
      const p = worldToMinimap(c.position.x, c.position.z);
      if (this._inBounds(p, W, H)) {
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, Math.PI * 2); ctx.fill();
      }
    }

    // Enemigos (color por tipo)
    for (const e of (world.enemies || [])) {
      const p = worldToMinimap(e.position.x, e.position.z);
      if (!this._inBounds(p, W, H)) continue;
      ctx.fillStyle = e.type === 'strong' ? '#ff5252'
                    : e.type === 'fast'   ? '#ffca28'
                    :                       '#66bb6a';
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2); ctx.fill();
      // Anillo blanco para visibilidad
      ctx.strokeStyle = 'rgba(255,255,255,0.85)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Otro jugador
    const other = key === 'p1' ? world.p2 : world.p1;
    if (other?.position) {
      const op = worldToMinimap(other.position.x, other.position.z);
      ctx.fillStyle = '#42a5f5';
      ctx.beginPath();
      ctx.arc(op.x, op.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Jugador (siempre en el centro, color verde y dirección)
    ctx.fillStyle = '#4caf50';
    ctx.beginPath();
    ctx.arc(W * 0.5, H * 0.5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();
    // Indicador de dirección (vector forward XZ)
    if (player.forward && (player.forward.x || player.forward.z)) {
      const fx = player.forward.x * 12;
      const fz = player.forward.z * 12;
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(W * 0.5, H * 0.5);
      ctx.lineTo(W * 0.5 + fx, H * 0.5 + fz);
      ctx.stroke();
    }
  }

  _inBounds(p, W, H) {
    return p.x >= 0 && p.x <= W && p.y >= 0 && p.y <= H;
  }

  // ─── Menú de mejoras ─────────────────────────────────────────────────────
  _renderMenuList(key, stats, selection) {
    const list = this._panels[key].menuList;
    if (!list) return;

    // Construir items: skill tree con estado (locked/available/owned)
    const items = SKILL_TREE.map((node) => {
      const owned     = stats.unlocked.has(node.id);
      const prereqOK  = !node.requires || stats.unlocked.has(node.requires);
      const canAfford = stats.coins >= node.cost;
      const buyable   = !owned && prereqOK && canAfford;
      return { node, owned, prereqOK, buyable };
    });

    // Solo mostramos las skills compradas o desbloqueables (siguiente nivel)
    // para no abrumar al usuario.
    const displayable = items.filter(it =>
      it.owned || it.prereqOK
    );

    const sel = ((selection % displayable.length) + displayable.length) % displayable.length || 0;

    list.innerHTML = displayable.map((it, idx) => {
      const cls = [
        'rpg-skill',
        idx === sel ? 'rpg-skill--selected' : '',
        it.owned ? 'rpg-skill--owned' : '',
        !it.owned && it.buyable ? 'rpg-skill--buyable' : '',
        !it.owned && !it.buyable ? 'rpg-skill--locked' : '',
      ].filter(Boolean).join(' ');
      const status = it.owned ? '✔'
                  : it.buyable ? `⛁ ${it.node.cost}`
                  : `⛁ ${it.node.cost}`;
      return `
        <div class="${cls}">
          <span class="rpg-skill-branch rpg-skill-branch--${it.node.branch}">${it.node.branch[0].toUpperCase()}</span>
          <span class="rpg-skill-label">${it.node.label}</span>
          <span class="rpg-skill-cost">${status}</span>
        </div>
      `;
    }).join('') || `<div class="rpg-skill rpg-skill--locked">Sin mejoras disponibles</div>`;
  }

  /**
   * Devuelve la lista actualmente visible en el menú de un jugador.
   * Útil para que SceneManager decida qué nodo se compra al confirmar.
   */
  getMenuItems(key, stats) {
    return SKILL_TREE
      .map((node) => {
        const owned     = stats.unlocked.has(node.id);
        const prereqOK  = !node.requires || stats.unlocked.has(node.requires);
        return { node, owned, prereqOK };
      })
      .filter(it => it.owned || it.prereqOK);
  }

  // ─── Combate / RPG: visibilidad global ───────────────────────────────────
  setVisible(visible) {
    if (this._root) this._root.style.display = visible ? '' : 'none';
  }

  // ─── Estilos ─────────────────────────────────────────────────────────────
  _injectStyles() {
    if (document.getElementById('rpg-hud-styles')) return;
    const style = document.createElement('style');
    style.id = 'rpg-hud-styles';
    style.textContent = `
      #rpg-hud {
        position: absolute; inset: 0;
        display: flex;
        pointer-events: none;
        z-index: 9;
        font-family: 'Arial', sans-serif;
        color: #fff;
        user-select: none;
      }
      .rpg-half {
        flex: 1; position: relative;
        display: flex; align-items: flex-start; justify-content: space-between;
        padding: 14px;
      }
      .rpg-half--p2 { flex-direction: row-reverse; }
      .rpg-divider {
        width: 2px; background: rgba(255,255,255,0.45);
        box-shadow: 0 0 12px rgba(255,255,255,0.4);
      }

      .rpg-panel {
        width: 100%;
        display: flex; justify-content: space-between; align-items: flex-start;
        gap: 12px;
      }
      .rpg-half--p2 .rpg-panel { flex-direction: row-reverse; }

      .rpg-panel-top {
        background: rgba(0,0,0,0.55);
        border: 1px solid rgba(255,255,255,0.18);
        border-radius: 8px;
        padding: 10px 12px;
        min-width: 220px;
      }
      .rpg-panel-title {
        font-size: 12px; letter-spacing: 3px; opacity: 0.8;
        margin-bottom: 6px;
      }
      .rpg-hp-row { display: flex; align-items: center; gap: 8px; }
      .rpg-hp-track {
        flex: 1;
        height: 16px;
        background: rgba(0,0,0,0.7);
        border: 1px solid rgba(255,255,255,0.15);
        border-radius: 3px;
        overflow: hidden;
      }
      .rpg-hp-fill {
        height: 100%; width: 100%;
        background: var(--hp-high, #22dd55);
        transition: width 0.15s linear, background 0.3s;
      }
      .rpg-hp-text {
        font-size: 12px; min-width: 70px; text-align: right;
        font-variant-numeric: tabular-nums;
      }

      .rpg-stats {
        display: flex; gap: 12px; margin-top: 8px;
        font-size: 14px; font-weight: bold;
      }
      .rpg-stat { display: flex; align-items: center; gap: 4px; }
      .rpg-stat-ico { font-size: 16px; }

      .rpg-minimap {
        width: 200px; height: 200px;
        border: 2px solid rgba(255,255,255,0.35);
        border-radius: 8px;
        background: rgba(0,0,0,0.55);
        box-shadow: 0 0 12px rgba(0,0,0,0.4);
      }

      .rpg-hint {
        position: absolute;
        bottom: 16px;
        font-size: 13px;
        background: rgba(0,0,0,0.55);
        padding: 6px 10px;
        border-radius: 4px;
        letter-spacing: 1px;
        border: 1px solid rgba(255,255,255,0.15);
      }
      .rpg-half--p1 .rpg-hint { left: 14px; }
      .rpg-half--p2 .rpg-hint { right: 14px; }
      .rpg-hint--ready {
        background: rgba(255, 80, 0, 0.75);
        animation: rpgHintPulse 0.7s ease infinite alternate;
      }
      @keyframes rpgHintPulse { from {opacity:0.7;} to {opacity:1;} }

      .rpg-bottom-hint {
        position: absolute;
        bottom: 12px; left: 50%; transform: translateX(-50%);
        background: rgba(0,0,0,0.6);
        padding: 6px 14px; border-radius: 4px;
        font-size: 13px; letter-spacing: 1px;
        border: 1px solid rgba(255,255,255,0.15);
      }
      .rpg-bottom-hint--ready {
        background: rgba(255, 80, 0, 0.85);
        animation: rpgHintPulse 0.5s ease infinite alternate;
      }

      /* ── Menú de mejoras ────────────────────────────────────────── */
      .rpg-menu {
        position: absolute;
        top: 50%; left: 50%;
        transform: translate(-50%, -50%) scale(0.95);
        width: 340px;
        background: rgba(8,12,16,0.95);
        border: 2px solid rgba(255, 213, 79, 0.6);
        border-radius: 10px;
        box-shadow: 0 8px 30px rgba(0,0,0,0.6);
        padding: 14px 16px;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.12s, transform 0.12s;
      }
      .rpg-half--p1 .rpg-menu { left: 25%; }
      .rpg-half--p2 .rpg-menu { left: 75%; }

      .rpg-menu--visible {
        opacity: 1;
        transform: translate(-50%, -50%) scale(1);
      }
      .rpg-menu-title {
        font-size: 18px; letter-spacing: 5px;
        color: #ffd23f;
        text-align: center; margin-bottom: 10px;
      }
      .rpg-menu-list { display: flex; flex-direction: column; gap: 6px; }
      .rpg-skill {
        display: flex; align-items: center; gap: 10px;
        padding: 6px 8px;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 4px;
        font-size: 14px;
      }
      .rpg-skill--selected {
        border-color: #ffd23f; background: rgba(255,213,79,0.15);
        transform: translateX(3px);
      }
      .rpg-skill--owned    { opacity: 0.55; }
      .rpg-skill--owned .rpg-skill-cost { color: #66bb6a; }
      .rpg-skill--buyable .rpg-skill-cost { color: #ffd23f; }
      .rpg-skill--locked  .rpg-skill-cost { color: #888; }
      .rpg-skill-branch {
        display: inline-flex; align-items: center; justify-content: center;
        width: 22px; height: 22px; border-radius: 50%;
        font-size: 12px; font-weight: bold;
        background: #444;
      }
      .rpg-skill-branch--vitalidad { background: #2e7d32; }
      .rpg-skill-branch--fuerza    { background: #c62828; }
      .rpg-skill-branch--tecnica   { background: #1565c0; }
      .rpg-skill-label { flex: 1; }
      .rpg-skill-cost { font-variant-numeric: tabular-nums; }

      .rpg-menu-foot {
        margin-top: 10px;
        font-size: 11px;
        text-align: center;
        opacity: 0.7;
        letter-spacing: 1px;
      }
    `;
    document.head.appendChild(style);
  }
}
