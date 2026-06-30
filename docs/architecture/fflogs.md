# FFLogs 数据流

本文档描述 FFLogs API 请求、事件转换和 Souma 时间轴导出。

## API 客户端

`src/lib/fflogs/client.ts` 定义 `FFLogsClient`。客户端使用 `https://cn.fflogs.com/v1` 作为 API 基础地址。

`fetchReport` 请求 `/report/fights/{reportCode}`，返回报告中的战斗、友方单位和敌方单位等元数据。

`fetchEvents` 请求 `/report/events/{type}/{reportCode}`，支持 `damage-taken` 和 `casts` 两类事件。方法传入 `sourceid`、`start`、`end` 和 `api_key` 参数。咏唱事件按 `hostility` 区分敌方和友方。分页通过 `nextPageTimestamp` 递归拉取，直到没有下一页或下一页时间达到战斗结束时间。

## 报告元数据

`loadFightMetadata` 使用 `parseFFLogsUrl` 获取 report code 和 fight ID。fight ID 为 `last` 时，应用选择报告中的最后一场战斗。

应用将 FFLogs fight 转换为 `Fight` 模型，字段包含 `id`、`start`、`end`、`durationMs`、`name`、`zoneID` 和 `fflogsBoss`。

应用从 `report.friendlies` 中保留参与当前战斗的玩家，排除 `LimitBreak` 和 `Environment`。应用从 `report.enemies` 中收集参与当前战斗且类型为 `Boss` 的敌方 ID。

## 事件加载

`loadEventsCore` 并行加载三类事件：

- 友方玩家咏唱事件：每个已添加的真实玩家请求一次 `casts`，并按该玩家职业可用技能过滤。空白职能不请求友方咏唱。
- 敌方 Boss 咏唱事件：每个 Boss 请求一次 `casts`。
- 玩家受击事件：当前战斗中每个可识别玩家请求一次 `damage-taken`，不受是否添加到减伤轴影响。

友方事件通过 `FFLogsProcessor.processFriendlyEvents` 转换为轻量事件。转换过程只保留 `cast` 和 `begincast`，并只保留技能表内的 action ID。

敌方事件通过 `FFLogsProcessor.processEnemyEvents` 转换为轻量事件。转换过程保留全部敌方 `cast` 和 `begincast`，导出阶段再根据规则处理同步行和注释行。

## 应用模型转换

`src/domain/fflogs/buildCastEvents.ts` 把敌方咏唱事件转换为 `CastEvent[]`。事件时间以战斗开始时间为基准转换为 `tMs`。

`src/domain/fflogs/buildMitEvents.ts` 把友方技能事件转换为 `MitEvent[]`。转换过程根据 action ID 查找技能定义，并按技能持续时间计算 `tStartMs`、`durationMs` 和 `tEndMs`。持续结束型友方事件会合并到同一玩家最近的父技能事件中，写入父事件的 `endedBy` 并缩短 `durationMs` 与 `tEndMs`；没有可匹配父技能的持续结束型事件不会生成独立 `MitEvent`。允许自结束的技能首次释放生成普通 `MitEvent`，持续窗口内再次释放会结束前一个同技能事件。

`src/domain/fflogs/mergeDamageEvents.ts` 合并 FFLogs 的 `calculateddamage` 和普通伤害事件。具有相同 `packetID` 的计算伤害和普通伤害合并为 `damage-combined`。无法配对的计算伤害名称加 `?` 前缀，无法配对的普通伤害名称加 `*` 前缀。

`src/domain/fflogs/buildDamageEventsByPlayerId.ts` 按玩家 ID 保存受击事件。该结构保留重复职业玩家的独立承伤数据。

`src/domain/fflogs/groupDamageEvents.ts` 从按玩家 ID 保存的受击事件生成全局受击组。合并条件为相同 `ability.guid` 且组基准时间差小于 100ms。受击组显示时间使用组内最早时间，显示伤害使用组内最大 `unmitigatedAmount`，hover 明细包含命中玩家、职业、伤害和时间偏移。

## Souma 时间轴导出

导出入口位于 `src/App.tsx`。应用把 `castEvents` 和当前导出玩家的 `mitEvents` 合并成导出事件，并按秒级时间排序。导出弹窗通过单选下拉框切换导出玩家，切换后重新生成 JSON 内容。

`src/lib/fflogs/exporter.ts` 的 `FFLogsExporter.generateTimeline` 生成 Souma 时间轴文本。玩家减伤事件导出为普通提示行。带有 `endedBy` 的减伤事件会在结束时间额外导出结束技能的友方提示行。启用 TTS 时，玩家减伤事件额外包含 tts 文本；技能定义存在 `tts` 字段时使用该字段，否则使用技能名称。

Boss 事件通过 `src/lib/fflogs/compat/timelineSpecialRules.ts` 查找同步规则。有规则的 Boss 事件导出为带 `StartsUsing` 或 `Ability` 正则条件的同步行。没有规则的通用攻击和未匹配事件导出为注释行。

最终导出的 JSON 包含战斗名称、职业条件、zoneID、FFLogs boss ID、时间轴文本、来源和创建时间。职业条件使用当前导出玩家职业，玩家减伤事件的来源 ID 使用 `MitEvent.ownerId`。
