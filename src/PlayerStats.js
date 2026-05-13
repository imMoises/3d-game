/**
 * PlayerStats.js
 *
 * Stats persistentes por jugador.
 * Vive durante el modo RPG (donde se gana XP y monedas) y se aplica al
 * CombatSystem cuando se transiciona al combate 1v1.
 *
 * El "árbol de habilidades" se define aquí como constantes: cada nodo tiene
 * un costo en monedas, un efecto (bonus aditivo a un stat) y un prerrequisito
 * opcional (id de otro nodo que debe estar comprado antes).
 */

import { CombatSystem } from './CombatSystem.js';

// ─── Árbol de habilidades ─────────────────────────────────────────────────────
// id          : único, también es la "clave" del nodo
// branch      : agrupador visual (3 ramas)
// requires    : nodo previo necesario (o null si es raíz de rama)
// cost        : monedas para comprarlo
// effect      : función que recibe los stats y aplica el bonus
export const SKILL_TREE = [
  // ── Rama VITALIDAD ──
  { id: 'vit1', branch: 'vitalidad', label: '+25 HP',    cost: 10, requires: null,   effect: (s) => { s.hp_max += 25; } },
  { id: 'vit2', branch: 'vitalidad', label: '+40 HP',    cost: 20, requires: 'vit1', effect: (s) => { s.hp_max += 40; } },
  { id: 'vit3', branch: 'vitalidad', label: 'Regen lento',cost: 35, requires: 'vit2',effect: (s) => { s.hp_regen += 1.0; } },

  // ── Rama FUERZA (puño) ──
  { id: 'str1', branch: 'fuerza',    label: '+3 Puño',    cost: 10, requires: null,   effect: (s) => { s.dmg_punch += 3; } },
  { id: 'str2', branch: 'fuerza',    label: '+5 Puño',    cost: 20, requires: 'str1', effect: (s) => { s.dmg_punch += 5; } },
  { id: 'str3', branch: 'fuerza',    label: 'Knockback +',cost: 30, requires: 'str2', effect: (s) => { s.knockback_bonus += 0.6; } },

  // ── Rama TÉCNICA (patada) ──
  { id: 'tec1', branch: 'tecnica',   label: '+4 Patada',  cost: 12, requires: null,   effect: (s) => { s.dmg_kick += 4; } },
  { id: 'tec2', branch: 'tecnica',   label: '+7 Patada',  cost: 22, requires: 'tec1', effect: (s) => { s.dmg_kick += 7; } },
  { id: 'tec3', branch: 'tecnica',   label: 'Velocidad +',cost: 30, requires: 'tec2', effect: (s) => { s.speed_bonus += 4; } },
];

export function getSkillById(id) {
  return SKILL_TREE.find((n) => n.id === id);
}

// ─────────────────────────────────────────────────────────────────────────────

export class PlayerStats {

  constructor(id) {
    this.id = id;

    // Valores base — se modifican al comprar skills
    this.hp_max          = CombatSystem.HP_MAX;       // 100
    this.dmg_punch       = CombatSystem.DMG_PUNCH;    // 8
    this.dmg_kick        = CombatSystem.DMG_KICK;     // 12
    this.knockback_bonus = 0;
    this.speed_bonus     = 0;
    this.hp_regen        = 0;

    // HP actual durante el modo RPG (puede bajar al recibir daño de enemigos)
    this.hp_current      = this.hp_max;

    // Monedas recogidas
    this.coins           = 0;

    // Skills compradas (Set de ids)
    this.unlocked        = new Set();

    // Listeners (para que la UI reaccione a cambios)
    this._listeners      = {};
  }

  // ─── Eventos ─────────────────────────────────────────────────────────────
  on(event, cb) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(cb);
  }
  _emit(event, data = {}) {
    if (!this._listeners[event]) return;
    this._listeners[event].forEach((fn) => fn(data));
  }

  // ─── Monedas ─────────────────────────────────────────────────────────────
  addCoins(n) {
    this.coins += n;
    this._emit('coinsChanged', { coins: this.coins });
  }

  spendCoins(n) {
    if (this.coins < n) return false;
    this.coins -= n;
    this._emit('coinsChanged', { coins: this.coins });
    return true;
  }

  // ─── HP en modo RPG ──────────────────────────────────────────────────────
  takeDamage(dmg) {
    this.hp_current = Math.max(0, this.hp_current - dmg);
    this._emit('hpChanged', { hp: this.hp_current, max: this.hp_max });
    if (this.hp_current === 0) this._emit('died');
  }

  heal(amount) {
    this.hp_current = Math.min(this.hp_max, this.hp_current + amount);
    this._emit('hpChanged', { hp: this.hp_current, max: this.hp_max });
  }

  tickRegen(delta) {
    if (this.hp_regen > 0 && this.hp_current > 0 && this.hp_current < this.hp_max) {
      this.heal(this.hp_regen * delta);
    }
  }

  // ─── Skill tree ──────────────────────────────────────────────────────────
  canBuy(skillId) {
    const node = getSkillById(skillId);
    if (!node) return false;
    if (this.unlocked.has(skillId)) return false;
    if (node.requires && !this.unlocked.has(node.requires)) return false;
    if (this.coins < node.cost) return false;
    return true;
  }

  buy(skillId) {
    if (!this.canBuy(skillId)) return false;
    const node = getSkillById(skillId);
    this.spendCoins(node.cost);
    this.unlocked.add(skillId);
    node.effect(this);
    // Si compró +HP, también recuperamos algo de vida
    this.hp_current = Math.min(this.hp_current + 15, this.hp_max);
    this._emit('skillUnlocked', { id: skillId, node });
    this._emit('statsChanged', this.snapshot());
    return true;
  }

  // ─── Snapshot para HUD ───────────────────────────────────────────────────
  snapshot() {
    return {
      hp_max:    this.hp_max,
      hp_current:this.hp_current,
      dmg_punch: this.dmg_punch,
      dmg_kick:  this.dmg_kick,
      coins:     this.coins,
      unlocked:  [...this.unlocked],
      hp_regen:  this.hp_regen,
      knockback_bonus: this.knockback_bonus,
      speed_bonus:     this.speed_bonus,
    };
  }

  // ─── Aplicar al CombatSystem al transicionar a combate ───────────────────
  applyToCombatSystem(combat) {
    // Sobrescribir HP_MAX no es trivial porque es static. Solución: setear hp
    // directamente y guardar el "techo personalizado" en una propiedad ad-hoc.
    combat._hpMaxOverride = this.hp_max;
    combat.hp = this.hp_max;

    // Bonus de daño: igual via propiedades ad-hoc que el CombatSystem
    // consultará al calcular damage. (Ver patch en CombatSystem.)
    combat._dmgPunchOverride = this.dmg_punch;
    combat._dmgKickOverride  = this.dmg_kick;
    combat._knockbackBonus   = this.knockback_bonus;
  }
}
