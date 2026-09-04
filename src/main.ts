import './style.css';
import { Game } from './game';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const game = new Game(canvas);
// 调试钩子（M4 验证期临时，收尾删除）
(window as unknown as { __game?: Game }).__game = game;
