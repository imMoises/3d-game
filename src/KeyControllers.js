export class KeyControllers{
    constructor(){
        this._Init()
    }

    _Init(){
        this._keys = {
            adelante: false,
            atras: false,
            izquierda: false,
            derecha: false,
            ataque: false,
            patada: false,
            cubrirse: false,
            saltar: false,
            ataquePressed: false,
            patadaPressed: false,
            saltarPressed: false,
        }
        document.addEventListener('keydown', (e) => this._onKeyDown(e), false);
        document.addEventListener('keyup', (e) => this._onKeyUp(e), false);
    }

     _onKeyDown(event) {
        switch (event.keyCode) {
        case 87: // w
            this._keys.adelante = true;
            break;
        case 65: // a
            this._keys.izquierda = true;
            break;
        case 83: // s
            this._keys.atras = true;
            break;
        case 68: // d
            this._keys.derecha = true;
            break;
        case 74: // J
            // edge: solo marcar pressed en el flanco de bajada
            if (!this._keys.ataque) this._keys.ataquePressed = true;
            this._keys.ataque = true;
            break;
        case 75: // k
            if (!this._keys.patada) this._keys.patadaPressed = true;
            this._keys.patada = true;
            break;
        case 76: // L
            this._keys.cubrirse = true;
            break;
        case 32: // Space → saltar
            if (!this._keys.saltar) this._keys.saltarPressed = true;
            this._keys.saltar = true;
            // Evitar el scroll de la página al usar la barra espaciadora
            event.preventDefault?.();
            break;
        }
    }
    _onKeyUp(event) {
        switch (event.keyCode) {
        case 87: // w
            this._keys.adelante = false;
            break;
        case 65: // a
            this._keys.izquierda = false;
            break;
        case 83: // s
            this._keys.atras = false;
            break;
        case 68: // d
            this._keys.derecha = false;
            break;
        case 74: // J
            this._keys.ataque = false;
            break;
        case 75: // k
            this._keys.patada = false;
            break;
        case 76: // L
            this._keys.cubrirse = false;
            break;
        case 32: // Space
            this._keys.saltar = false;
            event.preventDefault?.();
            break;
        }
    }

    // ── Consumidores de "pulsación" (edge-triggered) ──────────────────────
    // Player.js usa estos para disparar un único golpe por pulsación,
    // exactamente igual que GamepadController.
    ConsumeAttackPress(){
        const p = this._keys.ataquePressed;
        this._keys.ataquePressed = false;
        return p;
    }

    ConsumeKickPress(){
        const p = this._keys.patadaPressed;
        this._keys.patadaPressed = false;
        return p;
    }

    ConsumeJumpPress(){
        const p = this._keys.saltarPressed;
        this._keys.saltarPressed = false;
        return p;
    }

}
