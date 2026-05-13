import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { Player } from './Player.js';
import { CombatHUD } from './CombatHUD.js';
import { KeyControllers } from './KeyControllers.js';
import { GamepadController } from './GamepadController.js';

// ─── Límites de arena ─────────────────────────────────────────────────────────
const ARENA_MIN_X   = -38;
const ARENA_MAX_X   =  38;
const PLAYER_RADIUS =   2.5;  // mitad del ancho del personaje (ajusta a tu escala)

export class SceneManager {

  constructor() {
    this._Init();
  }

  _Init() {
    this._threejs = new THREE.WebGLRenderer({ antialias: true });
    this._threejs.shadowMap.enabled = true;
    this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;
    this._threejs.setPixelRatio(window.devicePixelRatio);
    this._threejs.setSize(window.innerWidth, window.innerHeight);

    document.getElementById('game-container').appendChild(this._threejs.domElement);
    window.addEventListener('resize', () => this._OnWindowResize());

    this._scene = new THREE.Scene();
    this._clock = new THREE.Clock();

    this._CrearCamara();
    this._CrearLuces();
    this._CrearEntorno();
    this._CrearSuelo();

    this._keyboard = new KeyControllers();
    this._gamepad  = new GamepadController(0);

    this._CrearPersonaje();
    this._hud = new CombatHUD();
    this._hud.mount(document.getElementById('game-container'));

    this._RAF();
  }

  // ─── Cámara ────────────────────────────────────────────────────────────────

  _CrearCamara() {
    this._camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      1.0,
      1000.0
    );
    this._camera.position.set(0, 12, 80);
    this._camera.lookAt(0, 1.5, 0);
    this._camera.layers.enable(1);

    // Parámetros de la cámara dinámica
    this._camLookAt  = new THREE.Vector3(0, 1.5, 0); // suavizado del lookAt
    this._CAM_Y      = 12;
    this._CAM_Z_BASE = 55;   // distancia base cuando están cerca
    this._CAM_Z_MAX  = 90;   // máximo alejamiento
    this._CAM_LERP   = 4;    // velocidad de seguimiento (mayor = más rígido)
  }

  /**
   * Actualiza la cámara para que siga el punto medio entre ambos jugadores
   * y haga zoom-out proporcional a la distancia entre ellos.
   */
  _UpdateCamera(delta) {
    const m1 = this._player1?._model;
    const m2 = this._player2?._model;
    if (!m1 || !m2) return;

    const midX  = (m1.position.x + m2.position.x) / 2;
    const dist  = Math.abs(m2.position.x - m1.position.x);

    // Z crece con la distancia entre jugadores
    const targetZ = THREE.MathUtils.clamp(
      this._CAM_Z_BASE + dist * 0.6,
      this._CAM_Z_BASE,
      this._CAM_Z_MAX
    );

    // Lerp independiente de framerate: 1 - e^(-k·dt)
    const f = 1 - Math.exp(-this._CAM_LERP * delta);

    this._camera.position.x = THREE.MathUtils.lerp(this._camera.position.x, midX,    f);
    this._camera.position.z = THREE.MathUtils.lerp(this._camera.position.z, targetZ, f * 0.5);
    this._camera.position.y = this._CAM_Y;

    // LookAt suavizado para evitar tirones
    this._camLookAt.lerp(new THREE.Vector3(midX, 1.5, 0), f);
    this._camera.lookAt(this._camLookAt);
  }

  // ─── Límites de arena ──────────────────────────────────────────────────────

  /**
   * 1. Evita que los jugadores salgan del escenario.
   * 2. Evita que se atraviesen entre sí — EXCEPTO cuando uno está saltando
   *    por encima del otro: en ese caso pueden cruzarse libremente y, como
   *    Player.faceTarget() se llama cada frame, automáticamente se reorientan
   *    para seguir mirándose de frente al aterrizar.
   * 3. Corner push: si uno está en la pared, empuja al otro.
   */
  _ApplyArenaLimits() {
    const m1 = this._player1?._model;
    const m2 = this._player2?._model;
    if (!m1 || !m2) return;

    // 1. Clamp individual a los bordes
    m1.position.x = THREE.MathUtils.clamp(m1.position.x, ARENA_MIN_X, ARENA_MAX_X);
    m2.position.x = THREE.MathUtils.clamp(m2.position.x, ARENA_MIN_X, ARENA_MAX_X);

    // Si alguno está claramente en el aire, permitir que se atraviesen para
    // que pueda quedar detrás (cross-up / juggle clásico de fighting games).
    const airThreshold = Math.min(
      this._player1._airCrossThreshold ?? 1.5,
      this._player2._airCrossThreshold ?? 1.5
    );
    const p1Air = (m1.position.y - (this._player1._groundY ?? 0)) > airThreshold;
    const p2Air = (m2.position.y - (this._player2._groundY ?? 0)) > airThreshold;
    if (p1Air || p2Air) return;

    // 2. Separación mínima entre cuerpos (solo cuando ambos están en el suelo)
    const MIN_DIST = PLAYER_RADIUS * 2;
    const diff     = m2.position.x - m1.position.x;
    const overlap  = MIN_DIST - Math.abs(diff);

    if (overlap > 0) {
      const dir  = Math.sign(diff) || 1; // dirección de separación
      const push = overlap / 2;

      m1.position.x -= dir * push;
      m2.position.x += dir * push;

      // 3. Re-clamp post-push (corner: la pared absorbe el push de quien toca el borde)
      m1.position.x = THREE.MathUtils.clamp(m1.position.x, ARENA_MIN_X, ARENA_MAX_X);
      m2.position.x = THREE.MathUtils.clamp(m2.position.x, ARENA_MIN_X, ARENA_MAX_X);
    }
  }

  // ─── Luces, entorno, suelo ─────────────────────────────────────────────────

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
    const cielo = new THREE.TextureLoader().load('assets/sky.jpg', () => {
      console.log('Cielo cargado');
    });
    this._scene.background = cielo;
  }

  _CrearSuelo() {
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(100, 100, 10, 10),
      new THREE.MeshStandardMaterial({ color: 0xFFFFFF })
    );
    plane.castShadow    = false;
    plane.receiveShadow = true;
    plane.rotation.x    = -Math.PI / 2;
    this._scene.add(plane);
  }

  // ─── Resize ────────────────────────────────────────────────────────────────

  _OnWindowResize() {
    this._camera.aspect = window.innerWidth / window.innerHeight;
    this._camera.updateProjectionMatrix();
    this._threejs.setSize(window.innerWidth, window.innerHeight);
  }

  // ─── Personajes ────────────────────────────────────────────────────────────

  _CrearPersonaje() {
    const p1Pos = new THREE.Vector3(-38, 0, 0);
    const p2Pos = new THREE.Vector3( 38, 0, 0);

    this._player1 = new Player({
      scene:     this._scene,
      camera:    this._camera,
      modelPath: 'assets/Adventurer/Adventurer.fbx',
      position:  p1Pos,
      input:     this._keyboard,
      id:        'p1',
    });

    this._player2 = new Player({
      scene:     this._scene,
      camera:    this._camera,
      modelPath: 'assets/Business-Man/Business-Man.fbx',
      position:  p2Pos,
      input:     this._gamepad,
      id:        'p2',
    });

    this._player1.oponente = this._player2;
    this._player2.oponente = this._player1;
  }

  // ─── Loop principal ────────────────────────────────────────────────────────

  _RAF() {
    requestAnimationFrame(() => {
      // Cap a 50ms para evitar tunneling si la pestaña pierde foco
      const delta = Math.min(this._clock.getDelta(), 0.05);

      // Input
      if (this._gamepad) this._gamepad.Update();

      // Jugadores
      if (this._player1) this._player1.Update(delta);
      if (this._player2) this._player2.Update(delta);

      // Límites de arena (después del movimiento, antes de render)
      this._ApplyArenaLimits();

      // Cámara dinámica
      this._UpdateCamera(delta);

      // Orientar jugadores una sola vez al cargar
      if (
        !this._playersOriented &&
        this._player1?._model &&
        this._player2?._model
      ) {
        this._player1.faceTarget(this._player2);
        this._player2.faceTarget(this._player1);
        this._playersOriented = true;
      }

      // HUD
      if (this._player1 && this._player2 && this._hud) {
        const p1State = this._player1.combat.getState();
        const p2State = this._player2.combat.getState();

        let comboOwner = null;
        if (p1State.comboLanded >= 2) comboOwner = 'p1';
        if (p2State.comboLanded >= 2) comboOwner = 'p2';

        let statusText = '';
        if (p1State.guardBroken || p2State.guardBroken) statusText = '¡GUARDIA ROTA!';
        if (p1State.isDead      || p2State.isDead)      statusText = 'K.O.';

        this._hud.update(p1State, p2State, { comboOwner, statusText });
      }

      this._threejs.render(this._scene, this._camera);
      this._RAF();
    });
  }
}