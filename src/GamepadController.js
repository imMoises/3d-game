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
            saltar: false,
            ataquePressed: false,
            patadaPressed: false,
            saltarPressed: false,
            // Nuevos para RPG / modo
            mejorar: false,
            mejorarPressed: false,
            modoToggle: false,
            modoTogglePressed: false,
        };

        // Magnitud bruta de los sticks (para movimiento analógico 3D en RPG)
        this._axisX = 0; // horizontal (-1..1)
        this._axisY = 0; // vertical   (-1..1)

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
            this._keys.adelante = false;
            this._keys.atras    = false;
            this._keys.cubrirse = false;
            this._axisX = 0;
            this._axisY = 0;
            this._prevButtons = [];
            return;
        }

        // Axes: stick izquierdo
        const x = gp.axes[0] || 0;
        const y = gp.axes[1] || 0;
        const dead = 0.25;
        // Magnitud cruda (para movimiento analógico 3D en RPG)
        this._axisX = Math.abs(x) > dead ? x : 0;
        this._axisY = Math.abs(y) > dead ? y : 0;
        // Compatibilidad combate 2D
        this._keys.izquierda = x < -dead;
        this._keys.derecha   = x > dead;
        this._keys.adelante  = y < -dead;
        this._keys.atras     = y > dead;

        // Buttons mapping (standard layout):
        //   0=A (ataque), 1=B (patada), 2=X (mejora E), 3=Y (saltar)
        //   4=LB (cubrirse), 9=Start (modo toggle R)
        const btnA     = gp.buttons[0]?.pressed;
        const btnB     = gp.buttons[1]?.pressed;
        const btnX     = gp.buttons[2]?.pressed;
        const btnY     = gp.buttons[3]?.pressed;
        const btnLB    = gp.buttons[4]?.pressed;
        const btnStart = gp.buttons[9]?.pressed;

        // Set continuous states
        this._keys.ataque   = !!btnA;
        this._keys.patada   = !!btnB;
        this._keys.cubrirse = !!btnLB;
        this._keys.saltar   = !!btnY;
        this._keys.mejorar  = !!btnX;
        this._keys.modoToggle = !!btnStart;

        // Detect edge presses to create pulses
        const prev = this._prevButtons;
        if (btnA     && !prev[0]) this._keys.ataquePressed      = true;
        if (btnB     && !prev[1]) this._keys.patadaPressed      = true;
        if (btnX     && !prev[2]) this._keys.mejorarPressed     = true;
        if (btnY     && !prev[3]) this._keys.saltarPressed      = true;
        if (btnStart && !prev[9]) this._keys.modoTogglePressed  = true;

        // store previous
        this._prevButtons[0] = !!btnA;
        this._prevButtons[1] = !!btnB;
        this._prevButtons[2] = !!btnX;
        this._prevButtons[3] = !!btnY;
        this._prevButtons[9] = !!btnStart;
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

    ConsumeJumpPress(){
        const p = this._keys.saltarPressed;
        this._keys.saltarPressed = false;
        return p;
    }

    ConsumeUpgradePress(){
        const p = this._keys.mejorarPressed;
        this._keys.mejorarPressed = false;
        return p;
    }

    ConsumeModeTogglePress(){
        const p = this._keys.modoTogglePressed;
        this._keys.modoTogglePressed = false;
        return p;
    }

    // Acceso al stick (para movimiento 3D en RPG); para teclado devolvemos
    // un fallback discreto desde adelante/atras/izquierda/derecha.
    GetAxisX(){ return this._axisX ?? 0; }
    GetAxisY(){ return this._axisY ?? 0; }
}
