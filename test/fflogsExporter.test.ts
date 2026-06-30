import test from 'node:test';
import assert from 'node:assert/strict';

import { FFLogsExporter } from '../src/lib/fflogs/exporter';

test('友方事件启用 TTS 时优先使用自定义 tts 文本', () => {
  const timeline = FFLogsExporter.generateTimeline(
    [
      {
        time: 12.3,
        actionName: '雪仇',
        actionId: 7535,
        tts: '雪仇好了',
        type: 'cast',
        isFriendly: true,
      },
    ],
    true,
  );

  assert.equal(timeline, '12.3 "<雪仇>~" tts "雪仇好了"');
});

test('友方事件没有自定义 tts 时回退到技能名称', () => {
  const timeline = FFLogsExporter.generateTimeline(
    [
      {
        time: 15,
        actionName: '铁壁',
        actionId: 7531,
        type: 'cast',
        isFriendly: true,
      },
    ],
    true,
  );

  assert.equal(timeline, '15 "<铁壁>~" tts "铁壁"');
});
