import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';
import { Player } from './Player.js';
import { CombatHUD } from './CombatHUD.js';
import { KeyControllers } from './KeyControllers.js';
import { GamepadController } from './GamepadController.js';

export class SceneManager {

    constructor(){
        this._Init();
    }

    _Init(){
        
        this._threejs = new THREE.WebGLRenderer({
            antialias: true,
        });

        this._threejs.shadowMap.enabled = true;
        this._threejs.shadowMap.type = THREE.PCFSoftShadowMap;

        this._threejs.setPixelRatio(window.devicePixelRatio);
        this._threejs.setSize(window.innerWidth, window.innerHeight);


        document.getElementById('game-container').appendChild(this._threejs.domElement);

        window.addEventListener('resize', () => {
            this._OnWindowResize();
        });

        this._scene = new THREE.Scene();
        this._clock = new THREE.Clock();

        this._CrearCamara();
        this._CrearLuces();
        this._CrearEntorno();
        this._CrearSuelo();
        this._CrearControles();
        // Crear controladores de input
        this._keyboard = new KeyControllers();
        this._gamepad = new GamepadController(0);

        this._CrearPersonaje()
        this._hud = new CombatHUD();
        this._hud.mount(document.getElementById('game-container'));
        this._RAF();
            
    }

    _CrearCamara(){
        const fov = 60;
        const aspect = window.innerWidth / window.innerHeight;
        const near = 1.0;
        const far = 1000.0;
        this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
        // Posicion centrada para ver ambos jugadores
        this._camera.position.set(0, 12, 80);
        this._camera.lookAt(new THREE.Vector3(0, 1.5, 0));
        this._camera.layers.enable(1);
    }
    _CrearLuces(){
    
        let luz = new THREE.DirectionalLight(0xFFFFFF, 1.0);

        luz.position.set(20, 100, 10);
        luz.target.position.set(0, 0, 0);

        luz.castShadow = true;
        luz.shadow.bias = -0.001;

        luz.shadow.mapSize.width = 2048;
        luz.shadow.mapSize.height = 2048;

        luz.shadow.camera.near = 0.5;
        luz.shadow.camera.far = 500.0;

        luz.shadow.camera.left = 100;
        luz.shadow.camera.right = -100;
        luz.shadow.camera.top = 100;
        luz.shadow.camera.bottom = -100;

        this._scene.add(luz);

        const luzAmbiente = new THREE.AmbientLight(0x101010);
        this._scene.add(luzAmbiente);
    }

    _CrearEntorno(){
        const cielo = new THREE.TextureLoader().load('assets/sky.jpg', () => { console.log('Cielo Cargado')})
        this._scene.background = cielo
    }

    _CrearSuelo(){
        const plane = new THREE.Mesh(
            new THREE.PlaneGeometry(100, 100, 10, 10),
            new THREE.MeshStandardMaterial({
                color: 0xFFFFFF,
            })
        )

        plane.castShadow = false;
        plane.receiveShadow = true;
        plane.rotation.x = -Math.PI / 2;

        this._scene.add(plane);
    }

    _CrearControles(){
        this._controls = new OrbitControls(
        this._camera,
        this._threejs.domElement
        );

        // Apuntar al centro del escenario
        this._controls.target.set(0, 1.5, 0);
        this._controls.update();
    }

    _OnWindowResize(){
        this._camera.aspect = window.innerWidth / window.innerHeight;

        this._camera.updateProjectionMatrix();

        this._threejs.setSize(
        window.innerWidth,
        window.innerHeight
        );
    }

    _RAF(){
        requestAnimationFrame(() => {
            const deltaTime = this._clock.getDelta();

            // actualizar gamepad state
            if (this._gamepad) this._gamepad.Update();

            // actualizar jugadores
            if (this._player1) this._player1.Update(deltaTime);
            if (this._player2) this._player2.Update(deltaTime);

            // Orientar jugadores a mirarse entre si una sola vez cuando ambos modelos estén listos
            if (!this._playersOriented && this._player1 && this._player2 && this._player1._model && this._player2._model) {
                this._player1.faceTarget(this._player2);
                this._player2.faceTarget(this._player1);
                this._playersOriented = true;
            }

            // actualizar HUD usando estados reales si están disponibles
            if (this._player1 && this._player2 && this._hud) {
                const p1State = this._player1.combat.getState();
                const p2State = this._player2.combat.getState();

                let comboOwner = null;
                if (p1State.comboLanded >= 2) comboOwner = 'p1';
                if (p2State.comboLanded >= 2) comboOwner = 'p2';

                let statusText = '';
                if (p1State.guardBroken || p2State.guardBroken) statusText = '¡GUARDIA ROTA!';
                if (p1State.isDead || p2State.isDead) statusText = 'K.O.';

                this._hud.update(p1State, p2State, { comboOwner, statusText });
            }

            this._threejs.render(this._scene, this._camera);
            this._RAF();
        });
    }

    _CrearPersonaje(){
        // Posiciones iniciales para P1 y P2 en X
        const p1Pos = new THREE.Vector3(-38, 0, 0);
        const p2Pos = new THREE.Vector3(38, 0, 0);

        this._player1 = new Player({
            scene: this._scene,
            camera: this._camera,
            modelPath: 'assets/james/',
            position: p1Pos,
            input: this._keyboard,
        });

        this._player2 = new Player({
            scene: this._scene,
            camera: this._camera,
            modelPath: 'assets/james/',
            position: p2Pos,
            input: this._gamepad,
        });

        // Conectar oponentes
        this._player1.oponente = this._player2;
        this._player2.oponente = this._player1;
    }

}