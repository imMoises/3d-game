
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import {FBXLoader} from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';
import { KeyControllers } from './KeyControllers.js';
import { CombatSystem } from './CombatSystem.js';

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
        

        // Input controller puede ser pasado en params.input (KeyControllers o GamepadController)
        this._input = params.input || new KeyControllers()
        this._LoadModel()

        this.combat = new CombatSystem('p1');  // Cambiar a 'p2' para el segundo jugador

        // Escuchar eventos del combate
        this.combat.on('hit', ({ attackType, blocked, damage, knockback }) => {
            // Aplicar knockback en X (dirección opuesta al oponente)
            if (knockback > 0 && this._model && this.oponente && this.oponente._model) {
                const dir = this._model.position.x < this.oponente._model.position.x ? -1 : 1;
                this._model.position.x += dir * knockback;
            }

            // Activar animación de daño si existe en tus FBX
            // this._PlayAnimation('golpeRecibido');  // descomenta si tienes esa animación
        });

        this.combat.on('stunStart', () => {
        this.estaAturdido = true;
        });

        this.combat.on('stunEnd', () => {
        this.estaAturdido = false;
        });

        this.combat.on('death', () => {
        // Activar animación de muerte si existe
        // this._PlayAnimation('muerte');
        console.log(`${this.combat.id} ha muerto`);
        });



        
    }

    _LoadModel(){
        const loader = new FBXLoader()
        loader.setPath(this._params.modelPath)
        loader.load('malla.fbx',
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

                // Si se pasó un callback externo para cuando el modelo esté listo
                if (this._params.onModelLoaded) {
                    this._params.onModelLoaded(this);
                }

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

    // Orienta el model para mirar hacia otro Player (en X), evita tilt en Y
    faceTarget(targetPlayer){
        if (!this._model || !targetPlayer || !targetPlayer._model) return;
        const myPos = this._model.position.clone();
        const targetPos = targetPlayer._model.position.clone();
        // Mantener la misma altura para evitar tilt
        const lookAt = new THREE.Vector3(targetPos.x, myPos.y, targetPos.z);
        this._model.lookAt(lookAt);
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

        siguiente.play()
        this._currentAction = nombreAnimacion
    }

    _UpdateLocomotionAction(){
        if (this.estaAturdido) return; // si se aturdió, no cambiar la animación de locomoción  
        const keys = this._input._keys
        // Movimiento restringido al eje X: izquierda/derecha
        const moving = keys.izquierda || keys.derecha
        const patada = keys.patada
        const ataque = keys.ataque
        if (this.estaCubriendose) {
            this._SetAction('Idle'); 
        } else if (moving) {
            this._SetAction('caminar', true)
        } else if (ataque) {
            this._SetAction('golpear', true)
        } else if (patada) {
            this._SetAction('patear', true) 
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

        // Actualizar sistema de combate
        const cubriendo = keys.cubrirse;
        this.combat.update(tiempo, cubriendo);

        // Bloquear acciones si está muerto
        if (this.combat.isDead) return;

        if (this.estaAturdido || this.combat.isStunned) {
            // No procesar movimiento ni ataques
            return;
            }

        if (!this.estaAturdido) {
            this.estaCubriendose = keys.cubrirse;
        }

        if (!this.estaAturdido && !this.estaCubriendose) {
            // Movimiento restringido solo al eje X (strafe)
            if (keys.izquierda) this._model.translateZ(-this._moveSpeed * tiempo);
            if (keys.derecha) this._model.translateZ(this._moveSpeed * tiempo);


       if (keys.ataque) {
        this._UpdateLocomotionAction('golpear');

        // Solo intentar golpe si hay oponente
            if (this.oponente) {
            const distX = Math.abs(
            this._model.position.x - this.oponente._model.position.x
            );
            this.combat.landHit('punch', distX, this.oponente.combat);
        }
        }
       
        else if (keys.patada) {
                this._UpdateLocomotionAction('patear');

                if (this.oponente) {
                    const distX = Math.abs(
                    this._model.position.x - this.oponente._model.position.x
                    );
                    this.combat.landHit('kick', distX, this.oponente.combat);
                }
            }
            
            
        else if (this._currentAction !== 'golpear' && this._currentAction !== 'patear') {
            this._UpdateLocomotionAction()
        }else if (this.estaCubriendose && this._currentAction !== 'golpear' && this._currentAction !== 'patear') {
            this._UpdateLocomotionAction(); // Actualiza a animación de bloqueo
        }

        this._mixer.update(tiempo)


    }

    }
}