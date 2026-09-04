# DEMO_1 — 项目纪律

## 项目定位

火纹式单场战斗战棋 DEMO。设计文档 `docs/GAME-DESIGN.md` 为权威来源，代码实现必须与文档一致。

## 技术栈

- Vite + TypeScript（strict 模式）+ 原生 Canvas + Vitest
- 逻辑层（`src/core/`）：纯 TS，零 DOM/Canvas 依赖，必须可单测
- 渲染层（`src/render/`）：Canvas 绘制与交互，可引用逻辑层，不反向依赖
- 配置层（`src/config/`）：所有游戏数据为 TS 配置对象，数值不硬编码到逻辑中
- UI 层（`src/ui/`）：HTML DOM 元素（顶栏、面板），不依赖前端框架

## 数据驱动原则

- 兵种属性、地形效果、伤害×护甲矩阵、技能定义、地图布局、AI 参数、增援事件——全部为配置文件
- 新增内容（地形/兵种/技能/关卡）= 新增配置条目，不改代码
- 特性修正管线：基础规则层的数值和行为均可被特性改写，实现为可组合的修饰器

## 目录结构

```
src/
  core/          # 逻辑层：hex数学、地图、单位、范围计算、战斗结算、AI
  config/        # 数据配置：地形、兵种、技能、法术、地图布局
  render/        # 渲染层：Camera、HexRenderer、InputHandler
  ui/            # HTML UI：topbar、sidepanel
  game.ts        # 游戏主循环与状态协调
  main.ts        # 入口
tests/
  core/          # 逻辑层单测（与 src/core/ 镜像）
docs/
  GAME-DESIGN.md # 设计文档（权威）
  REQUIREMENTS.md
  TECH-STACK.md
  prototypes/    # UI 原型（参考用）
```

## 编码规范

- TypeScript strict 模式，禁止 `any`（除非有明确注释说明理由）
- 函数和类型命名用英文，注释用中文（仅在 WHY 非显然时加注释）
- 六边形坐标统一使用轴坐标 `(q, r)`，尖顶朝向
- 渲染相关常量（颜色、尺寸）集中在渲染模块，不污染逻辑层
- 测试文件与源文件同名：`hex.ts` → `hex.test.ts`

## Git 规范

- 提交信息用中文，格式：`类型: 简述`（如 `feat: 六边形移动范围BFS`）
- 类型：`feat` / `fix` / `docs` / `refactor` / `test` / `chore`
- 远端：`git@github.com:wlzhou-1987/SLG-DEMO-1.git`（SSH）
- 每个里程碑（M2~M6）完成后至少一次提交

## 里程碑

| 里程碑 | 内容 |
| --- | --- |
| M1 | 设计定稿 ✅ |
| M2 | 工程与棋盘：渲染+选择+范围 |
| M3 | 行动与战斗：移动/技能/朝向/预报 |
| M4 | 法术与状态：咏唱/延时/持续/护盾 |
| M5 | 回合与AI：三类激活/增援/胜负 |
| M6 | 打磨：反馈/面板/平衡 |
