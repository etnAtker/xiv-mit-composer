# 时间轴性能优化待办

本文档记录全队减伤规划引入后需要继续优化的拖拽和渲染性能项。

## 背景

全队规划支持最多 8 名玩家后，减伤事件、冷却事件、技能列和可视层数量显著增加。拖拽过程中仍沿用原有单人/双坦时期的全量校验和 React state 驱动预览，事件规模扩大后会放大卡顿。

## 优化项

### 1. 拖拽移动中避免全量 strict 冷却重建

当前已有减伤移动时，`handleDragMove` 会调用 `canDropExistingMitigations`，该函数会构造候选事件并执行 strict 冷却校验。全队事件数量增加后，每次 pointer move 都重建全量冷却状态成本较高。

建议：

- 拖拽移动中只做轻量预检，例如移动组内任一事件的开始时间不得小于 0。
- 放下时继续执行 strict 校验，保证最终状态合法。
- 非法落点维持现有错误提示和取消移动行为。

### 2. 按 owner 缩小冷却校验范围

冷却资源已经按 `ownerId` 生成 owner key。同一玩家移动技能时，大多数其他玩家事件不会影响该玩家冷却。

建议：

- 新增按 owner 和共享冷却组裁剪校验事件的工具函数。
- strict 校验候选集合时优先使用相关 owner 的事件子集。
- 保留全量校验作为兜底路径或测试验证路径。

### 3. 缓存拖拽中的合法性判断

拖拽过程中连续 pointer move 可能多次落在相同或近似时间点，重复计算结果相同。

建议：

- 以 `skillId + ownerId + roundedStartMs` 作为缓存 key。
- `roundedStartMs` 可按 100ms 或 250ms 分桶。
- 拖拽会话结束时清空缓存。

### 4. 减少拖拽预览引发的 React 重渲染

当前拖拽预览偏移通过 `dragPreviewPx` React state 更新。该状态在拖拽过程中按 animation frame 更新，会触发时间轴组件树重新渲染。

建议：

- 将拖拽预览偏移改为 ref 或 CSS variable。
- 预览层使用 DOM transform 更新位置。
- React state 只记录拖拽开始、结束和 invalid 状态变化。

### 5. 冷却遮罩分段 memo 化

`CooldownConstraintLayer` 依赖 `cooldownEvents`、`mitEvents` 和 `layout` 构建可视冷却区段。拖拽预览位移不应触发冷却分段重算。

建议：

- 确保 `buildConstraintSegments` 仅在事件集合或布局实际变化时重算。
- 将分段结果用 `useMemo` 固定在 `CooldownConstraintLayer` 内或上层。

### 6. Damage lane 冻结层拆分

Damage lane 已冻结到左侧 sticky 区域。若后续仍出现横向滚动或拖拽重绘压力，可以拆分 Damage 的固定列内容和横向覆盖线。

建议：

- sticky 区域只绘制 Damage 圆点、名称、数值和 hover 命中区。
- 横向红绿覆盖线放回非 sticky 主画布层绘制。
- 降低 sticky 层内宽 SVG 的重绘压力。

## 验证建议

- 使用包含 8 名玩家和大量减伤事件的战斗数据进行手动拖拽验证。
- 分别验证从技能栏拖入新技能、移动单个已有减伤、多选移动已有减伤。
- 静态验证保持：
  - `bun test`
  - `bun run lint`
  - `bun run build`
