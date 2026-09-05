import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  // Electron 打包后以 file:// 加载 dist/index.html，资源必须相对路径
  base: './',
  resolve: {
    alias: {
      '@core': resolve(__dirname, 'src/core'),
      '@config': resolve(__dirname, 'src/config'),
      '@render': resolve(__dirname, 'src/render'),
      '@ui': resolve(__dirname, 'src/ui'),
    },
  },
});
