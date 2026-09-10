# 代码地图（ARCHITECTURE）

> 状态：活文档。`src/`、`electron/` 每个源文件职责说明的唯一真源。
> 分层规则见 [AGENTS.md](../AGENTS.md) §3；设计规则见 [GAME-DESIGN.md](GAME-DESIGN.md)——本文只做索引，不复述规则。

## 1. 分层与依赖方向

```
main.ts（入口挂载）
  └─ game.ts（Game 类，唯一协调层：阶段状态机 + 主循环）
       ├─ core/    纯逻辑，零 DOM/Canvas 依赖
       ├─ config/  数据配置，被 core/render/ui 引用
       ├─ render/  Canvas 绘制与动画，只被 game.ts 驱动
       └─ ui/      HTML DOM 元素，只被 game.ts 驱动
electron/main.cjs  桌面壳，仅创建窗口加载页面，不含游戏逻辑
```

依赖单向：render/ui → core/config；core 不依赖 render/ui。core/unit.ts 与 core/spell.ts 引用 config 取模板，config 不反向依赖 core 逻辑（仅类型）。

## 2. 典型调用链（定位代码用）

- **玩家一次攻击**：`render/input` onClick → `game.ts` handleClick（unitSelected 移动 → playMove → 行动菜单 → 目标选择）→ `core/combat.calcBattleForecast`（预报）→ `ui/forecast` 确认 → `core/combat.resolveBattle`（结算）→ `game.ts` removeDead/playStrikes（`render/animator` 突进/闪烁 + `render/effects` 飘字）→ `ui/battle-log`；法术路线走 `core/spell` 同构
- **敌方阶段**：`game.ts` endPlayerPhase → runEnemyPhase → `core/status.tickStatuses`（敌方状态推进）→ `core/reinforce.checkReinforcements`（增援）→ `core/ai.checkGroupActivation`（警戒扫描）→ 逐敌 `core/ai.decideEnemyAction` + `core/combat.resolveBattle` → `core/turn.startPlayerPhase`（回合+1）→ `core/turn.checkVictory`

## 3. 文件清单

### 逻辑层 src/core/

| 文件 | 职责（关键导出） | 设计章节 | 测试 |
| --- | --- | --- | --- |
| src/core/types.ts | 全篇基础类型：HexCoord/PixelCoord/Facing/TerrainType/Faction/ArmorType/DamageType | §4.1 | —（纯类型） |
| src/core/hex.ts | 六边形数学：neighbor/directionBetween/distance/inRange/ring、轴↔像素换算（axialToPixel/pixelToAxial）、hexCorners/isValidHex/facingToAngle | §3 | tests/core/hex.test.ts |
| src/core/map.ts | 地图状态：createMapState（overrides 铺地形）、getTerrain/isPassable/getMoveCost；MAP_WIDTH/HEIGHT 常量 | §3 | tests/core/map.test.ts |
| src/core/unit.ts | 单位实例：UnitState（含 moveSpent/statuses/loadout 技能装填·战斗内冻结/groupId/activated）、createUnitState（按编成或出厂装填初始化并冻结）、getUnitAt/getUnitActiveSkills（实例主动解析）/hasUnitTrait/resetUnitCounter | §4.1/§4.8/§4.9 | tests/core/unit.test.ts |
| src/core/deployment.ts | 战前编成：RosterEntry（含可选技能装填 loadout）/DeploymentRules、isInDeployZone、validateDeployment（区内/不重叠/模板存在与我方/不重复/人数上下限/必上模板，全参数化）、applyPlacement（站位调整：空格移动/被占交换） | §7.0 | tests/core/deployment.test.ts |
| src/core/range.ts | 范围计算：calcMovementCosts（Dijkstra；R3-9 封锁邻格仅终点不扩展）、calcMovementRange、calcAttackRange、isBlockaded（fortify+姿态移动阻碍） | §3/§4.8/§4.7 | tests/core/range.test.ts |
| src/core/combat.ts | 战斗核心：attackSide（部位判定，防御姿态参数化——侧后按正面）、calcStrike/calcBattleForecast（预报，statValue 属性总值进公式）、resolveBattle；反击与攻击候选含普攻；calcAoeForecast/resolveAoeBattle（AoE 多段/独立命中/无反击）、applyDamageToUnit | §4.2~§4.5/§4.7/§4.9 | tests/core/combat.test.ts |
| src/core/area.ts | 效果区域解算（R3-7）：getAreaCells（disc 圆盘/sector 施法者正面三格扇形）、unitsInArea（区域+阵营筛选，R3-8 增可见性过滤——潜行不可见即不受 AoE） | §4.9 | tests/core/area.test.ts |
| src/core/stealth.ts | 潜行机制（R3-8）：enterStealth/cancelStealth/isStealthed、isVisibleTo（绝对隐身 + 真实视野 revealRange 显形；己方阵营恒可见、动态判定出范围自动隐匿） | §4.9/§6 | tests/core/stealth.test.ts |
| src/core/spell.ts | 法术预报与结算：calcSpellForecast（damage/heal/regen/shield/curse 五类）、resolveSpell（即时结算或挂状态）、resolveAoeSpell（R3-7 AoE 法术：以中心格区域内敌方独立结算） | §4.10/§4.12/§4.9 | tests/core/spell.test.ts |
| src/core/status.ts | 状态系统：九种 ActiveStatus（chant 锁定格/stealth/buff 衰减/stance/charge 蓄力/dot 灼烧/…）、resolveArmor、tickStatuses、interruptChant、applyBuff、refreshAuras、statValue（模板+buff+姿态+冲锋/狂战被动） | §4.10/§4.12/§4.9 | tests/core/status.test.ts |
| src/core/effects.ts | 行为技能与修饰执行器（R3-9/10）：executeBehavior（潜行/姿态/祝福/怒吼/嗜血）、resolveSkillSubs、resolveShout、rushDestination（冲杀落位与灰显条件）、applyAmbushBonus（破隐一击）、resolveChargeStrike（蓄力触发：额外威力+免距离惩罚） | §4.9 | tests/core/effects.test.ts |
| src/core/turn.ts | 回合与胜负：checkVictory（全灭/领主阵亡）、startPlayerPhase（重置行动+基地回复） | §2/§3 | tests/core/turn.test.ts |
| src/core/ai.ts | 敌方 AI：decideEnemyAction（落位×技能×目标枚举评分，击杀优先；BOSS 驻守；无目标向组质心最近我方集结）、checkGroupActivation（警戒范围扫描全组激活）、provokeGroup（被攻击激活） | §6 | tests/core/ai.test.ts |
| src/core/reinforce.ts | 增援：checkReinforcements（回合/组血量触发、次数上限、刷新点 BFS 找空位，登场即激活） | §6 | tests/core/reinforce.test.ts |

### 配置层 src/config/（新增内容=改配置不改代码）

| 文件 | 职责（关键导出） | 设计章节 | 测试 |
| --- | --- | --- | --- |
| src/config/skills.ts | SKILLS 注册表（物理攻击+行为技能）：SkillTemplate（target 三值/主效果扁平伤害段/附属段声明/AoE 效果区域/资源与武器声明/瞬发/counters/learnable）、WeaponAtom 8 原子、主资源三枚举 | §4.9 | tests/config/skills.test.ts |
| src/config/units.ts | 兵种模板：UnitTemplate（weapons 数组/resourceType/basicAttack 普攻数据/skills id 引用/traits 绑定被动）、SkillTemplate 已迁 skills.ts、PLAYER_TEMPLATES（10 我方）/ENEMY_TEMPLATES（7 敌方）、getTemplate、resolveSkill（SKILLS ∪ SPELLS）、getTemplateSkills、basicAttackSkill（普攻合成技能形态）、hasTemplateTrait | §4.9/§5.1/§5.2 | tests/config/skills.test.ts |
| src/config/combat.ts | 战斗数值：DAMAGE_ARMOR_MATRIX（伤害×护甲矩阵）、PART_BONUS（部位补正）、COMBAT_PARAMS（命中/追击/超射程参数） | §4.2~§4.4/§4.7 | —（tests/core/combat 间接） |
| src/config/terrain.ts | 地形配置：TERRAIN_CONFIGS（移动消耗/回避/防御/颜色/标签） | §3 | — |
| src/config/spells.ts | 法术定义：SpellTemplate（继承 SkillTemplate，id/target/learnable；释放方式×生效方式）、SPELLS 六法术、getSpell/isSpell | §4.12 | —（tests/core/spell 间接） |
| src/config/traits.ts | 特性修正：TRAIT_CONFIGS（再移动/背刺/沉稳/真实视野〔revealRange 声明，R3-8 结算〕，learnable 标记、weaponType 声明）、getTrait | §4.7 | —（tests/core/combat 间接） |
| src/config/pool.ts | 通用技能池：getPool（三表 learnable 条目 union 视图）、learnBlockReason/canLearn（双过滤）、SLOT_LIMITS、findRegisteredEntry（三表全量查）、validateLoadoutForTemplate（装填合法性：未注册/分组/双约束） | §4.9 | tests/config/pool.test.ts |
| src/config/map.ts | 关卡布局：MAP_OVERRIDES（地形）、PLAYER_UNITS（我方 10 人站位）、DEPLOY_ZONE（部署区）、ENEMY_GROUPS（9 敌组含 aiType；UnitPlacement 可选 loadout——敌方首版：弓手×4 狙击+真实视野、BOSS 重锤+横扫+真实视野）、GroupAiType | §3/§5.2/§6/§7.0 | tests/config/map.test.ts |
| src/config/reinforcements.ts | 增援事件：ReinforcementEvent、REINFORCEMENTS（回合触发/BOSS 半血触发） | §6 | —（tests/core/reinforce 间接） |

### 渲染层 src/render/

| 文件 | 职责（关键导出） | 设计章节 | 测试 |
| --- | --- | --- | --- |
| src/render/camera.ts | Camera 类：平移/以屏幕点为中心缩放/居中、屏幕↔世界坐标换算 | §5.3 | — |
| src/render/hex-renderer.ts | HexRenderer 类：地形/网格/单位（朝向箭头+HP 条+状态图标）/阵亡幽灵/范围覆盖/选中指示分层绘制；HEX_SIZE、FACTION_COLORS 常量 | §5.3/§7.4 | — |
| src/render/animator.ts | Animator 类：移动滑行/突进/受击闪烁/登场渐入/阵亡幽灵动画状态机，随时间自衰减；时长常量 MOVE_MS 等 | §7.4 | tests/render/animator.test.ts |
| src/render/effects.ts | EffectSystem 类：战场飘字（伤害/MISS/治疗/盾吸收），世界坐标锚定随镜头移动；FLOAT_COLOR | §7.4 | tests/render/effects.test.ts |
| src/render/input.ts | InputHandler 类：画布鼠标事件（点击/拖动/滚轮/双击/悬停），拖动阈值区分点击与平移；dispose 移除全部监听（战前画布让位时用） | §7.1 | — |
| src/render/prep-board.ts | PrepBoard 类：战前画布——部署区高亮 + 我方站位渲染 + 点击调整（选中/移动/交换/区外 onInvalid），复用 Camera/HexRenderer/InputHandler | §7.0 | tests/render/prep-board.test.ts |

### UI 层 src/ui/（HTML DOM，无框架）

| 文件 | 职责（关键导出） | 设计章节 | 测试 |
| --- | --- | --- | --- |
| src/ui/topbar.ts | updateTopbar：顶栏回合/阶段/兵力与结束回合按钮 | §7.1 | — |
| src/ui/prep.ts | createPrepScreen：战前准备面板（右侧）——出场名单勾选 + 技能配置区块（R3-5：选中角色 → 主动 0~5/被动 0~6 槽、通用池混排双过滤置灰、出厂默认、编辑后随编成传 loadout）+ 装备/地图占位区块 + 实时校验 + 开战按钮；站位记忆画布调整结果（getRoster/setChecked/setBoardRoster/selectUnit/addToSlot/removeFromSlot/poolEntries/refresh/clickStart） | §7.0/§4.9 | tests/ui/prep.test.ts |
| src/ui/sidepanel.ts | showUnitInfo/clearUnitInfo、showTerrainInfo/clearTerrainInfo：右侧单位属性（含特性/状态）与地形面板 | §7.3 | — |
| src/ui/action-menu.ts | showActionMenu/hideActionMenu：画布内浮动行动菜单 | §7.2 | — |
| src/ui/forecast.ts | showForecastPanel/showSpellForecastPanel/showAoeForecastPanel：战斗/法术/AoE 多目标预报面板（确认/取消） | §4.5/§4.12/§4.9 | — |
| src/ui/battle-log.ts | logBattle：战斗日志（最新在顶，30 条裁剪） | §7.4 | — |
| src/ui/notice.ts | showNotice：战场提示条（增援登场等，定时淡出） | §7.4 | — |

### 根与桌面壳

| 文件 | 职责 | 设计章节 | 测试 |
| --- | --- | --- | --- |
| src/game.ts | Game 类：游戏主循环与状态协调枢纽——构造支持注入我方战前编成（缺省 PLAYER_UNITS、非法 throw，§7.0）、Phase 状态机（idle/unitSelected/actionMenu/targetSelect/forecast/spellForecast/reMove/facingConfirm/enemyTurn/gameOver）、输入分发、玩家/敌方行动流、动画编排、胜负呈现 | §2/§4.8/§7.0/§7.2 | tests/game.test.ts |
| src/main.ts | 入口：两阶段编排——先挂战前准备界面，开战后按所选编成实例化 Game | §7.0/§9 | — |
| src/style.css | 全局样式：布局与 UI 元素（topbar/面板/菜单/预报/日志/战前准备） | §7.0/§7.1 | — |
| electron/main.cjs | Electron 主进程：仅创建窗口（dev 加载 127.0.0.1:5174，打包加载 dist/index.html） | §9 | — |

## 4. 维护规则

- 新增文件：同一提交补条目；修改职责或公共接口：同步条目；删除文件：删条目（AGENTS §9）
- 条目只写"职责一句话 + 关键导出"，禁止复述实现细节与设计数值
- 覆盖率自查（文件有增删的 issue 收尾时必跑，输出须为空）：

```bash
comm -3 <(find src electron \( -name '*.ts' -o -name '*.cjs' \) | sort) \
        <(grep -oE '(src|electron)/[a-z0-9/-]+\.(ts|cjs)' docs/ARCHITECTURE.md | sort -u)
```

- 单模块条目超过约 100 行或某模块需要独立设计论述时，才考虑拆分为模块子文档
