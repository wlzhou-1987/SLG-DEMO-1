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

Vite + TypeScript（strict）+ 原生 Canvas + Vitest，详见 [AGENTS.md](AGENTS.md)。

## 目录结构

```
DEMO_1/
├── README.md              # 项目说明（本文件）
├── AGENTS.md              # 项目纪律
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
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
