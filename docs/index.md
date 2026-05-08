# 文档索引

本文档是 `docs/` 目录的入口，说明项目架构、文档分层和维护规约。

## 整体架构

XIV Mitigation Composer 是一个基于 React、TypeScript、Vite、Tailwind CSS、Zustand 和 dnd-kit 的单页应用。应用通过 FFLogs V1 API 加载战斗报告，解析战斗、玩家、敌方咏唱、玩家减伤和受击事件，在纵向时间轴中展示事件，并支持把排好的减伤事件导出为 Souma 时间轴 JSON。

应用入口位于 `src/App.tsx`。入口组件组合顶部输入栏、战斗信息栏、技能侧栏、时间轴、加载弹窗、导出弹窗、拖拽层、删除投放区和顶部提示。全局状态位于 `src/store/index.ts`，负责保存 FFLogs 输入、战斗元数据、玩家选择、减伤事件、冷却事件、伤害事件、咏唱事件、加载状态和提示信息。

领域逻辑分布在 `src/domain/`、`src/lib/fflogs/`、`src/utils/` 和 `src/data/skills/`。`src/lib/fflogs/` 负责 FFLogs API 请求、事件转换和 Souma 时间轴导出；`src/domain/fflogs/` 负责把 FFLogs 事件转换为应用模型；`src/domain/drag/` 负责减伤拖拽的业务校验；`src/utils/playerCast.ts` 负责冷却状态构建和合法性判断；`src/data/skills/` 负责技能、职业和共享冷却组数据。

## 文档结构

- [产品使用说明](product/usage.md)：描述当前界面、加载流程、排轴流程和导出流程。
- [应用架构](architecture/application.md)：描述入口组件、状态管理、持久化状态和主要交互流。
- [FFLogs 数据流](architecture/fflogs.md)：描述报告加载、事件获取、事件转换和 Souma 时间轴导出。
- [时间轴架构](architecture/timeline.md)：描述时间轴布局、滚动缩放、事件层、选择和编辑。
- [技能与冷却](architecture/skills-and-cooldowns.md)：描述技能数据、职业过滤、owner 作用域、共享冷却组和冷却校验。
- [测试与资产](development/testing-and-assets.md)：描述开发命令、测试覆盖和 XIV 图标资源脚本。
- `todos/`：存放待实现功能、重构或调研事项的设计文档和实施计划。

## 文档规约

- 文档描述代码的当前状态，不描述历史变化，不使用“从 xxx 变更为 xxx”这类表述。
- 文档使用确定性描述，不使用“xxx 可以为 xxx”这类不确定描述表达当前行为。
- 代码变更必须同步更新相关文档，确保文档与代码保持一致。
- 单个文档文件保持聚焦和适中长度，跨模块内容拆分到不同文档。
- 文档允许按层级组织，一个模块对应一个文件夹或一组文件。
- 文档中的路径使用仓库相对路径，便于在本仓库中定位源码。
- 产品文档描述用户可见能力和操作流程，实现文档描述工程结构、数据流和关键约束。
- 待实现内容写入 `docs/todos/`，不写入正式产品或架构文档作为当前行为。
- `docs/todos/` 中的内容实现后，删除待实现文档中的已实现部分，并把已实现行为补充到对应正式文档中。
