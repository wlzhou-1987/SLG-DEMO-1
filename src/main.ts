import './style.css';
import { Game } from './game';
import { createMapState } from './core/map';
import { MAP_OVERRIDES } from './config/map';
import { PrepBoard } from './render/prep-board';
import { createPrepScreen } from './ui/prep';
import { showNotice } from './ui/notice';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const map = createMapState(MAP_OVERRIDES);

const prep = createPrepScreen(
  roster => {
    board.dispose();
    prep.root.remove();
    new Game(canvas, roster);
  },
  () => board.render()
);

const board = new PrepBoard(canvas, map, {
  getRoster: () => prep.getRoster(),
  onChange: next => prep.setBoardRoster(next),
  onInvalid: () => showNotice('部署区外，不可落位')
});

document.getElementById('app')!.appendChild(prep.root);
