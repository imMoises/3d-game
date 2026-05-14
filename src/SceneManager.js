import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { Player, PlayerMode } from './Player.js';
import { CombatHUD } from './CombatHud.js';
import { KeyControllers } from './KeyControllers.js';
import { GamepadController } from './GamepadController.js';
import { RPGWorld } from './RPGWorld.js';
import { RPGHud }   from './RPGHud.js';
import { Audio, initGameAudio } from './AudioManager.js';

// ── Volumen de la música de fondo ──────────────────────────────────────────
// Variable global para regular fácilmente: se aplica a la música actual.
// 0 = silenciada, 1 = volumen máximo. Empezamos algo bajita para que no
// tape los efectos de combate.
export const BACKGROUND_MUSIC_VOLUME = 0.35;

// ─── Límites de arena de combate ──────────────────────────────────────────────
const ARENA_MIN_X   = -38;
const ARENA_MAX_X   =  38;
const PLAYER_RADIUS =   2.5;
const COMBAT_DISTANCE_TRIGGER = 6.0; // distancia para que R inicie combate

// Posiciones de spawn en modo RPG
const RPG_SPAWN_P1 = new THREE.Vector3(-6, 0, 6);
const RPG_SPAWN_P2 = new THREE.Vector3( 6, 0, 6);

export class SceneManager {

  constructor() {
    this._mode = PlayerMode.RPG; // arranca en RPG
    this._modeJustChangedTimer = 0;
    this._Init();
  }

  _Init() {
    this._threejs = new THREE.WebGLRenderer({ antialias: true });
    this._threejs.shadowMap.enabled = true;
    this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
    this._threejs.setPixelRatio(window.devicePixelRatio);
    this._threejs.setSize(window.innerWidth, window.innerHeight);
    this._threejs.setScissorTest(true);

    document.getElementById('game-container').appendChild(this._threejs.domElement);
    window.addEventListener('resize', () => this._OnWindowResize());

    this._scene = new THREE.Scene();
    this._clock = new THREE.Clock();

    this._CrearCamaras();
    this._CrearLuces();
    this._CrearEntorno();
    this._CrearSuelo();

    this._keyboard = new KeyControllers();
    this._gamepad  = new GamepadController(0);

    // Mundo RPG (suelo verde grande, árboles, enemigos, monedas)
    this._rpgWorld = new RPGWorld(this._scene);

    this._CrearPersonaje();

    // HUDs
    this._combatHud = new CombatHUD();
    this._combatHud.mount(document.getElementById('game-container'));

    this._rpgHud = new RPGHud();
    this._rpgHud.mount(document.getElementById('game-container'));

    // Aplicar visibilidad inicial según el modo
    this._SyncModeUI();

    // ── Audio: registrar banco de sonidos y arrancar música RPG ──────────
    // initGameAudio() es idempotente desde Player.js, pero también podemos
    // llamarlo aquí por si SceneManager se inicializa primero.
    initGameAudio('assets/audios/');
    Audio.setMusicVolume(BACKGROUND_MUSIC_VOLUME);
    // El juego arranca en RPG → suena la música de aventura en bucle.
    Audio.playMusic('bgm_rpg');

    this._RAF();
  }

  // ─── Cámaras ──────────────────────────────────────────────────────────────
  _CrearCamaras() {
    // Cámara COMBATE 1v1 (la histórica)
    this._camera = new THREE.PerspectiveCamera(
      60, window.innerWidth / window.innerHeight, 1.0, 1000.0,
    );
    this._camera.position.set(0, 12, 80);
    this._camera.lookAt(0, 1.5, 0);
    this._camera.layers.enable(1);

    this._camLookAt  = new THREE.Vector3(0, 1.5, 0);
    this._CAM_Y      = 12;
    this._CAM_Z_BASE = 55;
    this._CAM_Z_MAX  = 90;
    this._CAM_LERP   = 4;

    // Cámaras RPG (third-person, una por jugador, split-screen)
    const aspect = (window.innerWidth * 0.5) / window.innerHeight;
    this._camRpgP1 = new THREE.PerspectiveCamera(60, aspect, 1.0, 1000.0);
    this._camRpgP2 = new THREE.PerspectiveCamera(60, aspect, 1.0, 1000.0);
    this._camRpgP1.layers.enable(1);
    this._camRpgP2.layers.enable(1);

    // Offset cámara→jugador en RPG (estilo Diablo/Zelda: arriba y atrás)
    this._rpgCamOffset = new THREE.Vector3(0, 14, 16);
  }

  _UpdateRpgCameras(delta) {
    if (!this._player1?._model || !this._player2?._model) return;

    const lerpF = 1 - Math.exp(-8 * delta);

    const placeCam = (cam, target) => {
      const desired = target.position.clone().add(this._rpgCamOffset);
      cam.position.lerp(desired, lerpF);
      cam.lookAt(target.position.x, target.position.y + 1.5, target.position.z);
    };

    placeCam(this._camRpgP1, this._player1._model);
    placeCam(this._camRpgP2, this._player2._model);
  }

  /**
   * Actualiza la cámara de combate (sigue el punto medio + zoom-out).
   */
  _UpdateCamera(delta) {
    const m1 = this._player1?._model;
    const m2 = this._player2?._model;
    if (!m1 || !m2) return;

    const midX  = (m1.position.x + m2.position.x) / 2;
    const dist  = Math.abs(m2.position.x - m1.position.x);
    const targetZ = THREE.MathUtils.clamp(
      this._CAM_Z_BASE + dist * 0.6, this._CAM_Z_BASE, this._CAM_Z_MAX,
    );
    const f = 1 - Math.exp(-this._CAM_LERP * delta);

    this._camera.position.x = THREE.MathUtils.lerp(this._camera.position.x, midX,    f);
    this._camera.position.z = THREE.MathUtils.lerp(this._camera.position.z, targetZ, f * 0.5);
    this._camera.position.y = this._CAM_Y;

    this._camLookAt.lerp(new THREE.Vector3(midX, 1.5, 0), f);
    this._camera.lookAt(this._camLookAt);
  }

  // ─── Límites de arena (solo aplica en modo combate) ───────────────────────
  _ApplyArenaLimits() {
    const m1 = this._player1?._model;
    const m2 = this._player2?._model;
    if (!m1 || !m2) return;

    m1.position.x = THREE.MathUtils.clamp(m1.position.x, ARENA_MIN_X, ARENA_MAX_X);
    m2.position.x = THREE.MathUtils.clamp(m2.position.x, ARENA_MIN_X, ARENA_MAX_X);

    const airThreshold = Math.min(
      this._player1._airCrossThreshold ?? 1.5,
      this._player2._airCrossThreshold ?? 1.5,
    );
    const p1Air = (m1.position.y - (this._player1._groundY ?? 0)) > airThreshold;
    const p2Air = (m2.position.y - (this._player2._groundY ?? 0)) > airThreshold;
    if (p1Air || p2Air) return;

    const MIN_DIST = PLAYER_RADIUS * 2;
    const diff     = m2.position.x - m1.position.x;
    const overlap  = MIN_DIST - Math.abs(diff);

    if (overlap > 0) {
      const dir  = Math.sign(diff) || 1;
      const push = overlap / 2;
      m1.position.x -= dir * push;
      m2.position.x += dir * push;
      m1.position.x = THREE.MathUtils.clamp(m1.position.x, ARENA_MIN_X, ARENA_MAX_X);
      m2.position.x = THREE.MathUtils.clamp(m2.position.x, ARENA_MIN_X, ARENA_MAX_X);
    }
  }

  // ─── Luces, entorno, suelo ────────────────────────────────────────────────
  _CrearLuces() {
    const luz = new THREE.DirectionalLight(0xFFFFFF, 1.0);
    luz.position.set(20, 100, 10);
    luz.target.position.set(0, 0, 0);
    luz.castShadow = true;
    luz.shadow.bias = -0.001;
    luz.shadow.mapSize.width  = 2048;
    luz.shadow.mapSize.height = 2048;
    luz.shadow.camera.near   = 0.5;
    luz.shadow.camera.far    = 500.0;
    luz.shadow.camera.left   = 100;
    luz.shadow.camera.right  = -100;
    luz.shadow.camera.top    = 100;
    luz.shadow.camera.bottom = -100;
    this._scene.add(luz);
    this._scene.add(new THREE.AmbientLight(0x101010));
  }

  _CrearEntorno() {
    const cielo = new THREE.TextureLoader().load('assets/sky.jpg', () => {});
    this._scene.background = cielo;
  }

  _CrearSuelo() {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xFFFFFF }),
    );
    plane.castShadow    = false;
    plane.receiveShadow = true;
    plane.rotation.x    = -Math.PI / 2;
    this._scene.add(plane);
    this._combatGround = plane;
  }

  _OnWindowResize() {
    const w = window.innerWidth, h = window.innerHeight;
    this._camera.aspect = w / h;
    this._camera.updateProjectionMatrix();
    this._camRpgP1.aspect = (w * 0.5) / h;
    this._camRpgP1.updateProjectionMatrix();
    this._camRpgP2.aspect = (w * 0.5) / h;
    this._camRpgP2.updateProjectionMatrix();
    this._threejs.setSize(w, h);
  }

  // ─── Personajes ───────────────────────────────────────────────────────────
  _CrearPersonaje() {
    this._player1 = new Player({
      scene:     this._scene,
      camera:    this._camera,
      modelPath: 'assets/Adventurer/Adventurer.fbx',
      position:  RPG_SPAWN_P1,
      input:     this._keyboard,
      id:        'p1',
      mode:      PlayerMode.RPG,
      scaleRpg:  0.01,
      scaleCombat: 0.1
    });

    this._player2 = new Player({
      scene:     this._scene,
      camera:    this._camera,
      modelPath: 'assets/Business-Man/Business-Man.fbx',
      position:  RPG_SPAWN_P2,
      input:     this._gamepad,
      id:        'p2',
      mode:      PlayerMode.RPG,
      scaleRpg:  0.01,
      scaleCombat: 0.1
    });

    this._player1.oponente = this._player2;
    this._player2.oponente = this._player1;

    // Inyectar referencia al mundo RPG en cada jugador (para resolver ataques)
    this._player1.rpgWorld = this._rpgWorld;
    this._player2.rpgWorld = this._rpgWorld;

    this._rpgWorld.setPlayers(this._player1, this._player2);
  }

  // ─── Cambio de modo (RPG ⇄ COMBATE) ───────────────────────────────────────
  _ToggleMode() {
    if (this._modeJustChangedTimer > 0) return; // debounce

    if (this._mode === PlayerMode.RPG) {
      // Solo permitir transición a combate si están cerca
      if (!this._rpgWorld.playersAreClose(COMBAT_DISTANCE_TRIGGER)) return;
      this._EnterCombatMode();
    } else {
      this._EnterRpgMode();
    }
    this._modeJustChangedTimer = 0.5;
  }

  _EnterCombatMode() {
    this._mode = PlayerMode.COMBAT;

    // Música: cambiar a la de pelea
    Audio.playMusic('bgm_combat');

    // Colocar jugadores en extremos de la arena, mirándose
    if (this._player1?._model) {
      this._player1._model.position.set(ARENA_MIN_X + 4, 0, 0);
      this._player1._velocityY = 0;
      this._player1._isGrounded = true;
    }
    if (this._player2?._model) {
      this._player2._model.position.set(ARENA_MAX_X - 4, 0, 0);
      this._player2._velocityY = 0;
      this._player2._isGrounded = true;
    }

    this._player1?.setMode(PlayerMode.COMBAT);
    this._player2?.setMode(PlayerMode.COMBAT);

    // Mirarse de frente
    if (this._player1?._model && this._player2?._model) {
      this._player1.faceTarget(this._player2);
      this._player2.faceTarget(this._player1);
    }

    // Ocultar mundo RPG
    this._rpgWorld.setActive(false);

    this._SyncModeUI();
  }

  _EnterRpgMode() {
    this._mode = PlayerMode.RPG;

    // Música: volver a la de aventura
    Audio.playMusic('bgm_rpg');

    // Reposicionar jugadores en spawn RPG
    this._player1?.rpgRespawn(RPG_SPAWN_P1);
    this._player2?.rpgRespawn(RPG_SPAWN_P2);

    this._player1?.setMode(PlayerMode.RPG);
    this._player2?.setMode(PlayerMode.RPG);

    // Mostrar mundo RPG (ya tiene enemigos/monedas previos, opcionalmente reset)
    this._rpgWorld.setActive(true);

    this._SyncModeUI();
  }

  _SyncModeUI() {
    const isRpg = this._mode === PlayerMode.RPG;
    this._rpgHud?.setVisible(isRpg);
    if (this._combatHud?._root) {
      this._combatHud._root.style.display = isRpg ? 'none' : '';
    }
    // El suelo blanco de combate solo se ve en combate
    if (this._combatGround) this._combatGround.visible = !isRpg;
  }

  // ─── Loop principal ───────────────────────────────────────────────────────
  _RAF() {
    requestAnimationFrame(() => {
      const delta = Math.min(this._clock.getDelta(), 0.05);

      if (this._modeJustChangedTimer > 0) this._modeJustChangedTimer -= delta;

      // Input
      if (this._gamepad) this._gamepad.Update();

      // Detectar pulsación R en cualquiera de los dos inputs → cambiar modo.
      // Consumimos AMBOS sin cortocircuito para evitar que un flag quede
      // pendiente y dispare un toggle extra en el siguiente frame.
      const t1 = this._keyboard?.ConsumeModeTogglePress?.() ?? false;
      const t2 = this._gamepad?.ConsumeModeTogglePress?.() ?? false;
      if (t1 || t2) this._ToggleMode();

      // Actualizar jugadores (cada uno decide su lógica según modo)
      if (this._player1) this._player1.Update(delta);
      if (this._player2) this._player2.Update(delta);

      if (this._mode === PlayerMode.RPG) {
        this._rpgWorld.update(delta);
        this._UpdateRpgCameras(delta);
        this._UpdateRpgHud();
        this._RenderSplitScreen();
      } else {
        this._ApplyArenaLimits();
        this._UpdateCamera(delta);

        if (
          !this._playersOriented &&
          this._player1?._model && this._player2?._model
        ) {
          this._player1.faceTarget(this._player2);
          this._player2.faceTarget(this._player1);
          this._playersOriented = true;
        }

        // HUD combate
        if (this._player1 && this._player2 && this._combatHud) {
          const p1State = this._player1.combat.getState();
          const p2State = this._player2.combat.getState();
          let comboOwner = null;
          if (p1State.comboLanded >= 2) comboOwner = 'p1';
          if (p2State.comboLanded >= 2) comboOwner = 'p2';
          let statusText = '';
          if (p1State.guardBroken || p2State.guardBroken) statusText = '¡GUARDIA ROTA!';
          if (p1State.isDead      || p2State.isDead)      statusText = 'K.O.';
          this._combatHud.update(p1State, p2State, { comboOwner, statusText });
        }

        this._RenderSingleCamera();
      }

      this._RAF();
    });
  }

  _UpdateRpgHud() {
    if (!this._rpgHud || !this._player1 || !this._player2) return;
    const buildPlayer = (p) => ({
      stats: p.stats,
      position: p._model?.position ?? { x: 0, y: 0, z: 0 },
      forward: p.getForwardXZ ? p.getForwardXZ() : { x: 0, z: 1 },
    });
    const state = {
      p1: buildPlayer(this._player1),
      p2: buildPlayer(this._player2),
      enemies: this._rpgWorld.getAliveEnemies().map(e => ({
        position: e.mesh.position,
        type: e.type, hp: e.hp, maxHp: e.maxHp,
      })),
      coins: this._rpgWorld.coins.filter(c => !c.collected).map(c => ({ position: c.mesh.position })),
      menuOpen: {
        p1: !!this._player1._upgradeMenuOpen,
        p2: !!this._player2._upgradeMenuOpen,
      },
      menuSelection: {
        p1: this._player1.menuSelectionNormalized,
        p2: this._player2.menuSelectionNormalized,
      },
      playersClose: this._rpgWorld.playersAreClose(COMBAT_DISTANCE_TRIGGER),
    };
    this._rpgHud.update(state);
  }

  // ─── Render: split-screen para RPG, full screen para combate ──────────────
  _RenderSplitScreen() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const halfW = Math.floor(w / 2);

    // Izquierda: P1
    this._threejs.setViewport(0, 0, halfW, h);
    this._threejs.setScissor(0, 0, halfW, h);
    this._threejs.render(this._scene, this._camRpgP1);

    // Derecha: P2
    this._threejs.setViewport(halfW, 0, w - halfW, h);
    this._threejs.setScissor(halfW, 0, w - halfW, h);
    this._threejs.render(this._scene, this._camRpgP2);
  }

  _RenderSingleCamera() {
    const w = window.innerWidth, h = window.innerHeight;
    this._threejs.setViewport(0, 0, w, h);
    this._threejs.setScissor(0, 0, w, h);
    this._threejs.render(this._scene, this._camera);
  }
}
