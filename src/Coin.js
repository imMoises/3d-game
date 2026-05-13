/**
 * Coin.js
 *
 * Moneda dorada que rota y flota. Se recoge cuando un jugador la atraviesa.
 */

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.118/build/three.module.js';

const PICKUP_RADIUS = 2.0;

export class Coin {

  constructor(scene, position, value = 1) {
    this.scene  = scene;
    this.value  = value;
    this.collected = false;

    const geom = new THREE.CylinderGeometry(0.4, 0.4, 0.12, 18);
    const mat  = new THREE.MeshStandardMaterial({
      color:     0xffd23f,
      emissive:  0xffaa00,
      emissiveIntensity: 0.35,
      roughness: 0.3,
      metalness: 0.8,
    });
    this.mesh = new THREE.Mesh(geom, mat);
    this.mesh.castShadow = true;
    // De canto, como un disco que rota
    this.mesh.rotation.x = Math.PI / 2;
    this.mesh.position.copy(position);
    this.mesh.position.y = 1.0;
    this._baseY = 1.0;
    this._phase = Math.random() * Math.PI * 2;
    this.scene.add(this.mesh);
  }

  update(delta, players) {
    if (this.collected) return;

    this._phase += delta;
    this.mesh.rotation.z += delta * 3;                 // gira sobre sí misma
    this.mesh.position.y = this._baseY + Math.sin(this._phase * 3) * 0.18;

    // Detectar pickup
    for (const p of players) {
      if (!p?._model || p.stats?.hp_current <= 0) continue;
      const dx = p._model.position.x - this.mesh.position.x;
      const dz = p._model.position.z - this.mesh.position.z;
      if (dx * dx + dz * dz < PICKUP_RADIUS * PICKUP_RADIUS) {
        this._collectBy(p);
        return;
      }
    }
  }

  _collectBy(player) {
    this.collected = true;
    player.stats?.addCoins(this.value);
    this.dispose();
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry?.dispose();
      this.mesh.material?.dispose();
    }
    this.mesh = null;
  }
}
