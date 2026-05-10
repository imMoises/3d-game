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
            ataquePressed: false,
            patadaPressed: false,
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
            this._keys.ataque = true;
            this._keys.ataquePressed = true;
            break;
        case 75: // k
            this._keys.patada = true;
            this._keys.patadaPressed = true;
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
        }
  }

    ConsumeAttackPress(){
        const pressed = this._keys.ataquePressed
        this._keys.ataquePressed = false
        return pressed
    }

    ConsumeKickPress(){
        const pressed = this._keys.patadaPressed
        this._keys.patadaPressed = false
        return pressed
    }
}