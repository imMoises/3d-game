/**
 * AudioManager.js
 *
 * Gestor de efectos de sonido + música de fondo.
 *
 *  - Banco de SFX con variantes aleatorias por nombre.
 *  - Una sola pista de música en bucle a la vez (con swap automático).
 *  - Dos volúmenes maestros independientes:
 *      _master      → SFX
 *      _musicVolume → música de fondo (más bajo por defecto)
 *  - Desbloquea el audio en el primer gesto del usuario (algunos navegadores
 *    bloquean autoplay sin interacción).
 *
 * Uso:
 *   import { Audio } from './AudioManager.js';
 *   Audio.register('punch_hit', 'assets/audios/FistHit.ogg', { volume: 0.9 });
 *   Audio.play('punch_hit');
 *   Audio.playMusic('bgm_rpg');           // empieza la música en bucle
 *   Audio.setMusicVolume(0.4);            // 0..1, default 0.35
 */

class _AudioManager {
  constructor() {
    this._banks    = {};   // name -> [{ template: HTMLAudioElement, volume }]
    this._master   = 0.7;  // volumen maestro de SFX (0..1)

    // ── Música de fondo ─────────────────────────────────────────────────
    // Volumen general que se aplica a la música. Bajito por defecto para
    // que no tape los SFX. Modificable desde el juego con setMusicVolume().
    this._musicVolume   = 0.35;
    this._currentMusic  = null;   // { name, audio, baseVolume }
    this._pendingMusic  = null;   // { name, baseVolume } si autoplay bloqueado

    this._enabled = true;
    this._unlocked = false;

    // Desbloquear el audio tras el primer gesto del usuario, y si quedó
    // música pendiente por autoplay bloqueado, reanudarla.
    if (typeof document !== 'undefined') {
      const unlock = () => {
        this._unlocked = true;
        if (this._pendingMusic) {
          const p = this._pendingMusic;
          this._pendingMusic = null;
          this.playMusic(p.name, { volume: p.baseVolume });
        }
        document.removeEventListener('keydown', unlock);
        document.removeEventListener('mousedown', unlock);
        document.removeEventListener('touchstart', unlock);
      };
      document.addEventListener('keydown', unlock, { once: true });
      document.addEventListener('mousedown', unlock, { once: true });
      document.addEventListener('touchstart', unlock, { once: true });
    }
  }

  // ─── SFX ────────────────────────────────────────────────────────────────

  /**
   * Registra un sonido bajo un nombre. Múltiples llamadas con el mismo nombre
   * añaden variantes que se eligen al azar al reproducir.
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
   * Reproduce un SFX (se clona el Audio para permitir solapamiento).
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
      if (p && typeof p.then === 'function') p.catch(() => {});
    } catch (_) { /* ignorar */ }
  }

  setMasterVolume(v) { this._master = this._clamp01(v); }
  getMasterVolume()  { return this._master; }
  setEnabled(b)      { this._enabled = !!b; }

  // ─── Música de fondo ────────────────────────────────────────────────────

  /**
   * Reproduce una pista de música en bucle. Si ya está sonando la misma
   * pista no hace nada; si hay otra, la para antes de empezar.
   *
   * @param {string} name   nombre con el que se registró el track
   * @param {object} [opts] { volume?: número (override del volumen base) }
   */
  playMusic(name, opts = {}) {
    if (!this._enabled) return;
    const bank = this._banks[name];
    if (!bank || bank.length === 0) return;

    // Misma pista ya sonando → no reiniciar
    if (this._currentMusic?.name === name) return;

    this.stopMusic();

    const variant    = bank[0]; // música no usa variantes aleatorias
    const baseVolume = typeof opts.volume === 'number' ? opts.volume : variant.volume;

    try {
      const audio = variant.template.cloneNode(true);
      audio.loop   = true;
      audio.volume = this._clamp01(baseVolume * this._musicVolume);

      const p = audio.play();
      if (p && typeof p.then === 'function') {
        p.catch(() => {
          // Autoplay bloqueado → guardar como pendiente y reanudar en unlock
          this._pendingMusic = { name, baseVolume };
        });
      }
      this._currentMusic = { name, audio, baseVolume };
    } catch (_) {
      this._pendingMusic = { name, baseVolume };
    }
  }

  /**
   * Detiene la música actual (si la hay).
   */
  stopMusic() {
    if (!this._currentMusic) return;
    try {
      this._currentMusic.audio.pause();
      this._currentMusic.audio.currentTime = 0;
    } catch (_) {}
    this._currentMusic = null;
  }

  /**
   * Volumen general de la música (0..1). Se aplica de inmediato.
   */
  setMusicVolume(v) {
    this._musicVolume = this._clamp01(v);
    if (this._currentMusic) {
      this._currentMusic.audio.volume = this._clamp01(
        this._currentMusic.baseVolume * this._musicVolume,
      );
    }
  }
  getMusicVolume() { return this._musicVolume; }

  // ─── Internos ───────────────────────────────────────────────────────────

  _clamp01(v) {
    if (!Number.isFinite(v)) return 0;
    return Math.max(0, Math.min(1, v));
  }
}

// Singleton compartido
export const Audio = new _AudioManager();

/**
 * Registra todos los sonidos del juego. Idempotente: si se llama dos veces
 * los banks se duplican, así que el caller (initGameAudio en Player.js)
 * controla que se ejecute una sola vez.
 */
export function initGameAudio(basePath = 'assets/audios/') {
  // ── SFX de combate ────────────────────────────────────────────────────
  Audio.register('punch_hit',  basePath + 'FistHit.ogg',  { volume: 0.9 });
  Audio.register('punch_hit',  basePath + 'FistRHit.ogg', { volume: 0.9 }); // variante
  Audio.register('punch_miss', basePath + 'FistMiss.ogg', { volume: 0.8 });

  Audio.register('kick_hit',   basePath + 'KickHit.ogg',  { volume: 1.0 });
  Audio.register('kick_hit',   basePath + 'KickSlid.ogg', { volume: 0.9 }); // variante
  Audio.register('kick_miss',  basePath + 'KickMiss.ogg', { volume: 0.85 });

  // ── KO ("Finish Him") — el nombre del archivo tiene espacios ──────────
  Audio.register(
    'ko',
    basePath + encodeURIComponent('Voicy_Mortal Kombat- Finish Him.mp3'),
    { volume: 1.0 },
  );

  // ── Música de fondo ───────────────────────────────────────────────────
  Audio.register('bgm_rpg',    basePath + 'aventure.mp3', { volume: 0.6 });
  Audio.register('bgm_combat', basePath + 'pelea.mp3',    { volume: 0.5 });
}
