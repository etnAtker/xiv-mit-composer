# 应用架构

本文档描述应用入口、组件组织、状态管理和主要交互流。

## 入口组件

`src/main.tsx` 挂载 React 应用。`src/App.tsx` 是主入口组件，负责组合全局 UI、绑定 dnd-kit 拖拽上下文、协调加载战斗、加载事件、主题切换和导出。

`App` 渲染以下主要组件：

- `AppHeader`：顶部输入栏和全局操作。
- `FightInfoBar`：战斗信息、职业选择和玩家选择。
- `SkillSidebar`：当前职业的可拖拽技能列表。
- `Timeline`：战斗时间轴。
- `LoadFightModal`：加载模式选择。
- `ExportModal`：Souma 时间轴导出文本。
- `DragOverlayLayer`：拖拽预览层。
- `TrashDropZone`：已存在减伤事件的删除投放区。
- `TopBannerStack`：顶部提示栈。

## 状态管理

全局状态位于 `src/store/index.ts`，由 Zustand 创建，并使用 `persist` 中间件保存部分字段。

状态包含以下类别：

- 输入状态：`apiKey`、`fflogsUrl`。
- 战斗状态：`fight`、`actors`、`bossIds`。
- 选择状态：`selectedJob`、`selectedPlayerId`、`selectedMitIds`。
- 事件状态：`damageEvents`、`damageEventsByJob`、`castEvents`、`mitEvents`、`cooldownEvents`。
- UI 状态：`banners`、`isLoading`、`isRendering`、`error`。

持久化字段包含 `apiKey`、`fflogsUrl`、`selectedJob`、`selectedPlayerId` 和 `mitEvents`。迁移逻辑为缺少 owner 信息的历史减伤事件补充当前选中玩家和职业作为 owner。

`src/store/selectors.ts` 提供面向入口组件和时间轴组件的 selector，减少组件直接读取的状态范围。

## 加载流程

`loadFightMetadata` 解析 FFLogs URL，读取报告元数据，生成 `Fight`、`Actor[]` 和当前战斗的 Boss ID 列表。

`loadEvents` 加载单个玩家的事件。`loadEventsForPlayers` 加载多个玩家的事件。两者共同调用 `loadEventsCore`，并生成伤害事件、按职业分组的伤害事件、Boss 咏唱事件、玩家减伤事件和冷却事件。

战斗元数据请求和事件请求各自使用 request sequence 与 `AbortController`。新的同类请求会中止旧请求，旧请求完成后不会覆盖新状态。

## 减伤事件提交

`addMitEvent`、`updateMitEvent`、`removeMitEvent` 和 `setMitEvents` 通过 `commitMitigationSet` 写入状态。`commitMitigationSet` 使用 `evaluateMitigationSetStrict` 校验并重建冷却事件。校验失败时，状态保持原值。

## 主题与提示

主题状态保存在 `App` 的本地 state 中，并通过 `getStoredTheme` 和 `setStoredTheme` 同步到浏览器本地存储。暗色主题通过给 `document.documentElement` 添加 `dark` class 生效。

顶部提示由 store 内的 `banners` 管理。提示具有默认关闭时间、关闭动画时间和最大展示数量。
