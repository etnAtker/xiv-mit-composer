# 时间轴架构

本文档描述时间轴布局、渲染层、滚动缩放、选择和编辑。

## 组件结构

`src/components/Timeline/Timeline.tsx` 从 store 读取战斗、队伍成员、减伤、冷却、按玩家分组的伤害和咏唱事件，并计算时间轴尺寸。`Timeline` 调用 `buildTimelineLayout` 生成减伤列布局，把按玩家分组的伤害聚合为全局受击组，然后把布局和事件传入 `TimelineCanvas`。

`src/components/Timeline/TimelineCanvas.tsx` 负责时间轴主体渲染、滚动、缩放、框选、右键菜单、编辑弹窗、悬浮提示和删除快捷键。

时间轴主要渲染层包含：

- `TimelineHeader`：固定表头。
- `PinnedTimelineLanes`：固定时间标尺、Boss 咏唱列和全局 Damage 列。
- `TimelineBackground`：列背景。
- `TimelineGridLines`：时间网格线。
- `ResourceLaneLayer`：成员组内共享资源档数列。
- `CooldownConstraintLayer`：冷却和不可用区间。
- `MitigationLayer`：减伤条、拖拽投放区域和编辑入口。
- `TimelineTooltip`：事件悬浮提示。

## 布局

`src/components/Timeline/timelineLayout.ts` 定义 `buildTimelineLayout`。布局输入为当前队伍成员和技能表。

时间轴横向布局为时间列、Boss 咏唱列、全局 Damage 列和队伍成员技能组。每名队伍成员拥有独立技能组，技能列 key 使用 `基础技能ID:playerId`。折叠玩家组时，布局保留一个窄头部并不生成该玩家技能列。

启用 `resourceDisplay` 的共享冷却组会在对应成员技能组内生成资源窄列。资源列排在该成员技能列之前，列宽由 `RESOURCE_COLUMN_WIDTH` 定义，表头显示共享组的短标签。

非 role 技能和 role 技能都按 `playerId` 分发到释放者列。重复职业玩家不会共享技能列。`kind: 'durationEnder'` 的持续结束型子技能不会生成独立技能列。

技能定义启用 `counterpartProjection` 时，`MitigationLayer` 会在其他未折叠成员的同技能列绘制半透明对位投影。投影目标按基础技能 ID 和目标成员技能列判断；目标成员没有该技能列时不绘制投影。

## 时间与尺寸

时间轴以毫秒作为事件模型单位，以秒作为可视网格单位。纵向尺寸由战斗时长和缩放比例计算。Boss 咏唱存在施法持续时间时，时间轴总高度覆盖最后一个咏唱结束时间。

固定列宽来自 `src/constants/timeline.ts`。减伤列宽来自 `src/components/Timeline/timelineUtils.ts` 的 `MIT_COLUMN_WIDTH`。展开玩家组会在技能列左右保留玩家组级别 padding，并保证组宽至少为 3 个减伤列宽。

## 滚动与缩放

`useTimelineScroll` 管理滚动容器、可见范围、表头阴影状态和滚轮缩放。用户按住 `Alt` 并滚动鼠标滚轮时，时间轴按步进调整缩放。

可见范围包含缓冲区，时间轴层根据该范围减少不可见事件的渲染。

## 减伤选择与编辑

`useBoxSelection` 支持在时间轴中框选减伤条。选中结果写入 store 的 `selectedMitIds`。

选中减伤后，用户按 `Delete` 或 `Backspace` 删除选中项。右键菜单在存在选中项时显示，单选时提供编辑事件，多选时提供批量删除。

减伤条编辑通过 `MitigationEditPopover` 调用 store 的 `updateMitEvent`。支持持续结束的父技能会显示结束时间输入框，提交后更新 `endedBy`、`durationMs` 和 `tEndMs`；清空结束时间会移除 `endedBy` 并恢复完整持续时间。更新后的事件集合通过 strict 冷却校验。

带有 `endedBy` 的减伤条会在右下角显示结束技能图标。结束技能图标右键菜单提供编辑事件和删除结束标记；删除结束标记会恢复父技能完整持续时间。

## 拖拽

全局拖拽上下文位于 `src/App.tsx`。`useMitigationDragController` 处理新技能拖入、已有减伤移动、批量移动、删除投放区和拖拽预览。

拖拽投放区由 dnd-kit `useDroppable` 创建。投放区数据包含 `msPerPx`，用于把拖拽位置转换为 `tStartMs`。全局拖拽上下文使用 `src/dnd/collision.ts` 的碰撞检测：默认沿用 dnd-kit `rectIntersection`，当默认结果为空时，对时间轴投放区按真实矩形重叠面积兜底，避免巨大时间轴投放区和极短减伤条之间的比例取整导致漏判。

新技能拖入时，控制器调用 `canDropNewMitigation` 判断冷却合法性，再调用 `buildMitEventFromSkill` 创建事件。持续结束型技能拖入同一 owner 的父技能原始持续窗口时，控制器调用 `buildDurationEndMitEvents` 更新父事件，不创建独立减伤事件。已有减伤移动时，控制器调用 `buildMovedMitEvents` 生成候选事件，并使用 strict 冷却校验保证移动结果合法；移动带有结束标记的减伤事件时，`endedBy.tMs` 按相同时间偏移移动。

拖拽中的预览位移和落点合法性校验使用 `requestAnimationFrame` 节流。拖拽结束时仍执行最终 strict 校验并只提交合法结果。

## 冷却限制层

`CooldownConstraintLayer` 使用 `buildConstraintSegments` 生成可视冷却区段。区段生成时，冷却范围会扣除同列减伤效果范围，因此减伤条本体覆盖的区域不重复绘制冷却遮罩。

共享冷却组会把冷却限制绘制到同组技能列。被释放技能自身列只显示不被效果条覆盖的冷却尾段。

`ResourceLaneLayer` 使用 store 中的资源状态区间绘制连续档数色带。资源列顶部按当前可见起点显示当前档数，即使最近一次档数变化不在屏幕内，仍显示该时刻资源状态。同屏内的档数变化点会显示变化后的档数，靠近顶部当前值时隐藏变化点档数以避免重叠。满档固定使用红色，非满档按 0 到 5 的档位色板显示。
