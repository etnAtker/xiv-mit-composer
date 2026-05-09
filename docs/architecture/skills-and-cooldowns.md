# 技能与冷却

本文档描述技能数据组织、职业过滤、owner 作用域和冷却校验。

## 技能数据

技能类型定义位于 `src/model/types.ts`。`Skill` 包含技能 ID、显示名称、多语言名称、冷却时间、持续时间、所属职业、FFLogs action ID、图标、减伤效果、对位投影标记和共享冷却组。

技能数据位于 `src/data/skills/`，按战斗定位和职业拆分：

- `tank/`：坦克通用技能和 PLD、WAR、DRK、GNB 技能。
- `healer/`：治疗通用技能和 WHM、SCH、AST、SGE 技能。
- `melee/`：近战通用技能和 MNK、DRG、NIN、SAM、RPR、VPR 技能。
- `ranged-physical/`：远敏通用技能和 BRD、MCH、DNC 技能。
- `ranged-magical/`：法系远敏通用技能和 BLM、SMN、RDM、PCT 技能。

`src/data/skills/index.ts` 汇总全部技能为 `SKILLS`，并导出技能 Map、共享冷却组 Map、职业过滤函数和 role 技能 owner 作用域工具函数。

## 职业与职能技能

`Job` 联合类型定义当前模型支持的职业缩写。`CombatRole` 将职业归类为 tank、healer、melee、ranged-physical 和 ranged-magical。

`ROLE_SKILL_IDS` 标记职能技能。`isSkillAvailableForJob` 决定技能是否展示给指定职业：职业专属技能只展示给同职业，非 role 的 `ALL` 技能展示给全部职业，role 技能按 `ROLE_BY_ROLE_SKILL_ID` 限定战斗定位。

`counterpartProjection` 标记技能是否在时间轴中向其他成员的同技能列显示对位投影。雪仇、牵制和昏乱启用该标记。

队伍成员职业由 `src/model/jobs.ts` 根据 FFLogs friendlies 的职业类型解析。玩家选择窗口支持全部 `Job` 联合类型内的职业。

## Owner 作用域

`MitEvent` 包含 `ownerId` 和 `ownerJob`。`CooldownEvent` 包含 `ownerJob` 和 `ownerKey`。owner 信息使同一技能在不同玩家之间独立计算冷却。

`withOwnerSkillId` 为 role 技能追加 owner 职业后缀，格式为 `基础技能ID@职业`。`normalizeSkillId` 移除 owner 后缀，返回基础技能 ID。技能定义查找始终使用基础技能 ID。

时间轴列 key 使用冒号格式，格式为 `基础技能ID:playerId`。`getMitColumnKey` 和 `getCooldownColumnKey` 优先根据 `ownerId` 或 `ownerKey` 把技能分发到对应玩家列。缺少玩家 ID 的历史事件回退到 owner 职业或默认队伍成员。

## 共享冷却组

共享冷却组定义在 `COOLDOWN_GROUP`。冷却组包含组 ID、冷却秒数和可用层数。技能通过 `cooldownGroup` 关联共享冷却组。

当前共享冷却组包含以下资源：

- `pld-grp-sheltron`
- `drk-grp-oblation`
- `gnb-grp-aurora`
- `war-grp-bloodwhetting`
- `whm-grp-divine-benison`
- `sch-grp-consolation`
- `ast-grp-celestial-intersection`
- `smn-grp-radiant-aegis`

`COOLDOWN_GROUP_SKILLS_MAP` 按组 ID 收集同组技能。某个技能消耗共享冷却组时，同组技能同时获得不可用和冷却限制。

## 冷却构建

冷却逻辑位于 `src/utils/playerCast.ts`。

`buildCooldownsStrict` 使用 strict 模式构建冷却事件。strict 模式遇到未知技能、未知冷却组、负层数、重复打开的冷却区间或未闭合冷却区间时返回失败结果。

`buildCooldownsTolerant` 使用 tolerant 模式构建冷却事件。tolerant 模式记录错误并继续返回可构建出的冷却事件。

`evaluateMitigationSetStrict` 对减伤事件按开始时间排序，并使用 strict 模式重建冷却事件。store 中的减伤事件提交入口使用该函数保证状态合法。

## 插入与移动校验

`canInsertMitigation` 判断某个技能是否能在指定时间插入。函数查找技能定义，获取或构建冷却事件，并检查指定 owner 下同技能的冷却范围。

`src/domain/drag/mitigationDrag.ts` 提供拖拽业务函数。新技能投放调用 `canDropNewMitigation`。已有减伤移动调用 `canDropExistingMitigations` 和 `buildMovedMitEvents`。多选移动按源事件与目标时间的差值整体平移，并使用 strict 冷却校验验证候选事件集合。
