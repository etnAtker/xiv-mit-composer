# 全队减伤规划详细设计

本文档描述把当前减伤规划能力从单坦/双坦扩展为最多 8 名玩家的全队释放规划器的目标设计。

## 目标

- 支持从 FFLogs 战斗参与玩家中自由选择最多 8 名玩家。
- 允许重复职业，不校验 2T2H4DPS 构成。
- 减伤事件只表达释放行为，不表达目标覆盖。
- 同一技能在不同玩家之间按 `playerId` 独立计算冷却。
- 时间轴保留一条全局 Damage lane，用于总体规划。
- 每名玩家拥有独立技能列组，玩家组支持折叠和展开。
- 导出继续输出 Souma 时间轴 JSON。

## 非目标

- 不实现血量计算。
- 不实现目标选择。
- 不计算技能是否实际覆盖某个玩家。
- 不按职业构成限制导入结果。
- 不在本阶段实现全队承伤收益、剩余血量或护盾量估算。

## 领域模型

### 队伍成员

新增队伍成员模型，使用 `playerId` 作为唯一身份。

```ts
interface PartyMember {
  playerId: number;
  name: string;
  job: Job;
  collapsed: boolean;
}
```

`job` 仅用于职业图标、技能过滤和导出条件。重复职业通过不同 `playerId` 区分。

### 减伤事件

`MitEvent` 继续表达一次技能释放。

```ts
interface MitEvent {
  eventType: 'mit';
  id: string;
  skillId: string;
  tStartMs: number;
  durationMs: number;
  tEndMs: number;
  ownerId?: number;
  ownerJob?: Job;
}
```

新建事件必须写入 `ownerId` 和 `ownerJob`。冷却构建继续优先使用 `ownerId` 生成 owner key，因此同职业不同玩家的同一技能互不影响。

### 伤害事件

多人伤害加载结果按玩家存储。

```ts
type DamageEventsByPlayerId = Record<number, DamageEvent[]>;
```

每名玩家的 `damage-taken` 独立通过 `mergeDamageEvents` 转换为相对战斗时间事件。该结构保留真实承伤差异和单体点名归属。

## 全局伤害组合并

时间轴显示一条全局 Damage lane。该 lane 的数据由所有已选玩家的伤害事件合并生成。

### 合并条件

两个伤害事件属于同一伤害组需要同时满足：

- `ability.guid` 相同。
- 事件时间相差小于 `100ms`。

不使用 `sourceID` 参与合并。FF14 中同一机制可能由不同 source 记录，使用 source 反而会拆散应合并的承伤。

### 分组算法

1. 收集所有已选玩家的 `DamageEvent`，并附加 `playerId`、`playerName` 和 `job`。
2. 按 `ability.guid` 分桶。
3. 每个桶内按 `tMs` 升序排序。
4. 依次扫描事件，当前事件与当前组基准时间差 `< 100ms` 时加入当前组，否则创建新组。
5. 组时间使用组内最早 `tMs`。
6. 组显示技能名使用组内第一个事件的 `ability.name`。
7. 组显示伤害数值使用组内 `unmitigatedAmount` 的最大值。

建议用常量表示阈值：

```ts
const DAMAGE_GROUP_WINDOW_MS = 100;
```

### 伤害组模型

```ts
interface GroupedDamageEvent {
  id: string;
  tMs: number;
  ability: FFLogsAbility;
  displayAmount: number;
  hits: GroupedDamageHit[];
}

interface GroupedDamageHit {
  playerId: number;
  playerName: string;
  job: Job;
  tMs: number;
  amount: number;
  unmitigatedAmount: number;
  originalEvent: DamageEvent;
}
```

`id` 可由 `ability.guid`、组时间和组内玩家 ID 生成，确保 React key 稳定。

### Damage lane 展示

Damage lane 仅显示合并后的伤害组：

- 圆点位置使用伤害组 `tMs`。
- 标签使用伤害组 `ability.name`。
- 数值使用 `displayAmount`。
- 多人命中不在主视图重复绘制。

Hover 弹窗展示组内明细：

- 玩家职业图标。
- 玩家名。
- 该玩家实际伤害。
- 该玩家事件时间。
- 与组时间的偏移量。

### 红绿覆盖

本阶段保留现有红绿覆盖视觉。由于当前不做目标覆盖计算，覆盖语义定义为：

> 伤害组时间点是否落在任意已排减伤释放窗口内。

该颜色仅用于总体规划提示，不代表技能实际覆盖了组内所有玩家。

## 加载流程

### 战斗元数据

点击加载战斗后先加载 FFLogs fight metadata，得到当前战斗的 friendlies 和 boss IDs。

### 选择玩家弹窗

元数据加载完成后弹出玩家选择窗口。

窗口结构：

- 左侧为当前 fight 中的可选玩家列表。
- 右侧为已选玩家列表。
- 最多选择 8 人。
- 不校验职业构成。
- 允许重复职业。
- 支持调整已选玩家顺序。

可选玩家项显示：

- 职业图标。
- 玩家名。
- 职业缩写。

已选玩家项显示：

- 顺序编号。
- 职业图标。
- 玩家名。
- 职业缩写。
- 移除按钮。
- 上移/下移按钮。

确认后写入 `partyMembers`，并调用多人事件加载。

### 多人事件加载

`loadEventsForPlayers` 接收 `PartyMember[]` 或等价的 `{ id, job, name }[]`。

对每名玩家并行加载：

- friendly casts。
- damage-taken。

对 boss 并行加载：

- casts。

加载结果写入：

- `mitEvents`。
- `cooldownEvents`。
- `damageEventsByPlayerId`。
- `groupedDamageEvents` 或由 selector 派生。
- `castEvents`。

## 时间轴布局

### 总体布局

时间轴横向布局调整为：

```text
Time | Boss Cast | Damage | Player A Skills | Player B Skills | ...
```

Damage lane 为全局唯一，固定在 Boss Cast 后面。

### 玩家技能组

每名玩家拥有一个技能组。展开时显示该玩家可用技能列，折叠时只显示窄头部。

展开状态：

```text
[GNB PlayerA v]
[Rampart][Reprisal][Nebula][Heart of Corundum]...
```

折叠状态：

```text
[GNB >]
```

折叠后：

- 隐藏该玩家技能列。
- 隐藏该玩家的减伤条和冷却遮罩。
- 数据保留。
- 技能侧栏仍可显示该玩家技能，用户可继续展开后查看。

### 列 key

技能列 key 从职业维度改为玩家维度。

```text
基础技能ID:playerId
```

非 role 技能和 role 技能都按 playerId 归属到释放者列。这样重复职业不会共享列。

### 玩家组宽度

- Damage lane 宽度继续使用 `DAMAGE_LANE_WIDTH`。
- 技能列宽度继续使用 `MIT_COLUMN_WIDTH`。
- 展开玩家组宽度为该玩家可用技能列数乘以 `MIT_COLUMN_WIDTH`。
- 折叠玩家组宽度使用固定窄宽度，例如 `56px`。

## 技能侧栏

技能侧栏按队伍成员分组，而不是按职业去重。

分组标题：

```text
GNB PlayerA
GNB PlayerB
WHM PlayerC
```

拖拽技能时，drag data 必须包含：

```ts
{
  type: 'new-skill';
  skill: Skill;
  ownerId: number;
  ownerJob: Job;
}
```

新建 `MitEvent` 时直接使用该 owner 信息。

## 导出

导出事件继续由 Boss 咏唱和当前 `mitEvents` 合并生成。

玩家减伤行的 `sourceId` 使用 `mit.ownerId`。当历史数据缺少 owner 时再回退到当前选中玩家。

`condition.jobs` 使用已选队伍成员职业生成。建议先去重，保持当前 Souma 条件体积较小。

## 兼容与迁移

本地持久化中可能存在旧字段：

- `selectedJob`
- `selectedPlayerId`
- `mitEvents`

迁移策略：

- 如果存在旧的 `selectedPlayerId` 和 `selectedJob`，生成一个单人 `partyMembers`。
- 历史 `mitEvents` 缺少 owner 时沿用旧逻辑补 `ownerId` 和 `ownerJob`。
- 旧的 `damageEvents` 不持久化，无需迁移。

## 测试重点

- 重复职业玩家的技能列互不冲突。
- 重复职业玩家的冷却互不冲突。
- 多人伤害按 `ability.guid + 100ms` 正确合并。
- 合并伤害显示最大 `unmitigatedAmount`。
- Hover 明细包含所有组内玩家伤害。
- 折叠玩家后对应技能列、减伤条和冷却遮罩隐藏。
- 展开玩家后数据恢复显示。
- 导入最多 8 人限制生效。
- 不校验职业构成。
