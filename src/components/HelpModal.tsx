interface Props {
  isOpen: boolean;
  onClose: () => void;
}

const USAGE_SECTIONS = [
  {
    title: '加载数据',
    items: [
      '需要一个有效的 FFLogs API Key (V1)。',
      '输入 FFLogs 报告 URL，例如 https://cn.fflogs.com/reports/...?...fight=...。',
      'URL 中缺少 fight 参数时，应用使用报告中的最后一场战斗。',
      '点击“加载战斗”。',
    ],
  },
  {
    title: '选择队伍',
    items: [
      '加载元数据后，在玩家选择窗口中选择最多 8 个成员。',
      '可以添加报告中的真实玩家，也可以添加一个空白职能用于手动排轴。',
      '可以调整队伍顺序；顺序会影响时间轴中的玩家分组排列。',
    ],
  },
  {
    title: '排轴操作',
    items: [
      '添加减伤：从左侧技能栏将减伤技能拖拽到右侧时间轴上。',
      '调整位置：拖拽已有减伤条以调整释放时间。多选状态下拖拽其中一个减伤条会整体移动选中项。',
      '编辑事件：右键单击减伤条可以编辑时间或删除事件。',
      '选择与删除：在时间轴中框选减伤条，按 Delete 或 Backspace 删除选中项；也可以把已有减伤拖入删除区。',
      '持续结束：将持续结束型技能拖入同一玩家的父技能持续窗口，会生成结束标记并缩短父技能持续时间。',
      '结束标记：拖拽结束标记可以调整结束时间；右键可以编辑事件或删除结束标记。编辑弹窗中清空结束时间会恢复完整持续时间。',
      '缩放视图：按住 Alt + 滚轮缩放时间轴，也可以使用时间轴工具栏调整 px/s。',
      '折叠分组：战斗信息栏提供全部展开、全部折叠和调整队伍入口。',
      '资源档数：启用资源显示的共享冷却组会在对应玩家技能组内显示档数色带、资源短标签和层数变化。',
      '冷却标识：黄色区间表示当前技能不可用，灰色区间表示技能冷却占用，冲突技能投影用于提示同一时间附近的互斥或冲突排布。',
    ],
  },
  {
    title: '工程导入导出',
    items: [
      '点击“导入/导出”打开工程管理弹窗。',
      '当前工程会自动保存到浏览器本地槽位。',
      '可以新建、复制、重命名、删除和切换槽位。',
      '可以生成 XMC1: 开头的工程文本，复制或下载为 .xmc 文件。',
      '导入工程文本或 .xmc 文件会创建一个新槽位并切换到该槽位。',
    ],
  },
  {
    title: '导出 Souma 时间轴',
    items: [
      '点击“导出 Souma 时间轴”打开导出弹窗。',
      '选择要导出的玩家。',
      '按需勾选“生成TTS”。',
      '带有结束标记的减伤事件会同时导出开始技能和结束技能时间点。',
      '复制生成的 JSON，并粘贴到 Souma / ff14-overlay-vue 的时间轴设置文件中。',
    ],
  },
];

export function HelpModal({ isOpen, onClose }: Props) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
      <div
        className="flex h-[82vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-app bg-surface-2 shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
      >
        <div className="flex items-center justify-between border-b border-app bg-surface-3 p-4">
          <div>
            <h3 className="text-lg font-bold text-app" id="help-modal-title">
              帮助
            </h3>
            <div className="mt-1 text-xs text-muted">FFXIV Mitigation Composer 使用说明</div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-lg text-muted transition-colors hover:bg-surface-4 hover:text-app"
            aria-label="关闭"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-6 custom-scrollbar">
          <div className="space-y-6">
            {USAGE_SECTIONS.map((section, index) => (
              <section key={section.title}>
                <h4 className="text-sm font-semibold text-app">
                  {index + 1}. {section.title}
                </h4>
                <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm leading-6 text-muted">
                  {section.items.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
