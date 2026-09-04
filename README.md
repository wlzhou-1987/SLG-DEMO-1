# DEMO_1 — 游戏 DEMO

用于学习和实践的游戏 DEMO 项目。最终目标：交付一个可运行的游戏 DEMO。

## 当前状态

**设计阶段**（2026-09-04）：已确定做火纹式回合制战棋单场战斗 DEMO，设计框架初稿完成，逐项确认中。

- [ ] 设计定稿：逐项确认 GAME-DESIGN.md → [docs/GAME-DESIGN.md](docs/GAME-DESIGN.md)
- [ ] 技术栈确认并初始化工程 → [docs/TECH-STACK.md](docs/TECH-STACK.md)
- [ ] M2 棋盘与选中：渲染棋盘和单位，点选显示移动/攻击范围
- [ ] M3 战斗闭环：移动、攻击、结算（含反击/追击）、战斗预报
- [ ] M4 回合与AI：敌方回合 AI、回合循环、胜负判定
- [ ] M5 打磨：地形效果、信息面板、伤害反馈、数值平衡

需求详见 [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md)。

## 目录结构

```
DEMO_1/
├── README.md              # 项目说明（本文件）
└── docs/
    ├── REQUIREMENTS.md    # 需求文档
    ├── GAME-DESIGN.md     # 游戏设计文档（逐项确认中）
    └── TECH-STACK.md      # 技术选型决策记录（建议方案待确认）
```

## 说明

- 本目录是独立 Git 仓库，已在资料库根 `.gitignore` 中排除（同 `AI Native/` 的管理方式）。
