import { SceneManager } from './src/SceneManager.js';
import { CharacterSelect } from './src/CharacterSelect.js';

let app = null;
let characterSelect = null;

window.onload = () => {
  // Mostrar pantalla de selección de personajes
  characterSelect = new CharacterSelect(onCharacterSelected);
  characterSelect.mount(document.getElementById('game-container'));
};

/**
 * Callback cuando se han seleccionado ambos personajes
 */
function onCharacterSelected(selectedCharacters) {
  console.log('Personajes seleccionados:', selectedCharacters);
  
  // Desmontar pantalla de selección
  characterSelect.unmount();
  
  // Limpiar el contenedor
  const container = document.getElementById('game-container');
  container.innerHTML = '';
  
  // Iniciar el juego con los personajes seleccionados
  app = new SceneManager(selectedCharacters);
}
