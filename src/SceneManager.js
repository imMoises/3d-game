import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { OrbitControls } from 'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/controls/OrbitControls.js';
import { World } from './World.js';


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

        this._CrearCamara();
        this._CrearControles();

        this._world = new World(); //Creo el mundo en base a la clase World que cree en src/World.js
        this._scene = this._world.scene; //Lo agrego a la escena

        this._RAF();
            
    }

    _CrearCamara(){
        const fov = 60;
        const aspect = window.innerWidth / window.innerHeight;
        const near = 1.0;
        const far = 1000.0;
        this._camera = new THREE.PerspectiveCamera(fov, aspect, near, far);
        this._camera.position.set(75, 20, 0);
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
            this._threejs.render(this._scene, this._camera);
            this._RAF();
        });
    }

}