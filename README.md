# DEMO_1 — 游戏 DEMO

用于学习和实践的游戏 DEMO 项目。最终目标：交付一个可运行的游戏 DEMO。

## 当前状态

M1~M6 已全部完成（2026-09-04），DEMO 可玩。后续需求与进度见 [docs/BACKLOG.md](docs/BACKLOG.md)，代码结构见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 技术栈

Vite + TypeScript（strict）+ 原生 Canvas + Vitest；Electron 桌面壳用于打包独立可执行（Windows exe / macOS dmg，仅分发，不含游戏逻辑），详见 [AGENTS.md](AGENTS.md)。

## 桌面版

游戏可打包为跨平台桌面客户端（Windows portable exe + macOS dmg，双击即玩，无需浏览器或 dev server）：

```bash
npm run dev:desktop   # 一键启动：vite dev server (127.0.0.1:5174) + Electron 窗口，支持热更新
npm run dist          # 构建 + 打包 Windows exe 与 macOS dmg
```

- 打包产物输出在**仓库外同级目录** `../SLG-DEMO-1-release/`。输出到仓库外是因为编辑器对工作区的目录监视句柄会与 electron-builder 的 `*-unpacked.tmp` 重命名竞争，在仓库内打包稳定报 `EPERM`：
  - `SLG-DEMO-1 0.1.0.exe` —— Windows x64 portable（单文件免安装）
  - `SLG-DEMO-1-0.1.0.dmg` —— macOS x64（Intel）
  - `SLG-DEMO-1-0.1.0-arm64.dmg` —— macOS arm64（Apple Silicon）
- 首次安装与打包需下载 Electron 二进制与打包工具链（各约 100MB）。win 侧签名工具（winCodeSign 等）从 GitHub 直连常超时，建议直接带镜像打包（不默认写入配置）：
  ```bash
  ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ \
  ELECTRON_BUILDER_BINARIES_MIRROR=https://npmmirror.com/mirrors/electron-builder-binaries/ \
  npm run dist
  ```
- dmg 未做开发者签名（无 Apple Developer 证书）：本机构建本机打开正常；分发他人首次打开被 Gatekeeper 拦时，右键 → 打开，或 `xattr -cr <App路径>` 后再开
- 浏览器开发流不变：`npm run dev` / `npm run build` / `npm run preview`

## 目录结构

```
DEMO_1/
├── README.md              # 项目说明（本文件）
├── AGENTS.md              # 项目纪律
├── package.json
├── tsconfig.json
├── vite.config.ts         # base: './'，产物资源相对路径（供 Electron file:// 加载）
├── electron-builder.json  # electron-builder 打包配置（win x64 portable + mac dmg x64/arm64）
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
    ├── GAME-DESIGN.md   # 游戏设计文档（权威）
    ├── BACKLOG.md       # 需求池与进度（唯一进度真源）
    ├── ARCHITECTURE.md  # 代码地图（每源文件职责索引）
    ├── REQUIREMENTS.md  # 历史存档：范围界定初稿
    ├── TECH-STACK.md    # 历史存档：技术选型决策记录
    └── prototypes/      # 原型参考
```

## 说明

- 本目录是独立 Git 仓库，远端：`git@github.com:wlzhou-1987/SLG-DEMO-1.git`
- Node.js 版本：≥ 18（项目根有 `.nvmrc`）
