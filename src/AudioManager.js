/**
 * AudioManager.js
 *
 * Gestor sencillo de efectos de sonido para el juego.
 * - Permite registrar múltiples sonidos bajo un nombre (variantes aleatorias).
 * - Usa HTMLAudioElement con cloneNode() para permitir solapamiento.
 * - Maneja "unlock" del audio en el primer gesto del usuario.
 *
 * Uso:
 *   import { Audio } from './AudioManager.js';
 *   Audio.register('punch_hit', 'assets/audios/FistHit.ogg', { volume: 0.9 });
 *   Audio.play('punch_hit');
 */

class _AudioManager {
  constructor() {
    this._banks   = {};   // name -> [{ template: HTMLAudioElement, volume }]
    this._master  = 0.7;
    this._enabled = true;
    this._unlocked = false;

    // Desbloquear el audio tras el primer gesto del usuario
    // (algunos navegadores bloquean audio sin interacción).
    if (typeof document !== 'undefined') {
      const unlock = () => {
        this._unlocked = true;
        document.removeEventListener('keydown', unlock);
        document.removeEventListener('mousedown', unlock);
        document.removeEventListener('touchstart', unlock);
      };
      document.addEventListener('keydown', unlock, { once: true });
      document.addEventListener('mousedown', unlock, { once: true });
      document.addEventListener('touchstart', unlock, { once: true });
    }
  }

  /**
   * Registra un sonido bajo un nombre. Si se llama varias veces con el mismo
   * nombre, las URLs se acumulan como variantes y se eligen aleatoriamente.
   *
   * @param {string} name
   * @param {string} url
   * @param {object} [opts]   { volume?: number 0..1 }
   */
  register(name, url, opts = {}) {
    const volume = typeof opts.volume === 'number' ? opts.volume : 1.0;
    const template = new window.Audio();
    template.src      = url;
    template.preload  = 'auto';
    template.volume   = this._clamp01(volume * this._master);

    if (!this._banks[name]) this._banks[name] = [];
    this._banks[name].push({ template, volume });
  }

  /**
   * Reproduce un sonido. Si hay varias variantes, se elige al azar.
   * Cada llamada genera una nueva instancia para permitir solapamiento.
   */
  play(name) {
    if (!this._enabled) return;
    const bank = this._banks[name];
    if (!bank || bank.length === 0) return;

    const variant = bank[Math.floor(Math.random() * bank.length)];
    try {
      const instance = variant.template.cloneNode(true);
      instance.volume = this._clamp01(variant.volume * this._master);
      const p = instance.play();
      if (p && typeof p.then === 'function') p.catch(() => { /* autoplay bloqueado, ignorar */ });
    } catch (_) {
      /* ignorar errores de reproducción */
    }
  }

  setMasterVolume(v) { this._master = this._clamp01(v); }
  setEnabled(b)      { this._enabled = !!b; }

  _clamp01(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
  }
}

// Singleton compartido
export const Audio = new _AudioManager();

/**
 * Registra los sonidos del juego. Llamar una sola vez al iniciar.
 */
export function initGameAudio(basePath = 'assets/audios/') {
  // Puños
  Audio.register('punch_hit',  basePath + 'FistHit.ogg',  { volume: 0.9 });
  Audio.register('punch_hit',  basePath + 'FistRHit.ogg', { volume: 0.9 }); // variante
  Audio.register('punch_miss', basePath + 'FistMiss.ogg', { volume: 0.8 });

  // Patadas
  Audio.register('kick_hit',   basePath + 'KickHit.ogg',  { volume: 1.0 });
  Audio.register('kick_hit',   basePath + 'KickSlid.ogg', { volume: 0.9 }); // variante
  Audio.register('kick_miss',  basePath + 'KickMiss.ogg', { volume: 0.85 });
}
