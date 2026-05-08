import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { SKILLS } from '../src/data/skills/index';
import type { Job } from '../src/model/types';

const XIVAPI_V2_BASE_URL = 'https://v2.xivapi.com/api';
const OUTPUT_DIR = join(process.cwd(), 'public', 'xiv-icons');
const ACTION_DIR = join(OUTPUT_DIR, 'actions');
const JOB_DIR = join(OUTPUT_DIR, 'jobs');

const JOB_ICON_ID_BASE = 62100;
const JOB_ICON_GROUP = '062000';
const DEFAULT_CONCURRENCY = 6;
const DEFAULT_REQUESTS_PER_SECOND = 12;

const parsePositiveIntegerEnv = (name: string, fallback: number) => {
  const value = process.env[name];
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
};

const CONCURRENCY = parsePositiveIntegerEnv('XIV_ICON_FETCH_CONCURRENCY', DEFAULT_CONCURRENCY);
const REQUESTS_PER_SECOND = parsePositiveIntegerEnv(
  'XIV_ICON_FETCH_RPS',
  DEFAULT_REQUESTS_PER_SECOND,
);

const REQUEST_INTERVAL_MS = Math.ceil(1000 / REQUESTS_PER_SECOND);

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

let nextRequestAt = 0;

const waitForRequestSlot = async () => {
  const now = Date.now();
  const waitMs = Math.max(0, nextRequestAt - now);
  nextRequestAt = Math.max(now, nextRequestAt) + REQUEST_INTERVAL_MS;
  if (waitMs > 0) {
    await sleep(waitMs);
  }
};

const runWithConcurrency = async <T>(
  items: T[],
  concurrency: number,
  handler: (item: T) => Promise<void>,
) => {
  let nextIndex = 0;

  const workerCount = Math.min(concurrency, items.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (nextIndex < items.length) {
      const item = items[nextIndex];
      nextIndex += 1;
      await handler(item);
    }
  });

  await Promise.all(workers);
};

const fetchJson = async <T>(url: string): Promise<T> => {
  await waitForRequestSlot();
  const res = await fetch(url);
  if (!res.ok) {
    throw new HttpError(res.status, url);
  }
  return (await res.json()) as T;
};

const fetchBinary = async (url: string) => {
  await waitForRequestSlot();
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

const logProgress = (label: string, index: number, total: number, detail: string) => {
  const percent = Math.round((index / total) * 100);
  console.log(`[${label}] ${index}/${total} (${percent}%) ${detail}`);
};

const run = async () => {
  console.log('Preparing output directories...');
  await mkdir(ACTION_DIR, { recursive: true });
  await mkdir(JOB_DIR, { recursive: true });
  console.log(`Using concurrency=${CONCURRENCY}, requestsPerSecond=${REQUESTS_PER_SECOND}`);

  console.log('Resolving ClassJob ids...');
  const classJobIdMap = await resolveClassJobIdMap();

  let completedJobs = 0;
  await runWithConcurrency(JOBS, CONCURRENCY, async (job) => {
    const outputPath = join(JOB_DIR, `${job}.png`);
    const classJobId = classJobIdMap[job];
    if (!classJobId) {
      throw new Error(`ClassJob missing: ${job}`);
    }

    const iconId = JOB_ICON_ID_BASE + classJobId;
    const iconName = String(iconId).padStart(6, '0');
    await downloadTexAsPng(`ui/icon/${JOB_ICON_GROUP}/${iconName}.tex`, outputPath);
    completedJobs += 1;
    logProgress('Job', completedJobs, JOBS.length, job);
  });

  const skillsWithAction = SKILLS.filter((skill) => skill.actionId);
  let completedActions = 0;
  await runWithConcurrency(skillsWithAction, CONCURRENCY, async (skill) => {
    const iconTexPath = await resolveActionIconTexPath(skill.actionId);
    if (!iconTexPath) {
      throw new Error(`Action icon missing: ${skill.name} (${skill.actionId})`);
    }
    await downloadTexAsPng(iconTexPath, join(ACTION_DIR, `${skill.actionId}.png`));
    completedActions += 1;
    logProgress(
      'Action',
      completedActions,
      skillsWithAction.length,
      `${skill.name} (${skill.actionId})`,
    );
  });
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
