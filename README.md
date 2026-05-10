# 3D Game - Guia para Colaboradores

Este proyecto es un prototipo de juego 3D de pelea usando Three.js y modelos FBX.

## 1. Estructura del proyecto

- `index.html`: contenedor del canvas (`#game-container`).
- `index.js`: punto de entrada, crea `SceneManager`.
- `styles.css`: estilos base de la pagina.
- `src/SceneManager.js`: renderer, camara, luces, entorno, suelo, loop principal.
- `src/Player.js`: carga del personaje, movimiento y maquina de animaciones.
- `src/KeyControllers.js`: mapeo de teclado y estado de teclas.
- `assets/james/`: malla FBX y animaciones FBX del personaje.

## 2. Como ejecutar el proyecto

No uses `file:///` directo, porque la carga de assets puede fallar por CORS.

Opciones recomendadas:

1. VS Code + extension Live Server.
2. Cualquier servidor estatico (por ejemplo `npx serve .`).

## 3. Controles actuales

- `W`: mover adelante.
- `S`: mover atras.
- `A`: mover izquierda (strafe).
- `D`: mover derecha (strafe).
- `J`: golpear.
- `K`: patear.

Notas:

- `J` y `K` se pueden relanzar sin esperar a que termine la animacion anterior.
- La locomocion usa `caminar` cuando hay movimiento y `Idle` cuando no.

## 4. Como modificar cada cosa

### Escena, camara y render (`src/SceneManager.js`)

Modificar aqui si necesitas:

- Cambiar FOV, near/far, posicion de camara (`_CrearCamara`).
- Cambiar luces globales (`_CrearLuces`).
- Cambiar fondo/sky (`_CrearEntorno`).
- Cambiar piso (`_CrearSuelo`).
- Ajustar loop principal y delta time (`_RAF`).

Regla importante:

- Si agregas entidades que deban actualizarse por frame, llamalas dentro de `_RAF` igual que `this._player.Update(deltaTime)`.

### Personaje, movimiento y animaciones (`src/Player.js`)

Modificar aqui si necesitas:

- Velocidad de movimiento: `this._moveSpeed` en `_Init`.
- Logica de desplazamiento: metodo `Update`.
- Carga de malla y clips FBX: `_LoadModel`.
- Transiciones entre animaciones: `_SetAction`.
- Regla de locomocion (`caminar`/`Idle`): `_UpdateLocomotionAction`.

Reglas actuales de animacion:

- `caminar`: se dispara en modo `once` y se mantiene al final mientras hay movimiento.
- `Idle`: loop normal.
- `golpear` y `patear`: `LoopOnce` con reinicio forzado cuando se pulsa de nuevo.

### Teclado e input (`src/KeyControllers.js`)

Modificar aqui si necesitas:

- Cambiar teclas: editar `keyCode` en `_onKeyDown/_onKeyUp`.
- Agregar nuevas acciones: ampliar `this._keys` y crear metodos de consumo si son acciones por pulso.

Dos tipos de entradas en el controlador:

- Estado continuo: `adelante`, `atras`, `izquierda`, `derecha`.
- Pulso (one-shot): `ataquePressed`, `patadaPressed` consumidos con `ConsumeAttackPress()` y `ConsumeKickPress()`.

## 5. Como agregar una animacion nueva

Ejemplo: agregar `bloquear.fbx`.

1. Copiar `bloquear.fbx` a `assets/james/`.
2. En `Player._LoadModel()`, cargar el clip:
   - `loader.load('bloquear.fbx', (animacion) => { _OnLoad('bloquear', animacion) })`
3. Definir cuando se activa en `Update()` leyendo una tecla del `KeyControllers`.
4. Lanzar la accion con `_SetAction('bloquear', true, true)` si quieres one-shot, o sin `once` para loop.

## 6. Como agregar una tecla nueva

Ejemplo: tecla `L` para una accion especial.

1. En `KeyControllers._keys`, agregar flags:
   - continuo: `especial: false`
   - pulso: `especialPressed: false`
2. En `_onKeyDown`, mapear keyCode de `L` (76).
3. En `_onKeyUp`, resetear estado continuo.
4. Si es por pulso, crear `ConsumeSpecialPress()`.
5. En `Player.Update()`, leer esa entrada y llamar `_SetAction(...)`.

## 7. Luz ambiente solo para personaje

Actualmente el personaje usa una luz ambiente propia y capa dedicada.

- En `Player.js`, el modelo y su luz se ponen en `layers` 1.
- En `SceneManager.js`, la camara habilita `layers` 1.

Si cambias capas, revisa que camara, modelo y luz coincidan.

## 8. Convenciones recomendadas para colaborar

- Mantener nombres de animaciones consistentes (`Idle`, `caminar`, `golpear`, `patear`).
- No mezclar logica de input dentro de `SceneManager`; dejarla en `KeyControllers` y `Player`.
- Probar siempre:
  - movimiento en 4 direcciones,
  - transicion `Idle <-> caminar`,
  - spam de `J/K`.
- Si agregas nuevas acciones, confirmar que no rompan el flujo de locomocion.

## 9. Checklist rapido antes de hacer push

1. La app carga sin errores de consola.
2. El personaje responde a W/A/S/D.
3. J y K se relanzan correctamente.
4. No hay referencias a clips FBX inexistentes.
5. La escena sigue renderizando con FPS estable.

## 10. Pendientes tecnicos sugeridos

- Migrar de `keyCode` a `event.code` (mas moderno).
- Separar maquina de estados de animacion en una clase propia.
- Agregar limites de escenario y colisiones basicas.
- Agregar pruebas manuales documentadas por feature.
