# 应用架构

本文档描述应用入口、组件组织、状态管理和主要交互流。

## 入口组件

`src/main.tsx` 挂载 React 应用。`src/App.tsx` 是主入口组件，负责组合全局 UI、绑定 dnd-kit 拖拽上下文、协调加载战斗、加载事件、主题切换、导出和 WebDAV 同步。

`App` 渲染以下主要组件：

- `AppHeader`：顶部输入栏和全局操作。
- `FightInfoBar`：战斗信息、队伍成员摘要和玩家组折叠操作。
- `SkillSidebar`：按队伍成员分组的可拖拽技能列表。
- `Timeline`：战斗时间轴。
- `PartyMemberSelectModal`：最多 8 个队伍成员的选择，支持添加真实玩家和空白职能。
- `ExportModal`：Souma 时间轴导出文本。
- `ProjectManagerModal`：工程槽位管理、工程导入和工程导出。
- `WebDavSyncModal`：WebDAV 设置、连接测试、全部槽位上传和下载。
- `DragOverlayLayer`：拖拽预览层。
- `TrashDropZone`：已存在减伤事件的删除投放区。
- `TopBannerStack`：顶部提示栈。

## 状态管理

全局状态位于 `src/store/index.ts`，由 Zustand 创建，并使用 `persist` 中间件保存部分字段。

状态包含以下类别：

- 输入状态：`apiKey`、`fflogsUrl`。
- 战斗状态：`fight`、`actors`、`bossIds`。
- 选择状态：`partyMembers`、`selectedJob`、`selectedPlayerId`、`selectedMitIds`。
- 事件状态：`damageEventMembers`、`damageEventsByPlayerId`、`castEvents`、`mitEvents`、`cooldownEvents`、`resourceEvents`。
- 工程状态：`projectSlots`、`activeProjectSlotId`。
- UI 状态：`banners`、`isLoading`、`isRendering`、`error`。

持久化字段包含 `apiKey`、当前工程状态、工程槽位、当前槽位 ID 和 WebDAV 设置。WebDAV 密码仅保存在当前浏览器的本地存储中，不写入远程同步存档。迁移逻辑为缺少 owner 信息的历史减伤事件补充当前选中玩家和职业作为 owner，并为历史单人选择生成一个队伍成员；旧版本没有槽位时，会基于当前状态生成默认槽位。

`src/store/selectors.ts` 提供面向入口组件和时间轴组件的 selector，减少组件直接读取的状态范围。

## 工程文档

工程文档类型位于 `src/model/project.ts`。工程导出文本使用 `XMC1:` 前缀，正文是 gzip 压缩后的 JSON，再经过 base64url 编码。编解码逻辑位于 `src/domain/project/projectCodec.ts`。

工程文档保存完整工作区快照，包括槽位名称、FFLogs URL、战斗元数据、队伍成员、Boss 咏唱事件、按玩家 ID 分组的受击事件、已排减伤事件和时间轴缩放。工程文档不保存 FFLogs API Key。

工程导入和槽位切换由 `src/domain/project/projectDocument.ts` 与 `src/store/index.ts` 协作完成。导入时会规范化文档结构，并通过 `evaluateMitigationSetStrict` 校验减伤事件和重建 `cooldownEvents` 与 `resourceEvents`。`cooldownEvents` 和 `resourceEvents` 是由 `mitEvents` 派生的运行时状态，不写入工程导出文本。

槽位的 `updatedAt` 表示有效内容最后一次变化的时间。槽位保存使用不含 `updatedAt` 的内容快照判断是否真正变化；页面恢复、生成导出或重复保存相同内容不会刷新时间。WebDAV 会话内的未上传编辑判断复用同一内容快照。

## WebDAV 同步

WebDAV 同步流程位于 `src/hooks/useWebDavSync.ts`，远程访问封装位于 `src/lib/webdav/client.ts`，归档规范化和 Hash 计算位于 `src/domain/sync/syncArchive.ts`。

用户指定的 WebDAV 目录下使用固定的 `xiv-mit-composer` 子目录，并在该子目录保存两个文件：

- `xiv-mit-composer/xiv-mit-composer.sync.json.gz`：gzip 压缩后的全部工程槽位和当前槽位 ID。
- `xiv-mit-composer/xiv-mit-composer.sync-meta.json`：同步版本、SHA-256 和上传时间。

SHA-256 根据规范化后的未压缩同步存档计算。上传时间位于独立校验文件中，不参与 Hash。工程导出与 WebDAV 同步复用 `src/utils/compression.ts` 的 gzip 实现。首次上传前通过 `MKCOL` 创建应用子目录，上传先写压缩同步存档，再写校验文件；下载会解压并重新计算远程存档 Hash，在校验通过后整体替换本地槽位。同步仅支持当前 gzip 格式，不读取旧版未压缩存档。

页面恢复完成后会读取远程 Hash。Hash 不同时打开下载覆盖确认，相同时不修改本地状态。`Ctrl+S` 执行上传检查。本次页面会话发生同步范围内的编辑、连接有效且尚未上传时，`beforeunload` 触发浏览器原生离开确认；成功上传或下载会清除该状态。

## 加载流程

`loadFightMetadata` 解析 FFLogs URL，读取报告元数据，生成 `Fight`、`Actor[]` 和当前战斗的 Boss ID 列表。

`loadEventsForPlayers` 加载队伍成员事件。函数调用 `loadEventsCore`，真实玩家用于加载友方咏唱并生成已有减伤事件，空白职能只生成可手动排轴的成员列。受击事件按当前战斗中所有可识别玩家加载，并按玩家 ID 分组保存。Boss 咏唱事件按当前战斗 Boss 加载。

战斗元数据请求和事件请求各自使用 request sequence 与 `AbortController`。新的同类请求会中止旧请求，旧请求完成后不会覆盖新状态。

## 减伤事件提交

`addMitEvent`、`updateMitEvent`、`removeMitEvent` 和 `setMitEvents` 通过 `commitMitigationSet` 写入状态。`commitMitigationSet` 使用 `evaluateMitigationSetStrict` 校验并重建冷却事件和资源状态区间。校验失败时，状态保持原值。

## 主题与提示

主题状态保存在 `App` 的本地 state 中，并通过 `getStoredTheme` 和 `setStoredTheme` 同步到浏览器本地存储。暗色主题通过给 `document.documentElement` 添加 `dark` class 生效。

顶部提示由 store 内的 `banners` 管理。提示具有默认关闭时间、关闭动画时间和最大展示数量。
