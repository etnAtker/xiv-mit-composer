# Player Cast 冷却构建

本文档描述 `playerCast` 系列模块的整体设计和实现细节。该系统负责把玩家减伤事件转换为技能冷却区间、共享资源状态区间，并提供插入合法性判断。

## 模块边界

冷却构建入口位于 `src/utils/playerCast.ts`。该文件只保留对外 API 和主流程编排：

- `buildCooldownsStrict`
- `buildCooldownsTolerant`
- `buildPlayerCastStateTolerant`
- `evaluateMitigationSetStrict`
- `tryBuildCooldowns`
- `canInsertMitigation`

具体实现按职责拆分：

- `src/utils/playerCastStackEvents.ts`：把 `MitEvent` 转换为资源层数事件。
- `src/utils/playerCastBoundaries.ts`：根据资源层数变化生成技能可用性边界和资源状态区间。
- `src/utils/playerCastCooldownEvents.ts`：把技能边界合成为最终 `CooldownEvent`。
- `src/utils/playerCastShared.ts`：内部类型、错误处理、owner key 和共享资源 key 工具。

输入事件类型是 `MitEvent`。输出状态包含：

- `cooldownEvents`：技能不可用区间和冷却区间。
- `resourceEvents`：启用 `resourceDisplay` 的共享资源层数状态区间。

## 主流程

`buildPlayerCastStateInternal` 是核心编排函数，处理顺序固定：

1. `buildStackEvents(events, mode)` 生成按时间排序的层数事件。
2. `buildBoundaries(stackEvents, mode)` 消费层数事件，生成技能 boundary 和资源状态区间。
3. `buildCooldownEvents(boundaries, mode)` 把 boundary 合成为 `CooldownEvent`。
4. 对 `cooldownEvents` 和 `resourceEvents` 按时间排序。

`evaluateMitigationSetStrict` 会先按 `tStartMs` 排序 `MitEvent`，再使用 strict 模式重建整个状态。store 的提交入口依赖该函数保证排轴状态整体合法。

## Owner 作用域

owner 作用域通过 `ownerKey` 表示：

- 有 `ownerId` 时使用 `id:<ownerId>`。
- 没有 `ownerId` 但有 `ownerJob` 时使用 `job:<ownerJob>`。
- 两者都没有时为 `undefined`。

技能自身冷却资源 key 使用 `skillId[:ownerKey]`。共享冷却组资源 key 使用 `grp:<groupId>[:ownerKey]`。同一技能或同一共享冷却组在不同玩家之间互不影响。

`canInsertMitigation` 检查指定 owner 下目标技能是否存在覆盖 `startMs` 的 `CooldownEvent`。当调用方未传入已构建的 `cooldownEvents` 时，该函数会过滤 `excludeIds` 后用 strict 模式重建冷却。

## Stack Event

`playerCastStackEvents.ts` 将每个 `MitEvent` 展开为 `StackEvent`。`StackEvent` 是内部资源层数变化事件，字段包含：

- `resourceKey`：技能自身资源或共享资源 key。
- `isGroup`：是否为共享冷却组资源。
- `type`：`consume`、`autoRecover`、`skillRecover` 或 `expire`。
- `amount`：变化层数。
- `cooldownMs`：自动恢复间隔或技能自身冷却时长。
- `tMs`：事件时间。

事件排序规则为同一时间点先恢复、后过期、最后消耗：

1. `autoRecover`
2. `skillRecover`
3. `expire`
4. `consume`

该顺序保证同一时间点技能恢复资源后，后续消耗能使用恢复出的层数；临时资源到期和消耗同一时间发生时，过期先执行。

## 技能自身冷却

每次技能释放都会生成技能自身资源的 `consume` 事件。若技能 `cooldownSec > 0`，还会生成对应的 `autoRecover` 事件。

技能自身资源只有 1 层。自身资源耗尽时产生前向 `unusable` 区间和后向 `cooldown` 区间：

- `unusable`：从 `tStartMs - cooldownSec` 到释放时刻。
- `cooldown`：从释放时刻到冷却结束。

前向 `unusable` 用于阻止向已有释放事件前方插入会破坏该释放合法性的同技能事件。

## 共享资源消耗

技能通过 `cooldownGroup` 消耗共享资源。`cooldownGroup` 支持字符串和字符串数组：

- 字符串表示只能消耗该资源组。
- 字符串数组表示按顺序选择第一个当前 `stack > 0` 的资源组。
- 如果数组内所有资源组都是 0 层，则选择第一个资源组，strict 模式会在后续层数模拟中返回负层数错误。

选择逻辑发生在 `buildStackEvents` 阶段。该阶段维护当前共享资源层数，并在处理每个开始时间时先 flush 已到期的恢复事件，再处理同一时间点的技能恢复，最后处理技能消耗。

## 共享资源恢复

共享资源有两种恢复来源：

- 自动恢复：冷却组配置 `recovery.cooldownSec` 后，资源从非满层开始按间隔自动恢复。
- 技能恢复：技能配置 `cooldownGroupRecoveries` 后，在技能释放时恢复指定资源组层数。

自动恢复只在资源不满且配置了 `recovery` 时排入事件。未配置 `recovery` 的资源组耗尽后保持 0 层，直到后续技能恢复。

技能恢复不会超过资源组 `stack` 上限。`cooldownGroupRecoveries[].expires.kind = 'skillEnd'` 表示该技能恢复出的临时资源在技能事件结束时过期；过期不会把资源扣到 `initialStack` 以下。

## Resource Timeline

`buildBoundaries` 消费 `StackEvent`，为共享资源建立三类内部时间线：

- `StackInterval`：资源在时间区间内的层数。
- `ConstraintInterval`：资源在时间区间内的 `cooldown` 或 `unusable` 状态。
- `ReservationInterval`：未来事件对某个资源最后一层的预占。

同时，启用 `resourceDisplay` 的共享资源会生成 `ResourceEvent`。`ResourceEvent` 只用于 UI 资源列显示，不参与后续校验。

资源状态区间在层数模拟过程中直接产生。UI 不反推资源状态。

## Boundary

`CooldownEventBoundary` 是技能可用性区间的中间表示，包含四种边界：

- `unusedStart`
- `unusedEnd`
- `cooldownStart`
- `cooldownEnd`

资源耗尽时通常产生：

- 前向 `unusable` 边界对。
- 当前时刻的 `cooldownStart`。

资源从 0 层恢复到正数时产生：

- 初始 0 层资源的 `cooldownStart`。
- 当前时刻的 `cooldownEnd`。

普通单资源共享组会把边界传播到 `COOLDOWN_GROUP_SKILLS_MAP` 中同组技能。数组 `cooldownGroup` 技能不直接接受单资源传播，而是在后续按技能独立计算可用性。

## Cooldown Event 合成

`playerCastCooldownEvents.ts` 把每个技能列的 boundary 合成为最终 `CooldownEvent`。

合成时维护两个打开计数：

- `unusableOpenCount`
- `cooldownOpenCount`

当两个计数都为 0 时，技能可用。若存在 `unusable`，显示为 `unusable`；若不存在 `unusable` 但存在 `cooldown`，显示为 `cooldown`。`unusable` 优先级高于 `cooldown`。

未配置自动恢复的共享资源允许打开的 `cooldown` 区间延伸到 `Number.MAX_SAFE_INTEGER`，表示资源持续不可用直到技能恢复。

## 多资源技能可用性

数组 `cooldownGroup` 技能需要按技能单独扫描可用性，原因是它不依赖单一资源。`playerCastBoundaries.ts` 为这类技能收集相关 boundary：

- 候选资源组的 stack interval 边界。
- 候选资源组的 constraint interval 边界。
- 候选资源组的 reservation interval 边界。

在每个 boundary 时刻，按 `cooldownGroup` 数组顺序选择当前首个 `stack > 0` 的资源组。若全部为 0，则选择第一个资源组。技能在该区间的不可用状态只取选中资源组：

- 选中资源组存在 `cooldown` 或 `unusable` 时，技能显示对应状态。
- 选中资源组不存在 constraint 时，检查 reservation 是否会阻塞该技能。
- 其他未选中资源组不会直接影响该技能显示。

该规则让同一组候选资源可以表达“免费资源优先、普通资源兜底”的语义。

## Reservation

reservation 用于处理“未来事件已经占用了某资源最后一层”的场景。它不是资源全局不可用，而是资源级预占。

当某个未配置自动恢复的共享资源被未来 `consume` 事件耗尽时，系统记录一个 `ReservationInterval`：

- `resourceId`：被耗尽的资源。
- `futureSkillId`：未来消耗该资源的技能。
- `futureGroupIds`：未来技能可选择的资源组列表。
- `tStartMs`：最后一层资源开始存在的时间。
- `tEndMs`：未来事件消耗该资源的时间。

生成候选技能不可用区间时，reservation 只在以下条件同时满足时阻塞候选技能：

- 候选技能在当前 boundary 会选择并消耗该 reservation 的资源。
- 该消耗会导致未来技能在 `tEndMs` 时没有任何可选资源可用。

因此，reservation 不会阻塞仍能使用替代资源的候选技能。示例：

- A 依赖 `[a, b]`
- B 依赖 `[a, c]`
- 当前 `a=1, b=1, c=0`

如果 5s 后已有 A，当前插入 A 或 B 都不会破坏未来 A，因为未来 A 还能使用 `b`。如果 5s 后已有 B，当前插入 A 或 B 都会消耗 `a`，未来 B 没有可用的 `c`，因此 A 和 B 都显示不可用。

## SCH 秘策示例

学者秘策通过资源组表达：

- `sch-grp-recitation` 初始 0 层，表示秘策提供的一次免费资源。
- `sch-recitation` 恢复 1 层 `sch-grp-recitation`，并在技能结束时过期。
- `sch-indomitability` 和 `sch-excogitation` 依赖 `[sch-grp-recitation, sch-grp-aetherflow]`。
- `sch-adloquium` 和 `sch-concitation` 依赖 `[sch-grp-recitation, sch-grp-gcd]`。

数组顺序使秘策资源优先被消耗。秘策资源存在时，这些技能优先消耗秘策；秘策不存在时，分别回退到以太超流或 GCD 资源。消耗秘策不影响技能自身冷却，技能自身冷却仍由技能自身资源独立维护。

## Strict 与 Tolerant

构建模式通过 `BuildMode` 控制：

- strict：遇到构建错误时抛出 `CooldownBuildError`，对外返回失败结果。
- tolerant：记录错误并继续返回可构建出的结果。

当前构建错误包含：

- 未知技能。
- 未知共享冷却组。
- 资源层数变为负数。
- cooldown boundary 状态异常。
- 未闭合 cooldown 区间。

拖拽提交和状态提交使用 strict 模式，迁移和容错读取使用 tolerant 模式。

## 性能特征

构建以事件和 boundary 为单位，不按时间片枚举。

主要成本包括：

- `buildStackEvents` 使用二叉堆维护 stack event，复杂度与事件数和自动恢复事件数相关。
- `buildBoundaries` 顺序消费 stack event，并为共享资源生成 stack、constraint 和 reservation 区间。
- 多资源技能按相关资源的 boundary 扫描，不扫描每个毫秒时间点。
- reservation 判断只在候选技能实际选择 reservation 资源时发生，并检查未来技能的候选资源是否仍有可用层数。

当前 interval 查询使用线性查找。典型战斗排轴规模下开销可控；如果后续资源组和事件数量显著增加，可把 `getStackValueAt`、`getStackValueBefore` 和 constraint 查询替换为二分查询或游标扫描。

## 维护约束

新增共享资源语义时，优先在数据层表达：

- 层数上限用 `stack`。
- 初始层数用 `initialStack`。
- 自动恢复用 `recovery.cooldownSec`。
- 技能恢复用 `cooldownGroupRecoveries`。
- 临时资源过期用 `expires.kind = 'skillEnd'`。
- 多资源选择用数组 `cooldownGroup` 的顺序。

不要在 UI 层反推资源层数，也不要在插入校验里局部模拟单个技能后直接修改现有结果。合法性判断应通过重建完整 `PlayerCastState` 或复用已构建的 `cooldownEvents` 完成。
