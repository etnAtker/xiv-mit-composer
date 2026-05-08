# 产品使用说明

本文档描述应用当前的用户可见能力和操作流程。

## 页面结构

应用首屏由顶部输入栏、战斗信息栏、技能侧栏、时间轴区域、加载弹窗、导出弹窗、顶部提示和删除投放区组成。

顶部输入栏包含 FFLogs API Key 输入框、FFLogs URL 输入框、加载战斗按钮、导出 Souma 时间轴按钮、亮色/暗色主题切换按钮和 GitHub 链接。API Key 和 FFLogs URL 通过 Zustand persist 存储到浏览器本地存储。

战斗信息栏在战斗元数据加载后显示。信息栏展示战斗名称、战斗时长、职业选择和玩家选择。

技能侧栏展示当前选择职业的可用技能。双坦模式下，技能侧栏按已选择职业分组展示技能。

时间轴区域纵向展示战斗时间。时间轴包含时间标尺、Boss 咏唱列、受击列、减伤列和冷却限制层。

## 加载战斗

用户在顶部输入栏填写 FFLogs API Key 和 FFLogs URL 后点击“加载战斗”。应用打开加载战斗选项弹窗，用户选择默认加载或加载实际双坦克。

默认加载模式加载当前选择玩家的事件。加载实际双坦克模式自动识别报告中参与当前战斗的坦克玩家，并取前两名坦克作为双坦排轴对象。

FFLogs URL 由 `src/utils.ts` 中的 `parseFFLogsUrl` 解析。URL 中的 report code 来自 `/reports/` 后的字母数字串。URL 中缺少 `fight` 查询参数时，应用使用报告中的最后一场战斗。

## 职业与玩家选择

当前战斗信息栏暴露的职业按钮为 `PLD`、`WAR`、`DRK`、`GNB`。单坦模式一次选择一个职业和一个玩家。双坦模式最多选择两个坦克职业，并为每个职业选择一个玩家。

玩家下拉列表按职业过滤 FFLogs friendlies。过滤规则位于 `src/components/FightInfoBar.tsx` 的 `jobTypeMap`。

## 排轴操作

用户从技能侧栏拖拽技能到时间轴减伤 lane。拖拽落点通过像素位置和当前缩放比例转换为毫秒时间。新减伤事件由 `src/domain/drag/mitigationDrag.ts` 的 `buildMitEventFromSkill` 构建。

已存在的减伤条支持拖拽移动。选中多个减伤条后拖拽其中一个条目，应用按相同时间偏移整体移动选中项。移动结果通过 strict 冷却校验后写入状态。

已存在的减伤条支持拖拽到删除投放区。选中多个减伤条时，删除投放区删除全部选中项。

时间轴支持框选减伤条。选中减伤条后，用户按 `Delete` 或 `Backspace` 删除选中项。

单个选中减伤条支持右键菜单。右键菜单提供编辑事件和删除操作。

## 缩放与滚动

时间轴以纵向滚动展示战斗时间。用户按住 `Alt` 并滚动鼠标滚轮调整缩放。缩放状态保存在 `src/App.tsx` 的本地 React state 中。

## 导出 Souma 时间轴

导出按钮在已加载战斗且存在 Boss 咏唱事件时启用。导出内容由 Boss 咏唱事件和当前减伤事件合并生成，按时间排序。

导出弹窗展示 JSON 文本。JSON 包含 `name`、`condition`、`timeline`、`source` 和 `createdAt`。`condition` 包含当前职业、FFLogs zoneID 和 FFLogs boss ID。用户勾选“生成TTS”后，玩家减伤事件导出为包含 tts 的时间轴行。

导出逻辑位于 `src/App.tsx` 和 `src/lib/fflogs/exporter.ts`。
