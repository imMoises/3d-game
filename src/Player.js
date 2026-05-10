
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import {FBXLoader} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import { KeyControllers } from './KeyControllers.js';


export class Player{

    constructor(params){
        this._Init(params)
    }

    _Init(params){
        this._params = params
        this._animaciones = {}
        this._currentAction = null
        this._moveSpeed = 8

        this.vida = 100;
        this.estaCubriendose = false;
        this.estaAturdido = false;
        this.oponente = null; // Referencia al otro jugador
        this._posicionInicial = params.position || new THREE.Vector3(0, 0, 0);

        this._input = new KeyControllers()
        this._LoadModel()
        
    }

    _LoadModel(){
        const loader = new FBXLoader()
        loader.setPath('./assets/james/')
        loader.load('james_malla.fbx',
            (fbx) => { 
                fbx.scale.setScalar(0.1)
                fbx.traverse(c => {
                    c.castShadow = true
                    c.layers.set(1)
                })

// Ubicar al jugador en su posición inicial una vez cargado
                fbx.position.copy(this._posicionInicial);

                const luzAmbientePersonaje = new THREE.AmbientLight(0xffffff, 1)
                luzAmbientePersonaje.layers.set(1)
                fbx.add(luzAmbientePersonaje)

                this._model = fbx
                
                
                this._params.scene.add(this._model)

                this._mixer = new THREE.AnimationMixer(this._model);
                this._manager = new THREE.LoadingManager();
                this._manager.onLoad = () => {
                    this._SetAction('Idle')
                }

                this._mixer.addEventListener('finished', () => {
                    if (this._currentAction === 'golpear' || this._currentAction === 'patear') {
                        this._UpdateLocomotionAction()
                    }
                })

                const _OnLoad = (nombreAnimacion, animacion) => {

                    const clip = animacion.animations[0]
                    const action = this._mixer.clipAction(clip)
                    this._animaciones[nombreAnimacion] = {
                        clip: clip,
                        action: action
                    }
                }

                const loader = new FBXLoader(this._manager)
                loader.setPath('./assets/james/')
                loader.load('caminar.fbx', (animacion) => { _OnLoad('caminar', animacion)})
                loader.load('Idle.fbx', (animacion) => { _OnLoad('Idle', animacion)})
                loader.load('golpear.fbx', (animacion) => { _OnLoad('golpear', animacion)})
                loader.load('patear.fbx', (animacion) => { _OnLoad('patear', animacion)})

             }
        )
    }

    _SetAction(nombreAnimacion, once = false, forceRestart = false){
        const animacion = this._animaciones[nombreAnimacion]
        if (!animacion) {
            return
        }

        if (this._currentAction === nombreAnimacion && !forceRestart) {
            return
        }

        const siguiente = animacion.action
        const anterior = this._currentAction ? this._animaciones[this._currentAction]?.action : null

        if (anterior && anterior !== siguiente) {
            anterior.fadeOut(0.15)
        } else if (anterior === siguiente) {
            siguiente.stop()
        }

        siguiente.reset()
        siguiente.enabled = true
        siguiente.setEffectiveTimeScale(1)
        siguiente.setEffectiveWeight(1)

        if (once) {
            siguiente.setLoop(THREE.LoopOnce, 1)
            siguiente.clampWhenFinished = true
        } else {
            siguiente.setLoop(THREE.LoopRepeat, Infinity)
            siguiente.clampWhenFinished = false
        }

        siguiente.fadeIn(0.15)
        siguiente.play()
        this._currentAction = nombreAnimacion
    }

    _UpdateLocomotionAction(){
        if (this.estaAturdido) return; // si se aturdió, no cambiar la animación de locomoción  

        const keys = this._input._keys
        const moving = keys.adelante || keys.atras || keys.izquierda || keys.derecha
        if (this.estaCubriendose) {
            // this._SetAction('bloqueo'); // Activa esto cuando tengas la animación
            this._SetAction('Idle'); // Temporal
        } else if (moving) {
            this._SetAction('caminar', true)
        } else {
            this._SetAction('Idle')
        }
    }

    RecibirGolpe(daño) {
        if (this.estaCubriendose) {
            this.vida -= (daño * 0.1); // Solo 10% del daño si se cubre
            console.log(`[Bloqueo] Vida restante: ${this.vida}`);
            return;
        }

        // Si no se cubre: recibe daño total, se cancela lo que esté haciendo y queda vulnerable
        this.vida -= daño;
        this.estaAturdido = true;
        console.log(`[Impacto Directo] Vida restante: ${this.vida}`);

        // Cancela ataque en progreso forzando un estado de "hit" o Idle
        this._SetAction('Idle', true, true); // Idealmente cambiar a 'hit_reaction'

        // Se recupera del stun después de 600ms (lo que duraría la animación de golpe)
        setTimeout(() => {
            this.estaAturdido = false;
            this._UpdateLocomotionAction();
        }, 600);
    }

    _IntentarGolpe(daño) {
        if (!this.oponente || !this.oponente._model || !this._model) return;

        // Calculamos distancia simple entre el centro de ambos jugadores
        const distancia = this._model.position.distanceTo(this.oponente._model.position);
        const rangoGolpe = 2.5; // Ajusta este valor según la escala de tus modelos

        if (distancia <= rangoGolpe) {
            this.oponente.RecibirGolpe(daño);
        }
    }

    Update(tiempo){
        if(!this._model || !this._mixer) return

        const keys = this._input._keys


        if (!this.estaAturdido) {
            this.estaCubriendose = keys.cubrirse;
        }

        if (!this.estaAturdido && !this.estaCubriendose) {
            if (keys.izquierda) this._model.translateX(-this._moveSpeed * tiempo);
            if (keys.derecha) this._model.translateX(this._moveSpeed * tiempo);
            if (keys.adelante) this._model.translateZ(this._moveSpeed * tiempo);
            if (keys.atras) this._model.translateZ(-this._moveSpeed * tiempo);

        const attackPressed = this._input.ConsumeAttackPress()
        const kickPressed = this._input.ConsumeKickPress()

        if (attackPressed) {
            this._SetAction('golpear', true, true)
            this._IntentarGolpe(10); // Llama al sistema de hitbox con un daño de 10
        } else if (kickPressed) {
            this._SetAction('patear', true, true)
            this._IntentarGolpe(15); // La patada quita más vida
        } else if (this._currentAction !== 'golpear' && this._currentAction !== 'patear') {
            this._UpdateLocomotionAction()
        }else if (this.estaCubriendose && this._currentAction !== 'golpear' && this._currentAction !== 'patear') {
            this._UpdateLocomotionAction(); // Actualiza a animación de bloqueo
        }

        this._mixer.update(tiempo)


    }

    }
}