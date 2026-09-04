import './style.css';

const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;

function resizeCanvas() {
  const wrap = canvas.parentElement!;
  canvas.width = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
}

resizeCanvas();
window.addEventListener('resize', resizeCanvas);

const ctx = canvas.getContext('2d')!;
ctx.fillStyle = '#0d0f13';
ctx.fillRect(0, 0, canvas.width, canvas.height);
ctx.fillStyle = '#9aa4b2';
ctx.font = '16px sans-serif';
ctx.textAlign = 'center';
ctx.fillText('SLG DEMO 1 — 工程初始化完成', canvas.width / 2, canvas.height / 2);
