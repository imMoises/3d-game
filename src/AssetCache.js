/**
 * AssetCache.js
 *
 * Cargador FBX con caché por path. La primera carga descarga + parsea el
 * archivo; las siguientes devuelven la misma promesa, así que múltiples
 * peticiones simultáneas comparten un único trabajo.
 *
 * Helpers:
 *   - loadFBX(path) → Promise<THREE.Group>   (template original)
 *   - cloneFBXAsync(path) → Promise<{ object, animations }>
 *       Devuelve un clon listo para añadir a la escena, con las animaciones
 *       compartidas (las clips se reusan; cada instancia crea su propio
 *       AnimationMixer apuntando al objeto clonado).
 *
 * Para mallas con esqueleto (enemigos, personajes) intentamos usar
 * SkeletonUtils.clone para que las animaciones funcionen en el clon.
 * Para mallas estáticas (árboles, hierba, rocas) basta con .clone().
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';
import { FBXLoader } from 'https://cdn.jsdelivr.net/npm/three@0.118.1/examples/jsm/loaders/FBXLoader.js';

let _SkeletonUtils = null;
// Importación dinámica de SkeletonUtils para no fallar si la URL cambia.
async function _ensureSkeletonUtils() {
  if (_SkeletonUtils) return _SkeletonUtils;
  try {
    const mod = await import(
      'https://cdn.jsdelivr.net/npm/three@0.118/examples/jsm/utils/SkeletonUtils.js'
    );
    _SkeletonUtils = mod.SkeletonUtils ?? mod;
  } catch (err) {
    console.warn('[AssetCache] SkeletonUtils no disponible, usando .clone() fallback.', err);
    _SkeletonUtils = { clone: (obj) => obj.clone() };
  }
  return _SkeletonUtils;
}

const _fbxCache = new Map(); // path -> Promise<THREE.Group>

const _loader = new FBXLoader();

export function loadFBX(path) {
  if (!_fbxCache.has(path)) {
    const p = new Promise((resolve, reject) => {
      _loader.load(
        path,
        (fbx) => resolve(fbx),
        undefined,
        (err) => reject(err),
      );
    });
    _fbxCache.set(path, p);
  }
  return _fbxCache.get(path);
}

/**
 * Devuelve una copia clonada del FBX cacheado, junto con la lista de clips
 * de animación originales (las clips se pueden compartir entre clones, solo
 * el AnimationMixer es por instancia).
 *
 * @param {string} path
 * @param {object} [opts]
 * @param {boolean} [opts.skinned=false]  Si tiene SkinnedMesh con animaciones.
 */
export async function cloneFBXAsync(path, { skinned = false } = {}) {
  const template = await loadFBX(path);
  let object;
  if (skinned) {
    const SK = await _ensureSkeletonUtils();
    object = SK.clone(template);
  } else {
    object = template.clone(true);
  }
  return {
    object,
    animations: template.animations || [],
  };
}

/**
 * Pre-carga (en paralelo) un conjunto de assets sin esperarlos individualmente.
 * Útil al arrancar el juego para evitar parones cuando spawnean por primera vez.
 */
export function preloadAll(paths) {
  return Promise.all(paths.map((p) => loadFBX(p).catch((err) => {
    console.warn('[AssetCache] No se pudo precargar', p, err);
    return null;
  })));
}
