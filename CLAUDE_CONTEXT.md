# Contexto completo del proyecto 3D Game

Este archivo resume la estructura real del proyecto, el significado de cada archivo y el flujo de ejecucion actual para que otro asistente pueda entender rapido donde tocar.

## 1. Resumen del proyecto

Es un prototipo de juego 3D de pelea local para 2 jugadores hecho con Three.js, modelos FBX y sistema de combate completo.

La aplicacion hace lo siguiente:

- Inicializa una escena 3D en el navegador con vision isometrica.
- Carga dos personajes FBX con sus animaciones desde el mismo modelo.
- Lee input de teclado (Player 1) y gamepad (Player 2) para movimiento y ataques.
- Reproduce animaciones segun el estado de cada jugador.
- Ejecuta un sistema de combate con vida, guardia, stun, y combo detection.
- Usa una luz ambiente exclusiva para cada personaje ademas de las luces globales de la escena.
- Orienta automaticamente ambos jugadores a mirarse uno al otro cuando cargan.

## 2. Estructura actual del proyecto

```text
index.html
index.js
README.md
CLAUDE_CONTEXT.md
styles.css
assets/
  sky.jpg
  james/
    malla.fbx
    caminar.fbx
    Idle.fbx
    golpear.fbx
    patear.fbx
src/
  KeyControllers.js
  GamepadController.js
  Player.js
  SceneManager.js
  CombatSystem.js
  CombatHUD.js
  Entity.js
  EntityManager.js
  World.js
```

## 3. Significado de cada archivo

### `index.html`

- Contiene el canvas donde se renderiza el juego.
- Tiene el contenedor `game-container` que recibe el renderer de Three.js.
- Carga `styles.css` e `index.js`.

### `index.js`

- Es el punto de entrada del proyecto.
- Crea una instancia de `SceneManager` cuando carga la pagina.
- No contiene logica de juego, solo arranque.

### `styles.css`

- Define estilos basicos globales.
- Quita margenes y padding.
- Hace que `#game-container` ocupe toda la pantalla.

### `README.md`

- Guia para colaboradores.
- Explica como ejecutar el proyecto y como modificar partes comunes.

### `CLAUDE_CONTEXT.md`

- Este archivo.
- Sirve como documento de contexto tecnico para otro modelo o colaborador.

### `src/SceneManager.js`

Responsabilidades principales:

- Crea el renderer WebGL con soporte para sombras.
- Configura la camara isometrica a posicion (0, 12, 80) mirando al centro.
- Crea luces globales de la escena.
- Crea el fondo del cielo.
- Crea el suelo (plano 100x100).
- Crea OrbitControls.
- **Crea dos jugadores (P1 y P2)** con inputs independientes.
- Conecta los oponentes entre si.
- Actualiza el gamepad cada frame.
- Ejecuta el loop principal de render y actualizacion de ambos jugadores.
- Orienta los jugadores a mirarse uno al otro cuando ambos modelos cargan.
- Actualiza el HUD con estados de combate en tiempo real.

Puntos importantes del archivo:

- Crea `KeyControllers` para P1 y `GamepadController(0)` para P2.
- Instancia dos `Player` con `position` y `input` diferenciados.
- Usa flag `_playersOriented` para orientar jugadores una sola vez.
- Llama `Player.Update(deltaTime)` en cada frame para ambos jugadores.
- La camara tiene habilitada la capa 1 para ver personajes y sus luces locales.

### `src/Player.js`

Responsabilidades principales:

- Carga el modelo FBX del personaje desde la posicion inicial.
- Carga las animaciones FBX (caminar, Idle, golpear, patear).
- Controla el movimiento del personaje **solo en eje X** (strafe).
- Controla el cambio entre animaciones (transiciones suave con fade).
- Maneja vida, bloqueo, aturdimiento y referencia al oponente.
- Ejecuta golpes y patadas con deteccion de rango y sistema de combate.
- Orienta el personaje hacia otro jugador (metodo `faceTarget`).

Estado actual del jugador:

- `vida`: herencia del sistema antiguo (deprecado, usar `combat.hp` en su lugar).
- `estaCubriendose`: flag de bloqueo continuo.
- `estaAturdido`: flag de stun local (redundante, mejor usar `combat.isStunned`).
- `oponente`: referencia al otro `Player`.
- `combat`: instancia de `CombatSystem` con toda la logica de combate.
- `this._moveSpeed`: velocidad de desplazamiento (default 8).
- `this._animaciones`: mapa de clips y acciones cargadas.
- `this._currentAction`: animacion actual activa.

Movimiento (eje X solamente):

- A/D (keyboard) o stick izquierdo X (gamepad) mueven lateralmente.
- No hay movimiento en Z o rotacion de camara.
- El movimiento se aplica via `translateX` sobre `this._model`.

Comportamiento de animaciones:

- `Idle`: loop normal, estado por defecto.
- `caminar`: se ejecuta una vez y queda sostenida mientras hay movimiento.
- `golpear`: one-shot, se relanza si se pulsa J/A nuevamente.
- `patear`: one-shot, se relanza si se pulsa K/B nuevamente.

Combate:

- El jugador lee `keys.ataque` y `keys.patada` desde su controlador.
- Llama `combat.landHit(attackType, distX, opponent.combat)` para intentar golpe.
- Escucha eventos de `combat` (hit, stunStart, stunEnd, death) y aplica knockback.

### `src/KeyControllers.js`

Responsabilidades principales:

- Captura eventos de teclado con `keydown` y `keyup`.
- Guarda el estado continuo de movimiento (WASD).
- Guarda pulsos de ataque y patada para acciones de una sola activacion (JK).
- Guarda el estado de bloqueo (L).

Tipos de input:

- Continuo: `adelante`, `atras`, `izquierda`, `derecha`, `ataque`, `patada`, `cubrirse`.
- Pulso: `ataquePressed`, `patadaPressed`.

Mapeo de teclas:

- W (87): adelante.
- A (65): izquierda.
- S (83): atras.
- D (68): derecha.
- J (74): ataque.
- K (75): patada.
- L (76): cubrirse / bloquear.

Metodos importantes:

- `ConsumeAttackPress()`: devuelve si se pulso J una vez y limpia el pulso.
- `ConsumeKickPress()`: devuelve si se pulso K una vez y limpia el pulso.

### `src/GamepadController.js`

Responsabilidades principales:

- Captura input de un gamepad (joystick/controller) mediante Gamepad API.
- Mapea el stick analogico izquierdo (axis 0) a izquierda/derecha.
- Mapea botones estandar a acciones (A, B, LB).
- Simula pulsos de ataque y patada detectando transiciones de botones.
- Compatible con la misma interfaz que `KeyControllers` para intercambiabilidad.

Mapeo de controles (standard gamepad layout):

- Stick izquierdo X (axis 0): izquierda (< -0.3) / derecha (> 0.3).
- Boton A (buttons[0]): ataque.
- Boton B (buttons[1]): patada.
- Boton LB (buttons[4]): cubrirse / bloquear.

Parametros:

- `index`: indice del gamepad en la lista de `navigator.getGamepads()`. Default 0.
- `deadzone`: default 0.3 (evita ruido del stick).

Metodos importantes:

- `Update()`: llamar cada frame para actualizar estado desde el gamepad.
- `ConsumeAttackPress()`: devuelve si se pulso A una vez.
- `ConsumeKickPress()`: devuelve si se pulso B una vez.

### `src/CombatSystem.js`

Responsabilidades principales:

- Sistema de combate estilo Mortal Kombat 2D en escena 3D.
- Maneja vida (HP), guardia (Guard bar) y stun escalonado.
- Calcula deteccion de golpe por rango en eje X.
- Aplica knockback cuando golpea directo.
- Emite eventos que `Player.js` escucha (hit, guardBroken, stunStart, stunEnd, death, etc).
- NO toca Three.js directamente; es logica pura de combate.

Mecanica principal:

- HP max: 100 cada jugador.
- Guardia max: 100 (se drena mientras bloquea, se regenera cuando suelta).
- Si guardia llega a 0: guardia rota + stun corto.
- Si recibe golpe directo: daño + stun escalado por combo (hits consecutivos).
- Golpe bloqueado: solo pasa 10% o 30% del daño segun tipo.
- Rango de golpe: ~1.8 para punch, ~2.2 para kick.

Rangos de golpe en X:

```
PUNCH_RANGE = 1.8
KICK_RANGE  = 2.2
```

Si `distanceX > range`: golpe no conecta, devuelve false.

### `src/CombatHUD.js`

Responsabilidades principales:

- Renderiza HUD en pantalla con barras de vida y guardia para ambos jugadores.
- Muestra indicadores de stun, guardia rota, combos.
- Se actualiza cada frame desde `SceneManager._RAF()`.

Eventos/Callbacks:

- `update(p1State, p2State, options)`: recibe estado de ambos jugadores y opciones de HUD.

Elementos visuales:

- Nombres de jugadores ("JAMES" P1, "P2" derecha).
- Barras de vida (verde).
- Barras de guardia (azul).
- Contador de combo (numero grande en centro).
- Indicadores de guardia rota (texto rojo).

### `src/Entity.js` y `src/EntityManager.js`

- Clases base poco usadas actualmente; pueden evolucionar si el proyecto crece.
- `Entity`: clase basica con nombre, parent, componentes.
- `EntityManager`: administrador de entidades (no integrado en el flujo principal todavia).

### `src/World.js`

- Archivo vacio; reservado para logica global del mundo o combate.


## 4. Flujo de ejecucion actual

1. El navegador abre `index.html`.
2. `index.js` crea `SceneManager`.
3. `SceneManager` crea renderer, escena, camara, luces, suelo y controles.
4. `SceneManager` crea dos controladores: `KeyControllers` (teclado) y `GamepadController` (gamepad).
5. `SceneManager` crea dos `Player` con posiciones iniciales en X = -4 y X = 4:
   - P1: posicion -4, input KeyControllers.
   - P2: posicion 4, input GamepadController.
6. Ambos jugadores se conectan como oponentes (`p1.oponente = p2`, vice versa).
7. Cada frame en `_RAF()`:
   - Actualizar gamepad: `this._gamepad.Update()`.
   - Actualizar ambos jugadores: `Player.Update(deltaTime)`.
   - Orientar jugadores a mirarse uno al otro (una sola vez): `faceTarget`.
   - Renderizar escena y HUD.

Dentro de `Player.Update(deltaTime)`:

1. Leer input continuo de movimiento desde `this._input._keys`.
2. Aplicar desplazamiento en X si hay input.
3. Leer pulsos de ataque/patada: `ConsumeAttackPress()` y `ConsumeKickPress()`.
4. Si hay pulso de ataque/patada, calcular distancia X a oponente y llamar `combat.landHit()`.
5. Actualizar animacion segun estado de movimiento/combate.
6. Actualizar mixer de animaciones: `this._mixer.update(deltaTime)`.

## 5. Recursos usados

Modelo y animaciones del personaje (usado por P1 y P2):

- `assets/james/malla.fbx`
- `assets/james/caminar.fbx`
- `assets/james/Idle.fbx`
- `assets/james/golpear.fbx`
- `assets/james/patear.fbx`

Escenario:

- `assets/sky.jpg` (textura de cielo)

Nota: Ambos jugadores cargan el mismo modelo FBX pero en posiciones y con inputs diferentes.

## 6. Sistema de capas de render (Layers)

Ambos personajes usan la capa 1.

Que significa:

- El modelo de cada personaje se coloca en `layers` 1.
- La luz ambiente local de cada personaje tambien esta en `layers` 1.
- La camara habilita `layers` 1.

Motivo:

- Permite que las luces locales afecten solo a los personajes y no al resto del escenario.

## 7. Animaciones actuales y su logica

### `Idle`

- Animacion por defecto cuando no hay movimiento ni accion ofensiva.
- Se reproduce en loop.

### `caminar`

- Se usa cuando el personaje se mueve.
- Se dispara una vez y queda sostenida al final mientras la tecla siga presionada.

### `golpear`

- Se reproduce cuando se pulsa J.
- Se reinicia si se vuelve a pulsar J.

### `patear`

- Se reproduce cuando se pulsa K.
- Se reinicia si se vuelve a pulsar K.

## 8. Como modificar cada parte sin romper el proyecto

### Cambiar movimiento

Archivo: `src/Player.js` metodo `Update(tiempo)`.

Ahí puedes cambiar:

- velocidad: `this._moveSpeed` en `_Init`.
- sentido del desplazamiento.
- restricciones de movimiento (actualmente solo eje X).

### Cambiar teclas (P1)

Archivo: `src/KeyControllers.js` en `_onKeyDown` y `_onKeyUp`.

Buscar `keyCode` y cambiar los numeros. Ej:
- W (87) -> cambiar a otra tecla si necesitas.
- J (74) -> cambiar para golpear.

### Cambiar controles gamepad (P2)

Archivo: `src/GamepadController.js` en `Update()`.

Cambiar:

- `gp.axes[0]`: eje usado para movimiento (0 = stick izq X, 1 = stick izq Y).
- `gp.buttons[0/1/4]`: botones mapeados.
- `dead`: deadzone del stick.

### Agregar una animacion nueva

Archivo: `src/Player.js` en `_LoadModel()`.

Pasos:

1. Colocar el FBX en `assets/james/`.
2. Cargar el clip en `_LoadModel()`:
   - `loader.load('nuevaAnimacion.fbx', (animacion) => { _OnLoad('nuevaAnimacion', animacion) })`
3. Guardar el clip dentro de `this._animaciones`.
4. Activarlo desde `Update()` o desde `_UpdateLocomotionAction()` segun condicion.

### Cambiar rango de golpe

Archivo: `src/CombatSystem.js` constantes en la clase.

Cambiar:

```javascript
static PUNCH_RANGE = 1.8;  // Distancia en X para conectar punch
static KICK_RANGE  = 2.2;  // Distancia en X para conectar kick
```

### Cambiar daño por ataque

Archivo: `src/CombatSystem.js` constantes.

Cambiar:

```javascript
static DMG_PUNCH        = 8;
static DMG_KICK         = 12;
static DMG_PUNCH_BLOCK  = 2;   // Daño pasante si bloquea
static DMG_KICK_BLOCK   = 3;
```

### Cambiar camara o luces

Archivo: `src/SceneManager.js`.

Modificar:

- `_CrearCamara()`: FOV, posicion, lookAt.
- `_CrearLuces()`: intensidad, direccion, posicion.
- `_CrearEntorno()`: fondo/sky.
- `_CrearSuelo()`: tamaño o material.

### Agregar un nuevo objeto o entidad

Archivo principal: `src/SceneManager.js`.

Si la entidad necesita actualizarse en cada frame, llamarla dentro de `_RAF()` igual que se hace con los jugadores.

### Cambiar posiciones iniciales

Archivo: `src/SceneManager.js` en `_CrearPersonaje()`.

Cambiar `p1Pos` y `p2Pos` (vectores `THREE.Vector3`).

## 9. Cosas que Claude deberia saber antes de tocar el codigo

- El proyecto ya tiene una base funcional de movimiento, combate e input para 2 jugadores.
- P1 usa teclado (WASD movimiento, JK ataques, L bloqueo).
- P2 usa gamepad (stick X, botones A/B/LB).
- La logica de input vive en `KeyControllers` y `GamepadController`; la logica de juego en `Player`.
- La logica de combate vive en `CombatSystem` (sin dependencias de Three.js).
- `SceneManager` debe seguir llamando a `Update` de ambos jugadores cada frame.
- Las animaciones dependen de los nombres exactos de los FBX.
- Cualquier cambio en capas debe mantener consistente camara, modelo y luz.
- Los jugadores se orientan automaticamente una sola vez cuando cargan los modelos.
- El movimiento esta restringido al eje X (strafe 2D).

## 10. Puntos delicados o posibles mejoras

- `keyCode` funciona, pero seria mejor migrar a `event.code`.
- `GamepadController` podria mejorar manejo de multiples gamepads o vibration.
- Deteccion de golpes es simple (distancia euclidiana en X); podria mejorarse con hitboxes mas complejas.
- Sistema de animaciones puede evolucionar a una maquina de estados mas formal.
- `EntityManager.js` y `World.js` estan poco usados; podrian organizar mejor el proyecto si crece.
- HUD actual es simple; podria mostrar mas informacion (timer de stun, combo counter, etc).
- No hay limites de escenario; los jugadores pueden salir fuera de rango visible.

## 11. Resumen corto para pasar a Claude

Si quieres pegarle este contexto a Claude en una sesion nueva, el resumen es:

> Juego 3D de pelea local 2P con Three.js. P1 usa teclado (WASD/JK/L), P2 usa gamepad (stick/A/B/LB). Movimiento restringido a eje X (strafe). Estructura: index.js → SceneManager (crea dos Players con inputs diferentes) → Player (maneja modelo, animaciones, combate). Sistema de combate separado en CombatSystem.js (logica pura, sin Three.js). Cámara isometrica fija (0,12,80) mirando al centro. Ambos players miran uno al otro al cargar. Animaciones: Idle, caminar (once+sostenida), golpear, patear (ambos one-shot con re-disparo). Archivos clave: src/Player.js (comportamiento, movimiento), src/CombatSystem.js (vida/guardia/stun/combos), src/SceneManager.js (dos jugadores, loop principal), src/KeyControllers.js (teclado), src/GamepadController.js (gamepad). No tocar referencias a `_mesh` (usar `_model`); estan separadas las capas de render (layer 1 para personajes).

