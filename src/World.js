import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

export class World {

    constructor(){
        this.scene = new THREE.Scene()

        this._CrearLuces()
        this._CrearEntorno()
        this._CrearSuelo()
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

        this.scene.add(luz);

        const luzAmbiente = new THREE.AmbientLight(0x101010);
        this.scene.add(luzAmbiente);
    }

    _CrearEntorno(){
        const cielo = new THREE.TextureLoader().load('assets/sky.jpg', () => { console.log('Cielo Cargado')})
        this.scene.background = cielo
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

        this.scene.add(plane);
    }
}