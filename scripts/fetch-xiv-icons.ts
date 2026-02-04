import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SKILLS } from '../src/data/skills/index';
import type { Job } from '../src/model/types';

const XIVAPI_V2_BASE_URL = 'https://v2.xivapi.com/api';
const OUTPUT_DIR = join(process.cwd(), 'public', 'xiv-icons');
const ACTION_DIR = join(OUTPUT_DIR, 'actions');
const JOB_DIR = join(OUTPUT_DIR, 'jobs');

const JOB_ICON_ID_BASE = 62100;
const JOB_ICON_GROUP = '062000';

const JOBS: Job[] = [
  'PLD',
  'WAR',
  'DRK',
  'GNB',
  'WHM',
  'SCH',
  'AST',
  'SGE',
  'MNK',
  'DRG',
  'NIN',
  'SAM',
  'RPR',
  'VPR',
  'BRD',
  'MCH',
  'DNC',
  'BLM',
  'SMN',
  'RDM',
  'PCT',
];

const JOB_SET = new Set<Job>(JOBS);

class HttpError extends Error {
  status: number;
  url: string;

  constructor(status: number, url: string) {
    super(`HTTP ${status}: ${url}`);
    this.status = status;
    this.url = url;
  }
}

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new HttpError(res.status, url);
  }
  return res.json();
};

const fetchBinary = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new HttpError(res.status, url);
  }
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
};

const resolveActionIconTexPath = async (actionId: number) => {
  const data = await fetchJson<{ fields?: { Icon?: { path?: string } } }>(
    `${XIVAPI_V2_BASE_URL}/sheet/Action/${actionId}?fields=Icon`,
  );
  return data?.fields?.Icon?.path;
};

const downloadIcon = async (url: string, outputPath: string) => {
  const data = await fetchBinary(url);
  await writeFile(outputPath, data);
};

const resolveClassJobIdMap = async (): Promise<Partial<Record<Job, number>>> => {
  const data = await fetchJson<{
    rows?: { row_id?: number; fields?: { Abbreviation?: string } }[];
  }>(`${XIVAPI_V2_BASE_URL}/sheet/ClassJob?limit=200&fields=Abbreviation`);
  const map: Partial<Record<Job, number>> = {};
  (data?.rows ?? []).forEach((row) => {
    const job = row?.fields?.Abbreviation as Job | undefined;
    const id = row?.row_id;
    if (!job || !JOB_SET.has(job) || !id) return;
    map[job] = id;
  });
  return map;
};

const downloadTexAsPng = async (texPath: string, outputPath: string) => {
  await downloadIcon(
    `${XIVAPI_V2_BASE_URL}/asset?path=${encodeURIComponent(texPath)}&format=png`,
    outputPath,
  );
};

const run = async () => {
  await mkdir(ACTION_DIR, { recursive: true });
  await mkdir(JOB_DIR, { recursive: true });

  const classJobIdMap = await resolveClassJobIdMap();

  for (const job of JOBS) {
    const outputPath = join(JOB_DIR, `${job}.png`);
    const classJobId = classJobIdMap[job];
    if (!classJobId) {
      throw new Error(`ClassJob missing: ${job}`);
    }

    const iconId = JOB_ICON_ID_BASE + classJobId;
    const iconName = String(iconId).padStart(6, '0');
    await downloadTexAsPng(`ui/icon/${JOB_ICON_GROUP}/${iconName}.tex`, outputPath);
  }

  for (const skill of SKILLS) {
    if (!skill.actionId) continue;
    const iconTexPath = await resolveActionIconTexPath(skill.actionId);
    if (!iconTexPath) {
      throw new Error(`Action icon missing: ${skill.name} (${skill.actionId})`);
    }
    await downloadTexAsPng(iconTexPath, join(ACTION_DIR, `${skill.actionId}.png`));
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
