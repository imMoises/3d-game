/**
 * CharacterSelect.js
 * Pantalla de selección de 2 personajes para juego 1v1
 * Muestra personajes disponibles en el centro y los seleccionados a los lados
 */

export class CharacterSelect {
  constructor(onPlayCallback) {
    this.onPlayCallback = onPlayCallback;
    this.selectedCharacters = {
      player1: null,
      player2: null,
    };
    
    // Personajes disponibles
    this.characters = [
      {
        id: 'adventurer',
        name: 'Aventurero',
        color: '#4CAF50',
        modelPath: 'assets/Adventurer/Adventurer.fbx',
        description: 'Rápido y ágil',
      },
      {
        id: 'businessman',
        name: 'Hombre de Negocios',
        color: '#2196F3',
        modelPath: 'assets/Business-Man/Business-Man.fbx',
        description: 'Fuerte y equilibrado',
      },
      {
        id: 'knight',
        name: 'Caballero',
        color: '#FF9800',
        modelPath: 'assets/Knight/Knight.fbx',
        description: 'Defensivo y resistente',
      },
      {
        id: 'wizard',
        name: 'Mago',
        color: '#9C27B0',
        modelPath: 'assets/Wizard/Wizard.fbx',
        description: 'Mágico y poderoso',
      },
    ];
    
    this.container = null;
  }

  /**
   * Monta la interfaz de selección en el DOM
   */
  mount(parentElement) {
    // Crear contenedor principal
    this.container = document.createElement('div');
    this.container.id = 'character-select-screen';
    this.container.innerHTML = this._getHTML();
    parentElement.appendChild(this.container);
    
    this._attachEventListeners();
  }

  /**
   * Desmonta la interfaz de selección
   */
  unmount() {
    if (this.container && this.container.parentNode) {
      this.container.parentNode.removeChild(this.container);
      this.container = null;
    }
  }

  /**
   * Retorna el HTML de la interfaz
   */
  _getHTML() {
    let characterCardsHTML = this.characters
      .map(
        (char) => `
      <div class="char-card" data-char-id="${char.id}">
        <div class="char-card-color" style="background-color: ${char.color};"></div>
        <h3>${char.name}</h3>
        <p>${char.description}</p>
      </div>
    `
      )
      .join('');

    return `
      <div class="char-select-container">
        <h1>SELECCIONA TU PERSONAJE</h1>
        <p class="subtitle">2 Jugadores</p>
        
        <!-- Player 1 Selection -->
        <div class="player-section player1-section">
          <h2>JUGADOR 1 (Teclado)</h2>
          <div class="selected-character" id="p1-selected">
            <div class="placeholder">Elige tu personaje →</div>
          </div>
        </div>
        
        <!-- Center: Available Characters -->
        <div class="center-section">
          <h2>PERSONAJES DISPONIBLES</h2>
          <div class="characters-grid">
            ${characterCardsHTML}
          </div>
        </div>
        
        <!-- Player 2 Selection -->
        <div class="player-section player2-section">
          <h2>JUGADOR 2 (Gamepad)</h2>
          <div class="selected-character" id="p2-selected">
            <div class="placeholder">← Elige tu personaje</div>
          </div>
        </div>
        
        <!-- Play Button -->
        <div class="play-button-container">
          <button id="play-btn" class="play-btn" disabled>
            AMBOS PERSONAJES DEBEN SER SELECCIONADOS
          </button>
        </div>
      </div>
    `;
  }

  /**
   * Adjunta event listeners a los elementos
   */
  _attachEventListeners() {
    const cards = this.container.querySelectorAll('.char-card');
    cards.forEach((card) => {
      card.addEventListener('click', (e) => this._onCharacterClick(e, card));
    });

    const playBtn = this.container.getElementById('play-btn');
    playBtn.addEventListener('click', () => this._onPlayClick());
  }

  /**
   * Maneja el click en un personaje
   */
  _onCharacterClick(e, cardElement) {
    const charId = cardElement.dataset.charId;
    const character = this.characters.find((c) => c.id === charId);

    if (!character) return;

    // Determinar si es click del jugador 1 o jugador 2
    // Usamos un simple toggle: si player1 está vacío, ir a player1; si player2 está vacío, ir a player2
    // Si ambos están llenos, reemplazar el que se seleccionó más recientemente o usar lógica alternativa

    // Lógica simple: si player1 vacío -> player1; si player2 vacío -> player2; si ambos llenos -> rotar
    if (!this.selectedCharacters.player1) {
      this.selectedCharacters.player1 = character;
    } else if (!this.selectedCharacters.player2) {
      this.selectedCharacters.player2 = character;
    } else {
      // Si ambos están llenos, reemplazar player1 (o podrías hacer un toggle)
      this.selectedCharacters.player1 = character;
      this.selectedCharacters.player2 = null;
    }

    this._updateUI();
  }

  /**
   * Actualiza la interfaz visual
   */
  _updateUI() {
    const p1Selected = this.container.querySelector('#p1-selected');
    const p2Selected = this.container.querySelector('#p2-selected');
    const playBtn = this.container.querySelector('#play-btn');

    // Actualizar Player 1
    if (this.selectedCharacters.player1) {
      const char = this.selectedCharacters.player1;
      p1Selected.innerHTML = `
        <div class="char-display" style="border-left: 5px solid ${char.color};">
          <h3>${char.name}</h3>
          <p>${char.description}</p>
          <small>✓ Seleccionado</small>
        </div>
      `;
    } else {
      p1Selected.innerHTML = '<div class="placeholder">Elige tu personaje →</div>';
    }

    // Actualizar Player 2
    if (this.selectedCharacters.player2) {
      const char = this.selectedCharacters.player2;
      p2Selected.innerHTML = `
        <div class="char-display" style="border-right: 5px solid ${char.color};">
          <h3>${char.name}</h3>
          <p>${char.description}</p>
          <small>✓ Seleccionado</small>
        </div>
      `;
    } else {
      p2Selected.innerHTML = '<div class="placeholder">← Elige tu personaje</div>';
    }

    // Actualizar botón de juego
    const bothSelected =
      this.selectedCharacters.player1 && this.selectedCharacters.player2;
    playBtn.disabled = !bothSelected;
    playBtn.textContent = bothSelected
      ? '▶ COMENZAR BATALLA'
      : 'AMBOS PERSONAJES DEBEN SER SELECCIONADOS';
  }

  /**
   * Maneja el click del botón Play
   */
  _onPlayClick() {
    if (
      this.selectedCharacters.player1 &&
      this.selectedCharacters.player2
    ) {
      if (this.onPlayCallback) {
        this.onPlayCallback(this.selectedCharacters);
      }
    }
  }
}
