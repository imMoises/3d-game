# Contexto completo del proyecto 3D Game

Este archivo resume la estructura real del proyecto, el significado de cada archivo y el flujo de ejecucion actual para que otro asistente pueda entender rapido donde tocar.

## 1. Resumen del proyecto

Es un prototipo de juego 3D de pelea hecho con Three.js y modelos FBX.

La aplicacion hace lo siguiente:

- Inicializa una escena 3D en el navegador.
- Carga un personaje FBX con sus animaciones.
- Lee input de teclado para movimiento y ataques.
- Reproduce animaciones segun el estado del jugador.
- Usa una luz ambiente exclusiva para el personaje ademas de las luces globales de la escena.

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
  Player.js
  SceneManager.js
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

- Crea el renderer WebGL.
- Configura sombras y resolucion.
- Crea la camara principal.
- Crea luces globales de la escena.
- Crea el fondo del cielo.
- Crea el suelo.
- Crea OrbitControls.
- Instancia al jugador.
- Ejecuta el loop principal de render y actualizacion.

Puntos importantes del archivo:

- Usa `THREE.Clock()` para calcular delta time.
- Llama `this._player.Update(deltaTime)` en cada frame.
- La camara tiene habilitada la capa 1 para ver el personaje y su luz local.

### `src/Player.js`

Responsabilidades principales:

- Carga el modelo FBX del personaje.
- Carga las animaciones FBX.
- Controla el movimiento del personaje.
- Controla el cambio entre animaciones.
- Maneja vida, bloqueo, aturdimiento y referencia al oponente.
- Ejecuta golpes y patadas.

Estado actual del jugador:

- `vida`: puntos de vida.
- `estaCubriendose`: estado de bloqueo.
- `estaAturdido`: estado temporal de stun al recibir un golpe directo.
- `oponente`: referencia a otro jugador para detectar impacto.
- `this._moveSpeed`: velocidad de desplazamiento.
- `this._animaciones`: mapa de clips y acciones cargadas.
- `this._currentAction`: animacion actual activa.

Comportamiento actual:

- A y D mueven lateralmente al personaje.
- W y S mueven adelante y atras.
- J dispara golpe.
- K dispara patada.
- L activa bloqueo.
- Golpe y patada se pueden relanzar aunque una ejecucion anterior siga en curso.
- `caminar` se mantiene cuando hay movimiento y `Idle` cuando no.

### `src/KeyControllers.js`

Responsabilidades principales:

- Captura eventos de teclado con `keydown` y `keyup`.
- Guarda el estado continuo de movimiento.
- Guarda pulsos de ataque y patada para acciones de una sola activacion.
- Guarda el estado de bloqueo.

Tipos de input:

- Continuo: `adelante`, `atras`, `izquierda`, `derecha`, `ataque`, `patada`, `cubrirse`.
- Pulso: `ataquePressed`, `patadaPressed`.

Metodos importantes:

- `ConsumeAttackPress()`: devuelve si se pulso J una vez y limpia el pulso.
- `ConsumeKickPress()`: devuelve si se pulso K una vez y limpia el pulso.

### `src/Entity.js`

- Contiene una clase base muy simple llamada `Entity`.
- Tiene propiedades genericas como `nombre`, `parent` y `componentes`.
- Por ahora es una base sin mucho uso real.

### `src/EntityManager.js`

- Existe en la estructura, pero en el estado actual no esta integrado en el flujo principal.
- Podria servir como administrador de entidades si el proyecto crece.

### `src/World.js`

- Existe en la estructura, pero esta vacio.
- Podria usarse para separar logica global del mundo o del combate.

## 4. Flujo de ejecucion actual

1. El navegador abre `index.html`.
2. `index.js` crea `SceneManager`.
3. `SceneManager` crea renderer, escena, camara, luces, suelo y controles.
4. `SceneManager` crea `Player`.
5. `Player` carga el modelo y las animaciones FBX.
6. Cada frame, `SceneManager` llama `Player.Update(deltaTime)`.
7. `Player` lee `KeyControllers` y decide movimiento y animacion.

## 5. Recursos usados por el jugador

Modelo y animaciones del personaje:

- `assets/james/malla.fbx`
- `assets/james/caminar.fbx`
- `assets/james/Idle.fbx`
- `assets/james/golpear.fbx`
- `assets/james/patear.fbx`

Escenario:

- `assets/sky.jpg`

## 6. Sistema de capas de render

El personaje usa la capa 1.

Que significa esto:

- El modelo del personaje se coloca en `layers` 1.
- La luz ambiente local del personaje tambien esta en `layers` 1.
- La camara habilita `layers` 1.

Motivo:

- Permite que la luz local afecte solo al personaje y no al resto del escenario.

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

Archivo: `src/Player.js`

Buscar el metodo `Update(tiempo)`.

Ahí puedes cambiar:

- velocidad de movimiento,
- sentido del desplazamiento,
- bloqueo de movimiento,
- interaccion con animaciones.

### Cambiar teclas

Archivo: `src/KeyControllers.js`

Buscar `_onKeyDown` y `_onKeyUp`.

Ahí puedes cambiar:

- que tecla dispara cada accion,
- que acciones son continuas,
- que acciones son de pulso.

### Agregar una animacion nueva

Archivo: `src/Player.js`

Pasos:

1. Colocar el FBX en `assets/james/`.
2. Cargarlo en `_LoadModel()`.
3. Guardar el clip dentro de `this._animaciones`.
4. Activarlo desde `Update()` o desde `_UpdateLocomotionAction()`.

### Agregar un nuevo objeto o entidad

Archivo principal: `src/SceneManager.js`

Si la entidad necesita actualizarse en cada frame, hay que llamarla dentro de `_RAF()`.

### Ajustar camara o luces

Archivo: `src/SceneManager.js`

Modificar:

- `_CrearCamara()` para FOV o posicion.
- `_CrearLuces()` para intensidad o direccion.
- `_CrearEntorno()` para fondo.
- `_CrearSuelo()` para tamaño o material.

## 9. Cosas que Claude deberia saber antes de tocar el codigo

- El proyecto ya tiene una base funcional de movimiento, combate e input.
- La logica de input vive en `KeyControllers` y la logica de juego en `Player`.
- `SceneManager` debe seguir llamando al `Update` del jugador cada frame.
- Las animaciones dependen de los nombres exactos de los FBX.
- Cualquier cambio en capas debe mantener consistente camara, modelo y luz.

## 10. Puntos delicados o posibles mejoras

- `keyCode` funciona, pero seria mejor migrar a `event.code`.
- `EntityManager.js` y `World.js` estan poco usados; podrian organizar mejor el proyecto si crece.
- La deteccion de golpes es simple y usa distancia entre modelos.
- El sistema de animaciones puede evolucionar a una maquina de estados mas formal.

## 11. Resumen corto para pasar a Claude

Si quieres pegarle este contexto a Claude, el resumen es:

> Proyecto 3D de pelea con Three.js. El arranque vive en `index.js`, la escena en `src/SceneManager.js`, el personaje y sus animaciones en `src/Player.js`, y el teclado en `src/KeyControllers.js`. El jugador usa W/A/S/D para movimiento, J para golpear, K para patear y L para bloquear. `SceneManager` llama `Player.Update(deltaTime)` cada frame. El modelo y su luz local usan capa 1 para iluminar solo al personaje. Las animaciones FBX cargadas son `Idle`, `caminar`, `golpear` y `patear`.
