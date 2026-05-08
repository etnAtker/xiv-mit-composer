# 全队减伤规划实施计划

本文档描述全队减伤规划的实施拆分、影响文件和验证策略。

## 实施原则

- 先建立 playerId 维度的数据结构，再改 UI。
- 保持现有单人能力可用。
- 不在本阶段引入目标覆盖、血量计算或职业构成校验。
- 每一步保持可构建、可测试。
- 优先复用现有技能过滤、冷却校验、FFLogs 加载和时间轴渲染逻辑。

## 阶段一：队伍成员状态与加载入口

### 目标

引入最多 8 人的队伍成员状态，替代双坦专用状态。

### 影响文件

- `src/model/types.ts`
- `src/store/index.ts`
- `src/store/selectors.ts`
- `src/App.tsx`
- `src/components/LoadFightModal.tsx`
- 新增 `src/components/PartyMemberSelectModal.tsx`

### 核心改动

1. 新增 `PartyMember` 类型。
2. store 新增：
   - `partyMembers`
   - `setPartyMembers`
   - `updatePartyMemberCollapsed`
   - `damageEventsByPlayerId`
3. 保留 `selectedJob` 和 `selectedPlayerId` 作为兼容字段或过渡字段。
4. 加载流程改为：
   - 点击加载战斗。
   - 加载 fight metadata。
   - 打开玩家选择弹窗。
   - 用户选择最多 8 人。
   - 确认后加载所选玩家事件。
5. 移除 `dualTankPlayers` 的业务依赖。

### 验证

- 未选择玩家时不加载事件。
- 最多只能选择 8 人。
- 可选择任意职业构成。
- 可选择重复职业玩家。
- 选择顺序稳定保存到 `partyMembers`。

## 阶段二：按 playerId 加载和存储伤害

### 目标

把伤害事件从职业维度改为玩家维度，避免重复职业冲突。

### 影响文件

- `src/store/index.ts`
- `src/domain/fflogs/buildDamageEventsByJob.ts`
- 可新增 `src/domain/fflogs/buildDamageEventsByPlayerId.ts`
- `src/model/types.ts`

### 核心改动

1. 新增 `DamageEventsByPlayerId` 类型。
2. `loadEventsCore` 的 damage batches 保留 `playerId`、`playerName` 和 `job`。
3. 新增 `buildDamageEventsByPlayerId`：

```ts
function buildDamageEventsByPlayerId(
  batches: { playerId: number; events: DamageEvent[] }[],
  fightStart: number,
): Record<number, DamageEvent[]>;
```

4. `loadEventsForPlayers` 写入 `damageEventsByPlayerId`。
5. 旧 `damageEventsByJob` 可在过渡期保留，但时间轴不再依赖它。

### 验证

- 两个相同职业玩家的伤害分别存储。
- 第一个玩家不再覆盖其他玩家的总伤害来源。
- 单人加载仍能得到 damage 数据。

## 阶段三：全局伤害组合并

### 目标

从 `damageEventsByPlayerId` 派生一条全局 Damage lane 数据。

### 影响文件

- 新增 `src/domain/fflogs/groupDamageEvents.ts`
- `src/components/Timeline/types.ts`
- `src/components/Timeline/Timeline.tsx`
- `src/components/Timeline/TimelineLanes.tsx`
- `src/components/Timeline/TimelineTooltip.tsx`
- 测试新增 `test/groupDamageEvents.test.ts`

### 核心改动

1. 新增常量：

```ts
const DAMAGE_GROUP_WINDOW_MS = 100;
```

2. 新增 `GroupedDamageEvent` 和 `GroupedDamageHit`。
3. 合并规则：
   - `ability.guid` 相同。
   - 时间差 `< 100ms`。
   - 不使用 `sourceID`。
4. 伤害组显示值使用组内最大 `unmitigatedAmount`。
5. Hover 明细展示所有命中玩家。
6. 红绿覆盖保留，判断规则为伤害组时间点是否落在任意 `MitEvent` 释放窗口内。

### 验证

- 同 ability ID 且 100ms 内的多人伤害合并为一组。
- 不同 ability ID 不合并。
- 同 ability ID 但超过 100ms 不合并。
- 代表伤害取最大值。
- Hover 明细包含组内所有玩家。

## 阶段四：时间轴布局按玩家分组

### 目标

把时间轴技能列从职业维度改为玩家维度，并支持玩家组折叠。

### 影响文件

- `src/components/Timeline/timelineLayout.ts`
- `src/components/Timeline/mitigationColumnUtils.ts`
- `src/components/Timeline/Timeline.tsx`
- `src/components/Timeline/TimelineCanvas.tsx`
- `src/components/Timeline/TimelineHeader.tsx`
- `src/components/Timeline/TimelineBackground.tsx`
- `src/components/Timeline/CooldownConstraintLayer.tsx`
- `src/components/Timeline/MitigationLayer.tsx`
- `src/components/Timeline/useBoxSelection.ts`
- `test/mitigationColumnUtils.test.ts`

### 核心改动

1. `buildTimelineLayout` 输入从 `jobs` 改为 `members`。
2. 新增玩家组结构：

```ts
interface TimelineMemberGroup {
  member: PartyMember;
  skills: TimelineSkillColumn[];
  collapsed: boolean;
  width: number;
}
```

3. 技能列 key 改为：

```text
基础技能ID:playerId
```

4. 折叠玩家时：
   - 不生成该玩家技能列。
   - 仍生成固定宽度折叠头。
   - 该玩家的减伤条和冷却遮罩因找不到列而不渲染。
5. 全局 Damage lane 固定在 Boss Cast 后，不插入玩家组之间。
6. 移除 `primaryJob`、`secondaryJob` 和 `secondaryDamageLaneOffset` 的布局语义。

### 验证

- 8 人全展开时列宽正确。
- 单个玩家折叠后总宽减少。
- 折叠玩家的减伤条隐藏但数据保留。
- 展开后减伤条恢复。
- 重复职业玩家的 role 技能列按 playerId 分发。

## 阶段五：技能侧栏按玩家分组

### 目标

技能拖拽归属到具体玩家，而不是职业。

### 影响文件

- `src/components/SkillSidebar.tsx`
- `src/components/Skill/DraggableSkill.tsx`
- `src/dnd/types.ts`
- `src/hooks/useMitigationDragController.ts`
- `src/domain/drag/mitigationDrag.ts`
- `test/mitigationDrag.test.ts`

### 核心改动

1. `SkillSidebar` 接收 `partyMembers`。
2. 分组标题显示职业图标、玩家名和职业。
3. `DraggableSkill` drag data 增加 `ownerId`。
4. `resolveOwnerContext` 改为优先使用 drag item 中的 `ownerId` 和 `ownerJob`。
5. `buildMitEventFromSkill` 新建事件时写入 `ownerId`。

### 验证

- 同职业两个玩家拖入相同技能后 ownerId 不同。
- 同职业两个玩家同技能冷却互不冲突。
- 拖拽历史事件移动仍按原 owner 计算冷却。

## 阶段六：玩家选择与折叠 UI

### 目标

提供可用的导入选择窗口和时间轴折叠控制。

### 影响文件

- `src/components/PartyMemberSelectModal.tsx`
- `src/components/FightInfoBar.tsx`
- `src/components/Timeline/TimelineHeader.tsx`
- `src/App.tsx`

### 核心改动

1. 玩家选择窗口：
   - 可选列表。
   - 已选列表。
   - 最多 8 人限制。
   - 上移、下移、移除。
   - 确认和取消。
2. FightInfoBar 显示当前队伍成员摘要。
3. TimelineHeader 玩家组头部增加折叠/展开按钮。
4. 顶部增加全部展开、全部折叠控制。

### 验证

- 选择窗口不会因重复职业显示异常。
- 折叠按钮只影响对应玩家。
- 全部展开和全部折叠状态正确。

## 阶段七：导出与文档同步

### 目标

保证导出和项目文档描述新行为。

### 影响文件

- `src/App.tsx`
- `src/lib/fflogs/exporter.ts`
- `docs/index.md`
- `docs/product/usage.md`
- `docs/architecture/application.md`
- `docs/architecture/timeline.md`
- `docs/architecture/skills-and-cooldowns.md`
- `README.md`

### 核心改动

1. 导出玩家技能时使用 `mit.ownerId`。
2. `condition.jobs` 来自 `partyMembers` 的职业，建议去重。
3. 文档更新为“最多 8 人释放规划”。
4. README 移除“仅支持 4 坦克职业”的限制描述。

### 验证

- 导出 JSON 中玩家技能 sourceId 正确。
- TTS 生成行为不变。
- 文档不再描述双坦专用流程。

## 测试计划

### 单元测试

- `groupDamageEvents.test.ts`
  - ability ID + 100ms 合并。
  - 不同 ability ID 不合并。
  - 超出 100ms 不合并。
  - 显示伤害取最大值。
  - hover 明细数据完整。
- `mitigationColumnUtils.test.ts`
  - 相同职业不同 playerId 分配到不同列。
  - 折叠玩家无列。
- `mitigationDrag.test.ts`
  - 新技能事件带 ownerId。
  - 重复职业玩家冷却互不影响。
- `playerCast.test.ts`
  - ownerId 优先级保持有效。

### 集成验证

- `bun run lint`
- `bun run build`
- `bun test`

### 手动验证

- 加载一场包含 8 人的 FFLogs。
- 选择任意 8 人并导入。
- 选择重复职业玩家。
- 拖入同职业两名玩家的同一技能。
- 折叠和展开玩家组。
- 查看 Damage lane 聚合和 hover 明细。
- 导出 Souma 时间轴。

## 风险与处理

### 横向宽度过大

8 人全展开会产生很宽的时间轴。通过玩家组折叠、全部折叠和横向滚动控制。

### 红绿覆盖语义不严格

当前颜色只表示伤害组时间落在任意释放窗口内，不表示真实目标覆盖。产品文案和文档需要明确该阶段语义。

### 旧状态迁移

旧本地状态可能只有单人选择。迁移时生成单人 `partyMembers`，避免用户打开后无选择。

### 重复职业导出条件

`condition.jobs` 去重会丢失重复职业数量，但 Souma 条件通常只需要职业集合。若后续需要表达队伍构成，再扩展导出字段。

## 建议提交拆分

1. `feat: 新增全队成员选择模型`
2. `feat: 按玩家加载并合并全队伤害`
3. `feat: 时间轴支持玩家技能组折叠`
4. `feat: 技能拖拽绑定具体玩家`
5. `docs: 更新全队减伤规划文档`
