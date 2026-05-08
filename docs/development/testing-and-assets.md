# 测试与资产

本文档描述开发命令、测试范围和 XIV 图标资源脚本。

## 命令

项目使用 `bun` 管理依赖、运行脚本和执行测试。

常用命令：

```bash
bun install
bun run dev
bun run lint
bun run build
bun test
bun run fetch:icons
bun run fetch:skills -- SGE
```

`bun run dev` 启动 Vite 开发服务器。`bun run build` 先执行 TypeScript build，再执行 Vite production build。`bun run lint` 使用 ESLint 检查仓库。`bun test` 运行 `test/` 下的 Node test。

## 测试范围

测试文件位于 `test/`。

- `test/playerCast.test.ts` 覆盖冷却构建、共享冷却组、充能恢复、owner 隔离、strict/tolerant 模式和插入校验。
- `test/mitigationDrag.test.ts` 覆盖拖拽时间换算、移动范围、删除范围、新事件构建、新技能投放和已有减伤移动。
- `test/mitigationBarUtils.test.ts` 覆盖减伤条高度计算。
- `test/mitigationColumnUtils.test.ts` 覆盖 role 技能在双职业布局下的列 key 分发。
- `test/cooldownConstraintUtils.test.ts` 覆盖冷却限制层可视区段和共享资源兄弟技能列绘制。

## 图标资源

`scripts/fetch-xiv-icons.ts` 从 XIVAPI V2 下载职业图标和技能图标。输出目录为 `public/xiv-icons/`。

职业图标写入 `public/xiv-icons/jobs/{JOB}.png`。技能图标写入 `public/xiv-icons/actions/{actionId}.png`。

脚本从 `src/data/skills/index.ts` 导入 `SKILLS`，按技能 action ID 获取 Action 图标路径，再通过 XIVAPI asset 接口下载 PNG。职业图标通过 ClassJob 表解析职业 ID 后下载。

图标下载使用有限并发和请求节流。默认并发度为 6，默认请求速率为 12 req/sec。可通过环境变量调整：

```bash
XIV_ICON_FETCH_CONCURRENCY=8 XIV_ICON_FETCH_RPS=16 bun run fetch:icons
```

`XIV_ICON_FETCH_RPS` 建议不超过 XIVAPI 公开的 20 req/sec 限制。

图标读取路径定义在 `src/data/icons.ts`。技能图标通过 `getSkillIconLocalSrc(actionId)` 生成路径，职业图标通过 `JOB_ICON_LOCAL_SRC` 读取。

## 技能候选数据

`scripts/fetch-xiv-job-skills.ts` 从 `https://xivapi-v2.xivcdn.com/` 的 boilmaster 实例读取指定职业可用的 Action，并整理为 `src/data/skills/` 使用的 `Skill[]` 候选格式。脚本默认写入 `tmp/{job-lower}-skills.ts`，该目录只用于手动挑拣，不作为正式技能数据入口。

常用命令：

```bash
bun run fetch:skills -- SGE
bun run fetch:skills -- WHM --missing-only
bun run fetch:skills -- PLD --out tmp/pld-actions.ts
```

脚本会输出 ActionCategory、等级、可用职业、目标类型、XIVAPI 冷却组、`Maximum Charges`、不可叠加提示、中文描述和英文描述。候选技能的 `name` 字段使用简体中文，`name_en`、`name_jp`、`name_fr` 和 `name_de` 使用对应语言字段。持续时间、层数和不可叠加提示仍根据英文描述解析，避免中文文案格式差异影响结构化字段。

带有 `Maximum Charges` 的技能会在输出文件顶部生成 `COOLDOWN_GROUP` 候选注释，并在技能候选中写入建议的 `cooldownGroup`。该建议用于辅助处理可叠层技能，正式迁移时仍需结合现有共享冷却组语义人工确认。

boilmaster 实例不提供 `/api/asset`，图标资源仍由 `scripts/fetch-xiv-icons.ts` 通过官方 XIVAPI V2 asset 接口下载。

## 校验要求

代码变更后执行以下命令：

```bash
bun run lint
bun run build
```

涉及冷却、拖拽、时间轴布局或工具函数时执行：

```bash
bun test
```

文档变更需要检查链接、路径和描述是否与当前代码一致。
