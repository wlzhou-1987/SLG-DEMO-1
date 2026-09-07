import './style.css';
import { Game } from './game';
import { createPrepScreen } from './ui/prep';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const prep = createPrepScreen(roster => {
  prep.root.remove();
  new Game(canvas, roster);
});
document.getElementById('app')!.appendChild(prep.root);
