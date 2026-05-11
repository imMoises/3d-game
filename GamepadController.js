export class GamepadController {
    constructor(index = 0) {
        this.index = index;
        this._keys = {
            adelante: false,
            atras: false,
            izquierda: false,
            derecha: false,
            ataque: false,
            patada: false,
            cubrirse: false,
            ataquePressed: false,
            patadaPressed: false,
        };

        this._prevButtons = [];
    }

    // Poll gamepad state; call each frame with delta if needed
    Update() {
        const pads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = pads[this.index];
        if (!gp) {
            // clear continuous states when no gamepad
            this._keys.izquierda = false;
            this._keys.derecha = false;
            this._keys.cubrirse = false;
            this._prevButtons = [];
            return;
        }

        // Axes: horizontal movement on axis 0
        const x = gp.axes[0] || 0;
        const dead = 0.3;
        this._keys.izquierda = x < -dead;
        this._keys.derecha = x > dead;

        // Buttons mapping (standard layout): 0=A,1=B,4=LB (use as block)
        const btnA = gp.buttons[0]?.pressed;
        const btnB = gp.buttons[1]?.pressed;
        const btnLB = gp.buttons[4]?.pressed;

        // Set continuous states
        this._keys.ataque = !!btnA;
        this._keys.patada = !!btnB;
        this._keys.cubrirse = !!btnLB;

        // Detect edge presses to create pulses
        const prev = this._prevButtons;
        if (btnA && !prev[0]) this._keys.ataquePressed = true;
        if (btnB && !prev[1]) this._keys.patadaPressed = true;

        // store previous
        this._prevButtons[0] = !!btnA;
        this._prevButtons[1] = !!btnB;
    }

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
}
