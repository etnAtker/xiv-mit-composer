import type { Job } from '../../model/types';

const XIVAPI_BASE_URL = 'https://xivapi.com';
const MAX_CLASSJOB_PAGES = 6;

let classJobIconCache: Promise<Record<string, string>> | null = null;

const fetchJson = async (url: string) => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`XIVAPI request failed: ${res.status}`);
  }
  return res.json();
};

export const fetchActionIconUrl = async (actionId?: number | null): Promise<string | null> => {
  if (!actionId) return null;
  try {
    const data = await fetchJson(`${XIVAPI_BASE_URL}/Action/${actionId}?columns=Icon`);
    const iconPath = data?.Icon as string | undefined;
    if (!iconPath) return null;
    return `${XIVAPI_BASE_URL}${iconPath}`;
  } catch (error) {
    console.error(error);
    return null;
  }
};

const fetchClassJobIconMap = async (): Promise<Record<string, string>> => {
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

export const fetchJobIconUrl = async (job: Job): Promise<string | null> => {
  try {
    if (!classJobIconCache) {
      classJobIconCache = fetchClassJobIconMap();
    }
    const map = await classJobIconCache;
    const iconPath = map[job];
    if (!iconPath) return null;
    return `${XIVAPI_BASE_URL}${iconPath}`;
  } catch (error) {
    console.error(error);
    return null;
  }
};
