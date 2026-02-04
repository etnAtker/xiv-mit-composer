import type { Job } from '../model/types';

export const ICON_BASE_PATH = 'xiv-icons';

export const getSkillIconLocalSrc = (actionId?: number | null) =>
  actionId ? `${ICON_BASE_PATH}/actions/${actionId}.png` : '';

export const JOB_ICON_LOCAL_SRC: Record<Job, string> = {
  PLD: `${ICON_BASE_PATH}/jobs/PLD.png`,
  WAR: `${ICON_BASE_PATH}/jobs/WAR.png`,
  DRK: `${ICON_BASE_PATH}/jobs/DRK.png`,
  GNB: `${ICON_BASE_PATH}/jobs/GNB.png`,
};
