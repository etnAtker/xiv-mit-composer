import type { Skill } from '../../model/types';

export const SKILLS: Skill[] = [
    // 骑士 (PLD)
    { id: 'pld-rampart', name: '铁壁', cooldownSec: 90, durationSec: 20, job: 'PLD', color: 'bg-blue-500', actionId: 7531 },
    { id: 'pld-sentinel', name: '绝对防御', cooldownSec: 120, durationSec: 15, job: 'PLD', color: 'bg-blue-600', actionId: 17 },
    { id: 'pld-h-sheltron', name: '圣盾阵', cooldownSec: 5, durationSec: 8, job: 'PLD', color: 'bg-blue-400', actionId: 25746 },
    { id: 'pld-bulwark', name: '壁垒', cooldownSec: 90, durationSec: 10, job: 'PLD', color: 'bg-blue-700', actionId: 3540 },
    { id: 'pld-passage', name: '武装戍卫', cooldownSec: 120, durationSec: 18, job: 'PLD', color: 'bg-blue-800', actionId: 7385 },
    { id: 'pld-divine-veil', name: '圣光幕帘', cooldownSec: 90, durationSec: 30, job: 'PLD', color: 'bg-blue-900', actionId: 3540 },
    { id: 'pld-hallowed-ground', name: '神圣领域', cooldownSec: 420, durationSec: 10, job: 'PLD', color: 'bg-blue-950', actionId: 30 },

    // 战士 (WAR)
    { id: 'war-rampart', name: '铁壁', cooldownSec: 90, durationSec: 20, job: 'WAR', color: 'bg-red-500', actionId: 7531 },
    { id: 'war-vengeance', name: '复仇', cooldownSec: 120, durationSec: 15, job: 'WAR', color: 'bg-red-600', actionId: 44 },
    { id: 'war-bloodwhetting', name: '原初的血气', cooldownSec: 25, durationSec: 8, job: 'WAR', color: 'bg-red-400', actionId: 25751 },
    { id: 'war-thrill', name: '战栗', cooldownSec: 90, durationSec: 10, job: 'WAR', color: 'bg-red-700', actionId: 40 },
    { id: 'war-shake-it-off', name: '摆脱', cooldownSec: 90, durationSec: 15, job: 'WAR', color: 'bg-red-800', actionId: 7388 },
    { id: 'war-holmgang', name: '死斗', cooldownSec: 240, durationSec: 10, job: 'WAR', color: 'bg-red-900', actionId: 43 },

    // 暗黑骑士 (DRK)
    { id: 'drk-rampart', name: '铁壁', cooldownSec: 90, durationSec: 20, job: 'DRK', color: 'bg-purple-500', actionId: 7531 },
    { id: 'drk-shadow-wall', name: '暗影卫', cooldownSec: 120, durationSec: 15, job: 'DRK', color: 'bg-purple-600', actionId: 36927 },
    { id: 'drk-tbn', name: '至黑之夜', cooldownSec: 15, durationSec: 7, job: 'DRK', color: 'bg-purple-400', actionId: 7393 },
    { id: 'drk-oblation', name: '献奉', cooldownSec: 60, durationSec: 10, job: 'DRK', color: 'bg-purple-700', actionId: 25754 },
    { id: 'drk-dark-missionary', name: '暗黑布道', cooldownSec: 90, durationSec: 15, job: 'DRK', color: 'bg-purple-800', actionId: 16471 },
    { id: 'drk-living-dead', name: '行尸走肉', cooldownSec: 300, durationSec: 10, job: 'DRK', color: 'bg-purple-900', actionId: 3638 },

    // 绝枪战士 (GNB)
    { id: 'gnb-rampart', name: '铁壁', cooldownSec: 90, durationSec: 20, job: 'GNB', color: 'bg-orange-500', actionId: 7531 },
    { id: 'gnb-nebula', name: '大星云', cooldownSec: 120, durationSec: 15, job: 'GNB', color: 'bg-orange-600', actionId: 36935 },
    { id: 'gnb-hoc', name: '刚玉之心', cooldownSec: 25, durationSec: 8, job: 'GNB', color: 'bg-orange-400', actionId: 25758 },
    { id: 'gnb-camouflage', name: '伪装', cooldownSec: 90, durationSec: 20, job: 'GNB', color: 'bg-orange-700', actionId: 16140 },
    { id: 'gnb-heart-of-light', name: '光之心', cooldownSec: 90, durationSec: 15, job: 'GNB', color: 'bg-orange-800', actionId: 16160 },
    { id: 'gnb-superbolide', name: '超火流星', cooldownSec: 360, durationSec: 10, job: 'GNB', color: 'bg-orange-900', actionId: 16152 },
];
