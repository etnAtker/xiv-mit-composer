# AGENTS.md

本文档适用于本仓库内的 Code Agent 协作。

## 项目环境

- 本项目使用 `bun` 管理依赖、运行脚本与执行开发任务。
- 常用命令：
  - 安装依赖：`bun install`
  - 启动开发服务器：`bun run dev`
  - 构建项目：`bun run build`
  - 运行 ESLint：`bun run lint`
  - 运行测试：`bun test`
  - 获取 XIV 图标资源：`bun run fetch:icons`

## 代码风格

- 注释应使用中文；专有名词、API 名称、框架名等可以保留英文以便通用理解。
- 注释只用于说明代码目的或必要背景，不应包含注释掉的代码、猜测性内容或思考性文本。
- 新代码应尽量延续现有命名、结构与实现风格。
- 实现需求后，应至少使用 ESLint 和构建命令验证语法与类型问题：
  - `bun run lint`
  - `bun run build`

## 提交规范

- Commit Message 使用 Conventional Commits 格式，例如：
  - `fix: 修复时间轴拖拽偏移问题`
  - `feat: 新增减伤轴导出能力`
  - `docs: 整理 Agent 协作规则`
- 提交类型需要贴切表示变更性质，常见类型包括：
  - `feat`
  - `fix`
  - `docs`
  - `style`
  - `refactor`
  - `chore`
  - `ci`
- 提交描述内容使用中文。
- 如果一次提交修改了多个文件，应在 commit 详情中列举主要变更点。
