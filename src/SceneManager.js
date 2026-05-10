import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';
import { Player } from './Player.js';

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
        this._CrearPersonaje()
        this._RAF();
            
    }

    _CrearCamara(){
        const fov = 60;
        const aspect = window.innerWidth / window.innerHeight;
        const near = 1.0;
        const far = 1000.0;
        this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
        this._camera.position.set(75, 20, 0);
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

        this._controls.target.set(0, 20, 0);
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
            if (this._player) {
                this._player.Update(deltaTime);
            }
            this._threejs.render(this._scene, this._camera);
            this._RAF();
        });
    }

    _CrearPersonaje(){
        this._player = new Player({
            scene: this._scene,
            camera: this._camera
        })
    }

}