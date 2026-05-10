
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
        const keys = this._input._keys
        const moving = keys.adelante || keys.atras || keys.izquierda || keys.derecha
        if (moving) {
            this._SetAction('caminar', true)
        } else {
            this._SetAction('Idle')
        }
    }

    Update(tiempo){
        if(!this._model || !this._mixer) return

        const keys = this._input._keys

        if (keys.izquierda) {
            this._model.translateX(-this._moveSpeed * tiempo)
        }

        if (keys.derecha) {
            this._model.translateX(this._moveSpeed * tiempo)
        }

        if (keys.adelante) {
            this._model.translateZ(this._moveSpeed * tiempo)
        }

        if (keys.atras) {
            this._model.translateZ(-this._moveSpeed * tiempo)
        }

        const attackPressed = this._input.ConsumeAttackPress()
        const kickPressed = this._input.ConsumeKickPress()

        if (attackPressed) {
            this._SetAction('golpear', true, true)
        } else if (kickPressed) {
            this._SetAction('patear', true, true)
        } else if (this._currentAction !== 'golpear' && this._currentAction !== 'patear') {
            this._UpdateLocomotionAction()
        }

        this._mixer.update(tiempo)


    }

}