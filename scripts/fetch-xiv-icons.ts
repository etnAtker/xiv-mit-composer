import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { SKILLS } from '../src/data/skills/index';
import type { Job } from '../src/model/types';

const XIVAPI_BASE_URL = 'https://xivapi.com';
const OUTPUT_DIR = join(process.cwd(), 'public', 'xiv-icons');
const ACTION_DIR = join(OUTPUT_DIR, 'actions');
const JOB_DIR = join(OUTPUT_DIR, 'jobs');
const MAX_CLASSJOB_PAGES = 6;

const JOBS: Job[] = ['PLD', 'WAR', 'DRK', 'GNB'];

const fetchJson = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`XIVAPI request failed: ${res.status}`);
  }
  return res.json();
};

const fetchBinary = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Icon download failed: ${res.status}`);
  }
  const buffer = await res.arrayBuffer();
  return new Uint8Array(buffer);
};

const resolveActionIconPath = async (actionId: number) => {
  const data = await fetchJson(`${XIVAPI_BASE_URL}/Action/${actionId}?columns=Icon`);
  return data?.Icon as string | undefined;
};

const resolveClassJobIconMap = async () => {
  const map: Record<string, string> = {};
  let page = 1;
  for (let pagesFetched = 0; pagesFetched < MAX_CLASSJOB_PAGES; pagesFetched += 1) {
    const data = await fetchJson(
      `${XIVAPI_BASE_URL}/ClassJob?columns=Abbreviation,Icon&page=${page}`,
    );
    const results = data?.Results ?? data?.results ?? [];
    results.forEach((row: { Abbreviation?: string; Icon?: string }) => {
      if (row?.Abbreviation && row?.Icon) {
        map[row.Abbreviation] = row.Icon;
      }
    });

    const nextPage = data?.Pagination?.PageNext;
    if (!nextPage || nextPage === page) break;
    page = nextPage;
  }

  return map;
};

const downloadIcon = async (url: string, outputPath: string) => {
  const data = await fetchBinary(url);
  await writeFile(outputPath, data);
};

const run = async () => {
  await mkdir(ACTION_DIR, { recursive: true });
  await mkdir(JOB_DIR, { recursive: true });

  const classJobMap = await resolveClassJobIconMap();

  for (const job of JOBS) {
    const iconPath = classJobMap[job];
    if (!iconPath) {
      console.warn(`Job icon missing: ${job}`);
      continue;
    }
    await downloadIcon(`${XIVAPI_BASE_URL}${iconPath}`, join(JOB_DIR, `${job}.png`));
  }

  for (const skill of SKILLS) {
    if (!skill.actionId) continue;
    const iconPath = await resolveActionIconPath(skill.actionId);
    if (!iconPath) {
      console.warn(`Action icon missing: ${skill.name} (${skill.actionId})`);
      continue;
    }
    await downloadIcon(`${XIVAPI_BASE_URL}${iconPath}`, join(ACTION_DIR, `${skill.actionId}.png`));
  }
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
