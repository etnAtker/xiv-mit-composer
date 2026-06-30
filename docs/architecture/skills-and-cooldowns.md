# 技能与冷却

本文档描述技能数据组织、职业过滤、owner 作用域和冷却校验。

## 技能数据

技能类型定义位于 `src/model/types.ts`。`Skill` 包含技能 ID、显示名称、多语言名称、冷却时间、持续时间、所属职业、FFLogs action ID、图标、Souma 导出 TTS 文本、减伤效果、对位投影标记和共享冷却组。

技能数据位于 `src/data/skills/`，按战斗定位和职业拆分：

- `tank/`：坦克通用技能和 PLD、WAR、DRK、GNB 技能。
- `healer/`：治疗通用技能和 WHM、SCH、AST、SGE 技能。
- `melee/`：近战通用技能和 MNK、DRG、NIN、SAM、RPR、VPR 技能。
- `ranged-physical/`：远敏通用技能和 BRD、MCH、DNC 技能。
- `ranged-magical/`：法系远敏通用技能和 BLM、SMN、RDM、PCT 技能。

各职业文件同时维护本职业技能和本职业共享冷却组。`src/data/skills/index.ts` 汇总全部技能为 `SKILLS`，汇总全部共享冷却组为 `COOLDOWN_GROUP`，并导出技能 Map、共享冷却组 Map、职业过滤函数和 role 技能 owner 作用域工具函数。

部分技能可以声明持续结束关系。父技能通过 `durationEnd.triggerSkillIds` 声明可提前结束自身持续的子技能；子技能通过 `kind: 'durationEnder'` 和 `durationEnder.parentSkillId` 指向父技能。持续结束型子技能可以从侧边栏拖入，但只有落在同一玩家的父技能原始持续时间内才合法；落点会写入父 `MitEvent.endedBy`，并把父事件的 `durationMs` 和 `tEndMs` 缩短到结束时间。持续结束型子技能不会生成独立 `MitEvent`，也不会参与冷却计算。当前 AST「小宇宙」作为「大宇宙」的持续结束型子技能。

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

共享冷却组定义在各职业文件的 `*_COOLDOWN_GROUPS` 中，并由 `src/data/skills/index.ts` 聚合为 `COOLDOWN_GROUP`。冷却组包含组 ID、可用层数上限、可选初始层数和可选自动恢复配置。技能通过 `cooldownGroup` 消耗共享冷却组层数，也可以通过 `cooldownGroupRecoveries` 恢复指定共享冷却组层数。

`stack` 表示资源组层数上限。`initialStack` 表示战斗开始时的初始层数，未配置时等于 `stack`。`recovery.cooldownSec` 表示自动恢复间隔，未配置 `recovery` 的资源组不会自动恢复，只能由技能恢复。冷却计算使用声明 CD 减 0.3 秒后的有效 CD，最小为 0 秒；技能自身 `cooldownSec` 和共享资源 `recovery.cooldownSec` 都使用该规则。技能恢复资源组时不会超过 `stack` 上限。`cooldownGroupRecoveries[].expires.kind = 'skillEnd'` 表示该技能恢复出的资源会在技能事件结束时过期，过期只会移除仍然存在的临时层数，不会把资源扣到初始层数以下。

`cooldownGroup` 可以配置为字符串或字符串数组。字符串表示技能必须消耗该资源组；数组表示按顺序选择第一个当前有层数的资源组消耗，如果全部为 0 层则消耗第一个资源组并由 strict 校验拒绝非法状态。数组资源的 UI 冷却区间按边界扫描生成：每个边界后按同样顺序选择当前首个有层数的资源组，并使用该资源组的不可用状态作为技能不可用状态。

共享冷却组设置 `resourceDisplay` 时会作为资源档数显示到对应成员的时间轴组内。`resourceDisplay.label` 使用短标签。

当前共享冷却组包含以下资源：

- `pld-grp-sheltron`
- `drk-grp-oblation`
- `gnb-grp-aurora`
- `war-grp-bloodwhetting`
- `whm-grp-divine-benison`
- `sch-grp-consolation`
- `sch-grp-aetherflow`
- `sch-grp-recitation`
- `sch-grp-gcd`
- `ast-grp-celestial-intersection`
- `smn-grp-radiant-aegis`

`COOLDOWN_GROUP_SKILLS_MAP` 按组 ID 收集同组技能。某个技能消耗共享冷却组时，同组技能同时获得不可用和冷却限制。未配置自动恢复的资源组耗尽后会保持不可用，直到后续技能通过 `cooldownGroupRecoveries` 恢复层数；如果现有排布会在未来耗尽该资源组，最后一层存在期间会生成资源预占。预占只会让实际消耗该资源且会破坏未来技能资源选择的候选技能显示不可用，不会阻塞仍有替代资源的候选技能。

## 冷却构建

冷却逻辑入口位于 `src/utils/playerCast.ts`。具体构建逻辑按职责拆分到 `src/utils/playerCastStackEvents.ts`、`src/utils/playerCastBoundaries.ts`、`src/utils/playerCastCooldownEvents.ts` 和 `src/utils/playerCastShared.ts`。完整实现设计见 [Player Cast 冷却构建](player-cast.md)。

`buildCooldownsStrict` 使用 strict 模式构建冷却事件和资源状态区间。strict 模式遇到未知技能、未知冷却组、负层数、重复打开的冷却区间或未闭合冷却区间时返回失败结果。

`buildCooldownsTolerant` 使用 tolerant 模式构建冷却事件。tolerant 模式记录错误并继续返回可构建出的冷却事件。

`buildPlayerCastStateTolerant` 使用 tolerant 模式构建冷却事件和资源状态区间。资源状态区间在共享冷却组的层数模拟过程中产生，不在 UI 层反推。初始层数低于上限且配置自动恢复的资源组会从战斗开始排入自动恢复事件。

`evaluateMitigationSetStrict` 对减伤事件按开始时间排序，并使用 strict 模式重建冷却事件和资源状态区间。store 中的减伤事件提交入口使用该函数保证状态合法。

## 插入与移动校验

`canInsertMitigation` 判断某个技能是否能在指定时间插入。函数查找技能定义，获取或构建冷却事件，并检查指定 owner 下同技能的冷却范围。

`src/domain/drag/mitigationDrag.ts` 提供拖拽业务函数。新技能投放调用 `canDropNewMitigation`。已有减伤移动调用 `canDropExistingMitigations` 和 `buildMovedMitEvents`。多选移动按源事件与目标时间的差值整体平移，并使用 strict 冷却校验验证候选事件集合。
