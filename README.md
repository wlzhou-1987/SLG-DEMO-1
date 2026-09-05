# DEMO_1 — 游戏 DEMO

用于学习和实践的游戏 DEMO 项目。最终目标：交付一个可运行的游戏 DEMO。

## 当前状态

**M2 进行中**（2026-09-04）：M1 设计定稿完成，正在实现六边形棋盘渲染与交互。

- [x] M1 设计定稿：逐项确认 [docs/GAME-DESIGN.md](docs/GAME-DESIGN.md) ✅
- [ ] M2 棋盘与选中：渲染棋盘和单位，点选显示移动/攻击范围（进行中）
- [ ] M3 战斗闭环：移动、攻击、结算（含反击/追击）、战斗预报
- [ ] M4 回合与AI：敌方回合 AI、回合循环、胜负判定
- [ ] M5 打磨：地形效果、信息面板、伤害反馈、数值平衡

## 技术栈

Vite + TypeScript（strict）+ 原生 Canvas + Vitest；Electron 桌面壳用于打包独立 exe（仅分发，不含游戏逻辑），详见 [AGENTS.md](AGENTS.md)。

## 桌面版

游戏可打包为独立 Windows exe（portable，双击即玩，无需浏览器或 dev server）：

```bash
npm run dev:desktop   # 一键启动：vite dev server (127.0.0.1:5174) + Electron 窗口，支持热更新
npm run dist          # 构建 + 打包 portable exe
```

- 打包产物输出在**仓库外同级目录** `../SLG-DEMO-1-release/`（`SLG-DEMO-1 0.1.0.exe`）。输出到仓库外是因为编辑器对工作区的目录监视句柄会与 electron-builder 的 `win-unpacked.tmp` 重命名竞争，在仓库内打包稳定报 `EPERM`。
- 浏览器开发流不变：`npm run dev` / `npm run build` / `npm run preview`。
- 首次安装与打包需下载 Electron 二进制（约 100MB）。国内网络如超时，可设置镜像后重试（不默认配置）：
  ```bash
  ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
  ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
  npm run dist
  ```

## 目录结构

```
DEMO_1/
├── README.md              # 项目说明（本文件）
├── AGENTS.md              # 项目纪律
├── package.json
├── tsconfig.json
├── vite.config.ts         # base: './'，产物资源相对路径（供 Electron file:// 加载）
├── electron-builder.json  # electron-builder 打包配置（win portable）
├── index.html
├── electron/
│   └── main.cjs           # Electron 主进程：仅创建窗口加载游戏页面
├── src/
│   ├── main.ts            # 入口
│   ├── style.css          # 全局样式
│   ├── core/              # 逻辑层（纯 TS）
│   ├── config/            # 数据驱动配置
│   ├── render/            # Canvas 渲染层
│   └── ui/                # HTML UI 元素
└── docs/
    ├── GAME-DESIGN.md     # 游戏设计文档（M1 定稿）
    └── prototypes/        # 原型参考
```

## 说明

- 本目录是独立 Git 仓库，远端：`git@github.com:wlzhou-1987/SLG-DEMO-1.git`
- Node.js 版本：≥ 18（项目根有 `.nvmrc`）
