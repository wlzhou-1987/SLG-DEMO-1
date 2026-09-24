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
- **敌方阶段**：`game.ts` endPlayerPhase → runEnemyPhase → `core/status.tickStatuses`（敌方状态推进）→ `core/resources.tickResources` → `core/turn.applyTerrainRegen`（R6-1 地形回复，持有者阵营阶段开始）→ `core/reinforce.checkReinforcements`（增援）→ `core/ai.checkGroupActivation`（警戒扫描）→ 逐敌 `core/ai.decideEnemyAction` + `core/combat.resolveBattle` → `core/turn.startPlayerPhase`（回合+1）→ `core/turn.checkVictory`

## 3. 文件清单

### 逻辑层 src/core/

| 文件 | 职责（关键导出） | 设计章节 | 测试 |
| --- | --- | --- | --- |
| src/core/types.ts | 全篇基础类型：HexCoord/PixelCoord/Facing/TerrainType/Faction/ArmorType/DamageType | §4.1 | —（纯类型） |
| src/core/hex.ts | 六边形数学：neighbor/directionBetween/distance/inRange/ring、轴↔像素换算（axialToPixel/pixelToAxial）、hexCorners/isValidHex/facingToAngle | §3 | tests/core/hex.test.ts |
| src/core/map.ts | 地图状态：createMapState（overrides 铺地形）、getTerrain/isPassable/getMoveCost（**R22 数据驱动**：移动代价/不可通行读 TERRAIN_CONFIGS.moveCost，moveCost=Infinity ⇔ 地面不可通行，不认地形名）；MAP_WIDTH/HEIGHT 常量 | §3 | tests/core/map.test.ts |
| src/core/unit.ts | 单位实例：UnitState（含 moveSpent/statuses/loadout 技能装填·战斗内冻结/**equipment 装备数组**〔R2-2，编成/关卡传入或模板默认〕/resources 主资源槽〔R5-1〕/groupId/activated）、createUnitState（按编成或出厂装填初始化并冻结，资源按模板初始化；装备可显式覆盖默认并校验非法 throw〔R2-2；类别源 = JobConfig.equipmentClass，R2-4〕）、getUnitAt/getUnitActiveSkills（实例主动解析）/hasUnitTrait/resetUnitCounter | §4.1/§4.8/§4.9/§4.13/§4.14 | tests/core/unit.test.ts |
| src/core/deployment.ts | 战前编成：RosterEntry（含可选技能装填 loadout/装备 equipment〔R2-2〕）/DeploymentRules、isInDeployZone、validateDeployment（区内/不重叠/模板存在与我方/不重复/人数上下限/必上模板，全参数化）、applyPlacement（站位调整：空格移动/被占交换） | §7.0 | tests/core/deployment.test.ts |
| src/core/range.ts | 范围计算：calcMovementCosts（Dijkstra；R3-9 封锁邻格仅终点不扩展）、calcMovementRange、calcAttackRange、isBlockaded（fortify+姿态移动阻碍）、rebuildPath（R9-2 代价表反向回溯途经格序列，移动动效专用纯函数） | §3/§4.8/§4.7 | tests/core/range.test.ts |
| src/core/combat.ts | 战斗核心：attackSide（部位判定，防御姿态参数化）、calcEvade（**R4-6 双轴回避**：速/运×对应轴系数+地形闪避，经 statValue 入修正管线）、**R7-1 calcCritRate**（攻技+运差+mods.overflow〔R7-2 鹰眼溢出 ×critOverflowRate〕，属性段 clamp 0~critCap+mods.capBonus〔R7-2 ΣcritCapBonus〕+ Σ装备条目 critBonus〔R2-3 装备求和、clamp 外，§4.14；全局表 WEAPON_CRIT_BONUS 退役〕→ clamp 0~100）与 **expectedDamage**（精确期望 E = 命中率×(非暴×(1−p)+暴伤×p)，AI 与反击择优同式）、calcStrike/calcBattleForecast（**R4-2 统一公式**：伤害段权重基数×克制（cap 3.0）×背刺（总封顶 4.0）−防御−地形防，先乘后减 max 内 floor；权重缺省取 JobConfig.defaultWeights 按线〔R2-4〕；命中接对应轴回避+**R7-2 鹰眼远程 rangedHitBonus 喂溢出**（rangeMax ≥ rangedMinRange）；StrikeForecast 含 skillId/damageType〔R16-2 表现层逐击选特效，普攻 = basic: 前缀〕/critRate/critDamage〔×2 进乘数区同吃总封顶〕/mustCrit；**R4-7 firstStrike 先攻标记**：守速差 ≥ 阈值〔10 可配、特性可降〕且反击存在；**R6-1 地形防/闪按伤害线取双轴字段**，飞行不享）、resolveBattle（**R4-7 序列**：先攻反击→攻→反→追击，先攻击杀攻方则截断；**R7-1 逐击独立掷暴**：先命中后暴击、必暴 critOverride 不掷骰、StrikeResult 加 crit）；反击与攻击候选含普攻（反击按 expectedDamage 择优；**R21 反击资格按守方有效射程判定**——透传 loadout.passive、地形不读）；calcAoeForecast/resolveAoeBattle（AoE 暴击同构）、applyDamageToUnit、effectiveRangeMax（**R6-1 含地形额外射程**，飞行不享；**R12-2 rangeBonus 累加结构**：ally 法术持 heal-boost 特性且 tec≥healTecThreshold 再 +healBonus，与魔力/弓阈值合计） | §4.2~§4.5/§4.7/§4.9/§3 | tests/core/combat.test.ts |
| src/core/area.ts | 效果区域解算（R3-7）：getAreaCells（disc 圆盘/sector 施法者正面三格扇形）、unitsInArea（区域+阵营筛选，R3-8 增可见性过滤——潜行不可见即不受 AoE） | §4.9 | tests/core/area.test.ts |
| src/core/stealth.ts | 潜行机制（R3-8）：enterStealth/cancelStealth/isStealthed、isVisibleTo（绝对隐身 + 真实视野 revealRange 显形；己方阵营恒可见、动态判定出范围自动隐匿） | §4.9/§6 | tests/core/stealth.test.ts |
| src/core/spell.ts | 法术预报与结算：calcSpellForecast（damage/heal/regen/shield/dot 五类；damage 分支透传 R7-1 暴击三字段〔critRate/critDamage/mustCrit〕；**R10-1 咒杀 DoT 化**：enemy+lasting 走公式 total → splitDot 切分、掷命中挂 DotStatus 锁定值——delayed 模式退役）、splitDot（统一 DoT 切分：max(1, floor(total/turns))+末回合补余，灼烧/咒杀同构）、healSegment 治疗段基数（权重缺省取 JobConfig.defaultWeights.heal〔R2-4〕）、resolveSpell（即时结算或挂状态；**R7-1 直击法术可暴**：先命中后掷暴、pyro 直伤放大走暴击值而 DoT 锁非暴值、SpellResult 加 crit 且返回结算后 damage；pyro 灼烧同走 splitDot；**R12-1 虔诚溅射**：签名增 units 全场单位〔sim 与真实同路径〕，ally 三分支结算后 piousSplashTarget 择取——施法者法术有效射程内存活友方排除主目标/自身，绝对 HP 最低→距施法者近→数组序，主目标结算值 ×piousSplashFraction 减半〔floor 保底 1〕复制，SpellResult 加 splash）、resolveAoeSpell（R3-7 AoE 法术：以中心格区域内敌方独立结算，R7-1 逐目标独立掷暴） | §4.10/§4.12/§4.9 | tests/core/spell.test.ts |
| src/core/status.ts | 状态系统：八种 ActiveStatus（chant 锁定格/stealth/buff 衰减/stance/charge 蓄力/dot〔灼烧+咒杀共用：R4-7 存值跳+末回合 finalTurnExtra 补足，R10-1 dotTick 事件〕/regen/shield——delayed 已随 R10 退役）、resolveArmor、tickStatuses、interruptChant（R5-1 打断返还咏唱资源）、applyBuff、refreshAuras、statValue（模板+buff+姿态+冲锋/狂战被动；R4-6 AttrKey 扩 spd/lck 轴——回避入修正管线；R7-1 扩 tec 轴——暴击率入修正管线） | §4.10/§4.12/§4.9/§4.13 | tests/core/status.test.ts |
| src/core/effects.ts | 行为技能与修饰执行器（R3-9/10）：executeBehavior（潜行/姿态/祝福/怒吼/嗜血）、resolveSkillSubs（附属段资源入真实主资源，R5-2）、resolveShout、rushDestination（冲杀落位与灰显条件）、applyAmbushBonus（破隐一击）、resolveChargeStrike（蓄力触发：额外威力+免距离惩罚） | §4.9/§4.13 | tests/core/effects.test.ts |
| src/core/turn.ts | 回合与胜负：checkVictory（全灭/领主阵亡）、startPlayerPhase（仅重置行动/移动力标记）、applyTerrainRegen（R6-1 地形回复数据驱动：HP 百分比+MP 固定值，阵营过滤、死亡跳过） | §2/§3 | tests/core/turn.test.ts |
| src/core/ai.ts | 敌方 AI：decideEnemyAction（落位×技能×目标枚举评分，击杀优先；资源不足技能不入选〔R5-1 回落普攻〕；**R7-1 期望伤害经 expectedDamage 含暴击**；择优射程含地形额外射程〔R6-1 按落位地形，警戒范围不含——口径注 ai.ts〕；普攻按装备条目展开〔R2-2〕；BOSS 驻守；无目标向组质心最近我方集结）、checkGroupActivation（警戒范围扫描全组激活）、provokeGroup（被攻击激活） | §6/§4.13/§4.14 | tests/core/ai.test.ts |
| src/core/reinforce.ts | 增援：checkReinforcements（回合/组血量触发、次数上限、刷新点 BFS 找空位，登场即激活） | §6 | tests/core/reinforce.test.ts |
| src/core/resources.ts | 资源系统（R5-1/R5-2，§4.13）：ResourceState 主资源槽、initResources（怒 0/专满/MP=mag×5 满，资源类型源 = JobConfig〔R2-4〕）、canAfford/payCost（结算前扣费、不足拒扣）、refundCost（咏唱打断全额返还）、gainOnHit/gainOnStruck（命中积攒：怒任意攻击+受击、专/MP 仅普攻）、gainOnCrit（**R7-1 暴击额外 +15**，仅怒气系）、gainResource（附属段/特性段入池封顶）、tickResources（阶段推进：专注回 20/MP 歇息回 15+施法标记重置） | §4.13 | tests/core/resources.test.ts |

### 配置层 src/config/（新增内容=改配置不改代码）

| 文件 | 职责（关键导出） | 设计章节 | 测试 |
| --- | --- | --- | --- |
| src/config/skills.ts | SKILLS 注册表（物理攻击+行为技能）：SkillTemplate（**desc 功能描述〔战前 UI 展示，全条目必填由配置测试保证〕**/target 三值/主效果扁平伤害段/附属段声明/AoE 效果区域/资源与武器声明/瞬发/counters/learnable/**critOverride 必暴与 critCapBonus 上限突破**〔R7〕/weights 组合权重〔StatWeights 类型导出，R2-4〕）、WeaponAtom 8 原子、主资源三枚举 | §4.9 | tests/config/skills.test.ts |
| src/config/jobs.ts | 职业配置（R2-4 实体化，§4.1 模板即职业：id = 模板 id、17 条 1:1）：JobConfig{equipmentClass 装备类别〔R2〕/resourceType 资源类型〔R5〕/defaultWeights 缺省权重按线三支 phys·mag·heal〔R4，首版全职业共享基准常量 str1/mag1/mag×0.5〕}、getJob；模板 weapons/resourceType 字段已删防双真源 | §4.1/§4.14 | tests/config/jobs.test.ts |
| src/config/units.ts | 兵种模板：UnitTemplate（八维 str/mag/pdef/mdef/spd/tec/lck + **unitTags 兵种标签**〔R4-4 正式化，flying 布尔收编〕/**defaultEquipment 出厂默认装备**〔R2-2，普攻数据源；basicAttack 字段已退役〕/skills/traits；weapons 装备类别与 resourceType 已迁 JobConfig〔R2-4 删字段防双真源〕）、UnitTag 枚举与 UNIT_TAGS 常量、isFlying、PLAYER_TEMPLATES（10）/ENEMY_TEMPLATES（7）、getTemplate、resolveSkill（SKILLS ∪ SPELLS）、getTemplateSkills、hasTemplateTrait | §4.1/§4.2/§4.9/§5.1/§5.2/§4.14 | tests/config/skills.test.ts |
| src/config/weapons.ts | 武器注册表（R2-1/R2-2）：WeaponItem（**普攻段 = 伤害线/威力/射程，齐备才供普攻形态**，盾等纯原子供体不配；critBonus/counters）、WEAPONS 首版 15 条（基准 8/跨线 3/必杀 3/铁盾/弑骑战锤）、WEAPON_SLOT_LIMIT=2、getWeapon、validateEquipment（存在/类别/槽位，同条目双持合法）、basicAttackSkills（按装备条目合成普攻技能：id=basic:<武器>、名「武器名·普攻」、带来源武器原子 weaponType 与 counters）、equipmentAtoms（装备原子并集，R2-3 武器过滤数据源） | §4.14 | tests/config/weapons.test.ts |
| src/config/combat.ts | 战斗数值：DAMAGE_ARMOR_MATRIX（§4.2 定稿物理梯度，R4-3 法术行移出）、PART_BONUS、COMBAT_PARAMS（命中/**双轴回避系数 evadeCoeffs**〔R4-6 结构，R4-8 定稿速 3/运 3 两轴同值〕/追击/先攻阈值 10〔R4-7，特性可降〕/递增距离惩罚 base15+step10/克制 cap 3.0/总封顶 4.0/**R7-1 暴击四参数 critPerTech/critPerLck/critCap/critAbsMax**/**R7-2 critOverflowRate 溢出换算率 + rangedMinRange 远程判定阈值**）、RANGE_PARAMS（R4-5 属性条件射程阈值；**R12-2 增 healTecThreshold 16/healBonus 1 特性门控动态射程**）、EFFECT_PARAMS（R2-3：WEAPON_CRIT_BONUS 退役，武器暴击加成归 weapons.ts 条目 critBonus） | §4.2~§4.4/§4.7 | —（tests/core/combat 间接） |
| src/config/terrain.ts | 地形配置：TERRAIN_CONFIGS（移动消耗 + R6-1 显式效果字段——物理防/法术防/物理闪避 pevasion/法术闪避 mevasion/HP 回复 hpRegenPct/MP 回复/额外射程 rangeBonus/颜色/标签） | §3 | tests/config/terrain.test.ts |
| src/config/spells.ts | 法术定义：SpellTemplate（继承 SkillTemplate 含 desc 功能描述，id/target/learnable；释放方式×生效方式）、SPELLS 六法术（陨石术 armorResist heavy ×1.5——法术破重甲钥匙，R4-8）、getSpell/isSpell | §4.12 | —（tests/core/spell 间接） |
| src/config/traits.ts | 特性修正：TRAIT_CONFIGS（再移动/背刺/沉稳/真实视野〔revealRange 声明，R3-8 结算〕/鹰眼〔R7-2 rangedHitBonus 远程命中+溢出转暴击〕/虔诚〔R12-1 溅射：消费点 spell.ts〕，learnable 标记、weaponType 声明、firstStrikeThreshold 先攻降阈声明〔R4-7〕、critCapBonus 上限突破声明位〔R7-2〕）、getTrait | §4.7 | —（tests/core/combat 间接） |
| src/config/pool.ts | 通用技能池：getPool（三表 learnable 条目 union 视图）、learnBlockReason/canLearn（双过滤；**R2-3 武器判据 = 装备原子并集**，签名带 equipment 参数；R2-4 资源判据读 JobConfig.resourceType）、SLOT_LIMITS、findRegisteredEntry（三表全量查）、validateLoadoutForTemplate（装填合法性：未注册/分组/双约束；R2-3 第三参 equipment 缺省回落模板默认，敌方关卡装备覆盖同源） | §4.9/§4.14 | tests/config/pool.test.ts |
| src/config/art.ts | 美术资源登记（R15，§7.5）：ART_ASSETS 显式登记表（templateId → {standing?, portrait?, sprite?}，只登记已迁入 public/art/ 的资源）+ artPath 查询（相对路径 base './' 兼容 Electron file://，未登记返 null 走回落链）；地形扩展（R16-1）= TERRAIN_ART（TerrainType → 文件名，Partial 登记制）+ terrainArtPath 查询（未登记返 null 回落矢量图案）；**特效扩展（R16-2）= FX_ART 33 条 + FX_BY_SKILL_ID（26 条技能/法术 id 全量）+ FX_COMMON 四键 + fxPath/fxNameForSkill（普攻 basic: 前缀按 damageType 三线自动、无映射返 null 不播）+ allFxPaths（启动预载）**；**图标扩展（R16-3）= ICON_ART 32 键（武器 8/资源 3/伤害线 3/护甲 4/标签 6/状态 8；icon-lance ↔ weaponType spear、status-debuff 超前不登记）+ iconPath 查询（未登记 null → UI 回落文字）**；新增美术 = 放文件 + 加登记行 | §7.5/§7.4 | tests/config/art.test.ts |
| src/config/map.ts | 关卡布局：MAP_OVERRIDES（地形）、PLAYER_UNITS（我方 10 人站位）、DEPLOY_ZONE（部署区）、ENEMY_GROUPS（9 敌组含 aiType；UnitPlacement 可选 loadout/**equipment 关卡覆盖默认装备**〔R2-2〕——敌方首版：弓手×4 狙击+真实视野、BOSS 重锤+横扫+真实视野）、GroupAiType | §3/§5.2/§6/§7.0 | tests/config/map.test.ts |
| src/config/reinforcements.ts | 增援事件：ReinforcementEvent、REINFORCEMENTS（回合触发/BOSS 半血触发） | §6 | —（tests/core/reinforce 间接） |

### 渲染层 src/render/

| 文件 | 职责（关键导出） | 设计章节 | 测试 |
| --- | --- | --- | --- |
| src/render/camera.ts | Camera 类：平移/以屏幕点为中心缩放/居中、屏幕↔世界坐标换算；R19 顺滑缩放补间（setZoomTarget 目标倍率+光标不动点、tick 指数趋近、pan/zoomAt/centerOn 打断） | §5.3/§7.1 | tests/render/camera.test.ts |
| src/render/hex-renderer.ts | HexRenderer 类：地形（色块 + **R16 贴图优先**——terrainArtPath 登记且就绪则六边形裁切满铺 drawImage〔traceHex 复用路径〕，未登记/未就绪/失败回落矢量图案）/网格/单位（R9-1 底座圆盘 drawToken——BOSS 金环双圈+深盘心+阵营色环+盘心内**剪影/贴图**〔R15-4：sprite 登记且就绪则盘心 drawImage 圆窗满铺，未登记/未就绪/失败回落剪影〕、朝向三角 A 案、HP 条贴盘下缘+**R20 主资源条（MP/怒气/专注，RESOURCE_COLORS）**、状态图标）/阵亡幽灵（圆盘+剪影/贴图同源）/范围覆盖/选中指示分层绘制；**R19 世界系绘制**（applyView/resetView 变换 + 世界包围盒视口裁剪，全要素随 zoom 等比）；HEX_SIZE、FACTION_COLORS、R9 视觉常量 | §5.3/§7.1/§7.4/§7.5 | tests/render/hex-renderer.test.ts |
| src/render/sprite-cache.ts | 棋子贴图资源管理器（R15-4）：SpriteCache 按 URL 懒加载+缓存（loader 可注入、node 可测），未就绪/失败恒 null（失败=缺失同回落；无 Image 全局环境〔node 测试〕给永不就绪桩同回落）+ spriteCache 单例；clear 供测试/HMR | §5.3/§7.5 | tests/render/sprite-cache.test.ts |
| src/render/silhouettes.ts | R9-1 兵种矢量剪影：14 形状绘制函数（SILHOUETTE_SHAPES，颜色由调用方预设）、SILHOUETTE_MAP 17 模板映射（敌我斧/弓/法共用）、getShapeId 未知回退剑士形、BOSS_SHAPE | §5.3 | tests/render/silhouettes.test.ts |
| src/render/terrain-patterns.ts | R9-1 地形矢量图案（R16 起为贴图缺失/未就绪/失败的回落层）：TERRAIN_PATTERNS 四地形各一绘制函数（草簇/双树/双峰/堡垒垛口拱门），图案色为模块常量 | §5.3 | tests/render/terrain-patterns.test.ts |
| src/render/animator.ts | Animator 类：逐格移动滑行（途经点序列多段插值，R9-2）/受击抖动+闪烁/突进/登场渐入/阵亡幽灵动画状态机（GhostView 携 templateId 供剪影渲染），随时间自衰减；时长常量 STEP_MOVE_MS/SHAKE_MS/SHAKE_AMP 等 | §7.4 | tests/render/animator.test.ts |
| src/render/effects.ts | EffectSystem 类：战场飘字（伤害/MISS/治疗/盾吸收/**暴击 R7-2 亮橙前缀「暴击-」**），世界坐标锚定（R19 世界系绘制，字号随 zoom 等比）；FLOAT_COLOR | §7.4 | tests/render/effects.test.ts |
| src/render/fx.ts | FxSystem 类（R16-2）：战场单帧特效闪现——世界坐标锚定、出生放大 0.75→1.2（p≤0.6）/末段淡出（p>0.55）、420ms；基准尺寸 = 一格宽（√3×hexSize）随 zoom 等比；图片未就绪/失败不画（缺失 = 不播，SpriteCache 懒加载注入） | §7.4 | tests/render/fx.test.ts |
| src/render/input.ts | InputHandler 类：画布鼠标事件（点击/拖动/滚轮/双击/悬停），拖动阈值区分点击与平移；dispose 移除全部监听（战前画布让位时用） | §7.1 | — |
| src/render/prep-board.ts | PrepBoard 类：战前画布——部署区高亮 + 我方站位渲染 + 点击调整（选中/移动/交换/区外 onInvalid），复用 Camera/HexRenderer/InputHandler（R19 render 同构 applyView/resetView 世界系包装） | §7.0 | tests/render/prep-board.test.ts |

### UI 层 src/ui/（HTML DOM，无框架）

| 文件 | 职责（关键导出） | 设计章节 | 测试 |
| --- | --- | --- | --- |
| src/ui/topbar.ts | updateTopbar：顶栏回合/阶段/兵力与结束回合按钮 | §7.1 | — |
| src/ui/prep.ts | createPrepScreen：战前准备面板（右侧）——出场名单勾选（**R15-2 行内 32px 头像窗**）+ **立绘预览窗（R15-3：选中角色 contain 满宽，无供给区块 :empty 隐藏）** + 技能配置区块（R3-5：选中角色 → 主动 0~5/被动 0~6 槽、通用池混排双过滤置灰、出厂默认、编辑后随编成传 loadout；R2-3/5 武器过滤与头部原子读**编辑装备**；**槽位与池条目均展示 desc 功能描述，PoolItemView 携 desc**）+ **装备区块（R2-5：选人 → 武器槽 ×2、类别过滤条目清单置灰、出厂默认预填、同条目双持合法、可清空至 0——校验仅上限无保底、编辑后随编成传 equipment）** + 实时校验 + 开战按钮；地图配置区块已撤（R12-3：移入 §8 不做）；**R16-3 声明图标化：PoolItemView 增 weaponType/resourceType/cost 声明字段，槽/池条目 decl-icons（武器原子 one-of 逐个 + 资源图标与消耗）、头部原子与装备清单/已装槽均 iconSpan 图标化（类型标签[技能/法术/被动]保持文字）**；站位记忆画布调整结果（getRoster/setChecked/setBoardRoster/selectUnit/addToSlot/removeFromSlot/poolEntries/getEffectiveEquipment/equipWeapon/unequipWeapon/equipmentEntries/refresh/clickStart） | §7.0/§4.9/§4.14 | tests/ui/prep.test.ts |
| src/ui/portrait.ts | portraitMarkup：DOM 头像窗三级回落（R15-2，§7.5）——独立头像 → 立绘裁切（cover 取上部）→ 阵营色底+名首字；img onerror 显示同级隐藏占位（加载失败=缺失同回落） | §7.5 | tests/ui/portrait.test.ts |
| src/ui/icon.ts | iconSpan：UI 图标件（R16-3，§7.5）——语义键出 16px 内联 img（ICON_ART 登记制），加载失败 onerror 显 data-fb 回落文字；未登记回落文字（无文字空串——magic 伤害线不显示）；FALLBACK 回落文案表 | §7.3/§7.0/§7.5 | tests/ui/icon.test.ts |
| src/ui/sidepanel.ts | showUnitInfo/clearUnitInfo、showTerrainInfo/clearTerrainInfo：右侧单位属性（头部 48px 头像窗〔R15-2〕+ 装备条目行〔R2-5〕/特性/状态/主资源读 JobConfig；技能列表显示**有效射程**〔§4.4 属性/特性加成，不含地形〕）与地形面板（R6-1 效果字段条件显示）；**R16-3 五处图标化：主资源/状态行（dot 复用 burn 图）/兵种标签（data-fb 中文回落）/装备行/技能列表伤害类型（物理三线有图、magic 无图不显示）** | §7.3/§3/§4.14/§7.5/§4.4 | tests/ui/sidepanel.test.ts |
| src/ui/action-menu.ts | showActionMenu/hideActionMenu：画布内浮动行动菜单（R5-1 disabled 灰显项不触发回调） | §7.2/§4.13 | tests/ui/action-menu.test.ts |
| src/ui/forecast.ts | showForecastPanel/showSpellForecastPanel/showAoeForecastPanel：战斗/法术/AoE 多目标预报面板（确认/取消；**R7-2 打击行含暴击率/必暴显「必定」**；R15-2 ForecastWho 签名携 templateId/faction——标题行攻守头像 28px、AoE/法术仅施法者） | §4.5/§4.12/§4.9/§7.5 | tests/ui/forecast.test.ts |
| src/ui/battle-log.ts | logBattle：战斗日志（最新在顶，30 条裁剪） | §7.4 | — |
| src/ui/gameover.ts | showGameOverOverlay/hideGameOverOverlay：胜负结算浮层（R15-5，§7.4 结算画面做实）——胜方阵营代表立绘（我方=领主/敌方=BOSS，缺失回落 portraitMarkup 三级链）+ 回合数 + 双方存活统计 | §7.4/§7.5 | tests/ui/gameover.test.ts |
| src/ui/notice.ts | showNotice：战场提示条（增援登场等，定时淡出） | §7.4 | — |

### 根与桌面壳

| 文件 | 职责 | 设计章节 | 测试 |
| --- | --- | --- | --- |
| src/game.ts | Game 类：游戏主循环与状态协调枢纽——构造支持注入我方战前编成（缺省 PLAYER_UNITS、非法 throw，§7.0）、**R14 相机初始偏移竞态修复**（cameraCentered 标记：构造时画布 0 尺寸早退后，首帧 rAF 与 window resize 双路补做初始居中，已居中则不重置玩家视角）、Phase 状态机（idle/unitSelected/actionMenu→**技能二级列表**/targetSelect/forecast/spellForecast/reMove/facingConfirm/enemyTurn/gameOver）、输入分发、选中攻击叠层按**有效射程**绘制（§4.4 属性/特性加成计入；口径同 ai.ts 警戒范围，不含地形加成）、玩家/敌方行动流（R5-1 四处扣费：confirmBattle/confirmSpell 即时与起唱/executeBehaviorSkill/敌方阶段）、技能菜单消耗标签+资源不足灰显、动画编排（**R7-2 暴击标记：飘字「暴击-N」亮橙 + 战报「暴击！命中」**——单体/AoE/法术三路径；**R12-1 虔诚溅射展示**：showSpellResult 尾接 splash——治疗飘字 + 战报「虔诚溅射：…」；**R16-2 特效挂点**：playStrikes 逐击（技能/普攻线 + crit/shield-break/miss）+ showSpellResult 五类法术 + AoE 法术/蓄力触发/行为技能自身格 + removeDead 阵亡 + 构造预载 allFxPaths）、胜负呈现 | §2/§4.8/§7.0/§7.2/§4.13 | tests/game.test.ts |
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
