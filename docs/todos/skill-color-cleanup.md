# 技能颜色字段清理

## 背景

`Skill.color` 当前仍被时间轴减伤条、拖拽预览和对位投影读取，但技能栏卡片使用统一蓝色样式，用户可见的技能颜色辨识度较低。

## 待确认方向

- 若界面需要按技能或职业强化辨识度，技能栏、时间轴减伤条和投影层应统一使用同一套颜色来源。
- 若界面保持统一配色，移除 `Skill.color` 字段，并把时间轴相关组件改为固定样式或按职业派生样式。

## 清理范围

- `src/model/types.ts` 的 `Skill.color` 字段。
- `src/data/skills/` 内所有技能定义的 `color` 属性。
- `src/components/Timeline/` 中依赖技能颜色的减伤条、拖拽预览和对位投影样式。
- `scripts/fetch-xiv-job-skills.ts` 中读取和生成 `color` 的逻辑。
- 相关测试与文档。
