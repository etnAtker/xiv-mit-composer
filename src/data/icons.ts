import type { Job } from '../model/types';

export const ICON_BASE_PATH = '/xiv-icons';

export const getSkillIconLocalSrc = (actionId: number) =>
  `${ICON_BASE_PATH}/actions/${actionId}.png`;

export const JOB_ICON_LOCAL_SRC: Record<Job, string> = {
  PLD: `${ICON_BASE_PATH}/jobs/PLD.png`,
  WAR: `${ICON_BASE_PATH}/jobs/WAR.png`,
  DRK: `${ICON_BASE_PATH}/jobs/DRK.png`,
  GNB: `${ICON_BASE_PATH}/jobs/GNB.png`,
  WHM: `${ICON_BASE_PATH}/jobs/WHM.png`,
  SCH: `${ICON_BASE_PATH}/jobs/SCH.png`,
  AST: `${ICON_BASE_PATH}/jobs/AST.png`,
  SGE: `${ICON_BASE_PATH}/jobs/SGE.png`,
  MNK: `${ICON_BASE_PATH}/jobs/MNK.png`,
  DRG: `${ICON_BASE_PATH}/jobs/DRG.png`,
  NIN: `${ICON_BASE_PATH}/jobs/NIN.png`,
  SAM: `${ICON_BASE_PATH}/jobs/SAM.png`,
  RPR: `${ICON_BASE_PATH}/jobs/RPR.png`,
  VPR: `${ICON_BASE_PATH}/jobs/VPR.png`,
  BRD: `${ICON_BASE_PATH}/jobs/BRD.png`,
  MCH: `${ICON_BASE_PATH}/jobs/MCH.png`,
  DNC: `${ICON_BASE_PATH}/jobs/DNC.png`,
  BLM: `${ICON_BASE_PATH}/jobs/BLM.png`,
  SMN: `${ICON_BASE_PATH}/jobs/SMN.png`,
  RDM: `${ICON_BASE_PATH}/jobs/RDM.png`,
  PCT: `${ICON_BASE_PATH}/jobs/PCT.png`,
};
