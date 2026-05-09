import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { SKILLS } from '../src/data/skills/index';
import { JOBS } from '../src/model/jobs';
import type { Job, Skill } from '../src/model/types';

const XIVAPI_V2_BASE_URL = 'https://xivapi-v2.xivcdn.com/api';
const DEFAULT_OUTPUT_DIR = join(process.cwd(), 'tmp');
const DEFAULT_LIMIT = 500;
const DEFAULT_CATEGORIES = new Set(['Ability', 'Spell']);

const JOB_SET = new Set<Job>(JOBS);

const VALUE_OPTIONS = new Set(['--category', '--limit', '--out']);

const FIELD_NAMES = [
  'Name@lang(chs)',
  'Name@lang(en)',
  'Name@lang(ja)',
  'Name@lang(fr)',
  'Name@lang(de)',
  'ClassJob.Abbreviation',
  'ClassJobCategory.Name@lang(en)',
  ...JOBS.map((job) => `ClassJobCategory.${job}`),
  'ActionCategory.Name@lang(chs)',
  'ActionCategory.Name@lang(en)',
  'Icon',
  'Recast100ms',
  'Cast100ms',
  'Range',
  'CanTargetSelf',
  'CanTargetParty',
  'CanTargetFriendly',
  'CanTargetHostile',
  'TargetArea',
  'IsPlayerAction',
  'IsPvP',
  'ClassJobLevel',
  'CooldownGroup',
  'AdditionalCooldownGroup',
  'MaxCharges',
  'EquivalenceGroup',
];

type ReferenceField<TFields = Record<string, unknown>> = {
  value?: number;
  sheet?: string;
  row_id?: number;
  fields?: TFields;
};

type ActionFields = {
  ActionCategory?: ReferenceField<{ 'Name@lang(chs)'?: string; 'Name@lang(en)'?: string }>;
  AdditionalCooldownGroup?: number;
  CanTargetFriendly?: boolean;
  CanTargetHostile?: boolean;
  CanTargetParty?: boolean;
  CanTargetSelf?: boolean;
  Cast100ms?: number;
  ClassJob?: ReferenceField<{ Abbreviation?: string }>;
  ClassJobCategory?: ReferenceField<Record<string, unknown>>;
  ClassJobLevel?: number;
  CooldownGroup?: number;
  EquivalenceGroup?: number;
  Icon?: { id?: number; path?: string; path_hr1?: string };
  IsPlayerAction?: boolean;
  IsPvP?: boolean;
  MaxCharges?: number;
  'Name@lang(chs)'?: string;
  'Name@lang(de)'?: string;
  'Name@lang(en)'?: string;
  'Name@lang(fr)'?: string;
  'Name@lang(ja)'?: string;
  Range?: number;
  Recast100ms?: number;
  TargetArea?: boolean;
};

type ActionRow = {
  row_id: number;
  fields?: ActionFields;
  transient?: {
    'Description@lang(chs)'?: string;
    'Description@lang(en)'?: string;
  };
};

type SheetResponse = {
  rows?: ActionRow[];
};

type ScriptConfig = {
  allCategories: boolean;
  categories: Set<string>;
  includeLevelZero: boolean;
  job: Job;
  limit: number;
  missingOnly: boolean;
  outPath: string;
};

type SkillCandidate = {
  action: ActionRow;
  availableJobs: Job[];
  cooldownSec: number;
  descriptionChs: string;
  descriptionEn: string;
  durationSec: number;
  existingSkill?: Skill;
  job: Job | 'ALL';
  maximumCharges?: number;
  slug: string;
  stackWarningLines: string[];
};

class HttpError extends Error {
  status: number;
  url: string;

  constructor(status: number, url: string) {
    super(`HTTP ${status}: ${url}`);
    this.status = status;
    this.url = url;
  }
}

const showHelp = () => {
  console.log(`Usage:
  bun scripts/fetch-xiv-job-skills.ts <JOB> [options]
  bun run fetch:skills -- <JOB> [options]

Options:
  --out <path>          输出路径，默认 tmp/{job-lower}-skills.ts
  --missing-only        只输出当前 src/data/skills 中不存在的 actionId
  --category <names>    逗号分隔的 ActionCategory，默认 Ability,Spell
  --all-categories      不按 ActionCategory 过滤
  --include-level-zero   包含 ClassJobLevel 为 0 的 Action
  --limit <number>      XIVAPI 每页读取数量，默认 ${DEFAULT_LIMIT}
  --help                显示帮助

Examples:
  bun run fetch:skills -- SGE
  bun run fetch:skills -- WHM --missing-only
  bun run fetch:skills -- PLD --out tmp/pld-actions.ts
`);
};

const parseArgs = (): ScriptConfig => {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  let job: Job | undefined;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (VALUE_OPTIONS.has(arg)) {
      i += 1;
      continue;
    }
    if (arg.startsWith('--')) continue;
    job = arg.toUpperCase() as Job;
    break;
  }

  if (!job || !JOB_SET.has(job)) {
    showHelp();
    throw new Error(`必须提供受支持的职业缩写：${JOBS.join(', ')}`);
  }

  let outPath = join(DEFAULT_OUTPUT_DIR, `${job.toLowerCase()}-skills.ts`);
  let limit = DEFAULT_LIMIT;
  let categories = new Set(DEFAULT_CATEGORIES);
  const allCategories = args.includes('--all-categories');
  const includeLevelZero = args.includes('--include-level-zero');
  const missingOnly = args.includes('--missing-only');

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--out') {
      const value = args[i + 1];
      if (!value) throw new Error('--out 需要提供输出路径');
      outPath = value;
      i += 1;
      continue;
    }
    if (arg === '--limit') {
      const value = Number(args[i + 1]);
      if (!Number.isInteger(value) || value <= 0) throw new Error('--limit 需要提供正整数');
      limit = value;
      i += 1;
      continue;
    }
    if (arg === '--category') {
      const value = args[i + 1];
      if (!value) throw new Error('--category 需要提供分类名称');
      categories = new Set(
        value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean),
      );
      i += 1;
    }
  }

  return {
    allCategories,
    categories,
    job,
    limit,
    missingOnly,
    outPath,
    includeLevelZero,
  };
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new HttpError(res.status, url);
  }
  return (await res.json()) as T;
};

const fetchActionRows = async (limit: number): Promise<ActionRow[]> => {
  const rows: ActionRow[] = [];
  let after = 0;

  while (true) {
    const params = new URLSearchParams({
      after: String(after),
      fields: FIELD_NAMES.join(','),
      limit: String(limit),
      transient: 'Description@lang(chs),Description@lang(en)',
    });
    const data = await fetchJson<SheetResponse>(`${XIVAPI_V2_BASE_URL}/sheet/Action?${params}`);
    const pageRows = data.rows ?? [];
    if (pageRows.length === 0) break;

    rows.push(...pageRows);
    after = pageRows[pageRows.length - 1].row_id;
    console.log(`[XIVAPI] 已读取 ${rows.length} 条 Action，当前 row_id=${after}`);

    if (pageRows.length < limit) break;
  }

  return rows;
};

const getCategoryName = (row: ActionRow) =>
  row.fields?.ActionCategory?.fields?.['Name@lang(en)'] ?? '';

const getCategoryDisplayName = (row: ActionRow) =>
  row.fields?.ActionCategory?.fields?.['Name@lang(chs)'] ?? getCategoryName(row);

const getClassJobAbbreviation = (row: ActionRow) =>
  row.fields?.ClassJob?.fields?.Abbreviation ?? '';

const getClassJobCategoryFields = (row: ActionRow) => row.fields?.ClassJobCategory?.fields ?? {};

const getAvailableJobs = (row: ActionRow): Job[] => {
  const categoryFields = getClassJobCategoryFields(row);
  return JOBS.filter((job) => categoryFields[job] === true);
};

const isActionAvailableForJob = (row: ActionRow, job: Job) => {
  const classJob = getClassJobAbbreviation(row);
  if (classJob === job) return true;
  return getClassJobCategoryFields(row)[job] === true;
};

const parseDurationSec = (description: string): number => {
  const match = description.match(/\bDuration:\s*(\d+(?:\.\d+)?)s\b/i);
  if (!match) return 0;
  return Number(match[1]);
};

const parseMaximumCharges = (description: string): number | undefined => {
  const match = description.match(/\bMaximum Charges:\s*(\d+)\b/i);
  if (!match) return undefined;
  return Number(match[1]);
};

const findStackWarningLines = (description: string) =>
  description
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /cannot be stacked/i.test(line));

const toSlug = (value: string) => {
  const slug = value
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'unknown-action';
};

const quote = (value: string) => `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

const formatNumber = (value: number) => {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(3)));
};

const formatCommentLine = (line: string) => `// ${line.replace(/\*\//g, '* /')}`;

const resolveImportPath = (outPath: string) => {
  const absoluteOutPath = isAbsolute(outPath) ? outPath : resolve(process.cwd(), outPath);
  const fromDir = dirname(absoluteOutPath);
  const toFile = join(process.cwd(), 'src/model/types');
  const importPath = relative(fromDir, toFile).replace(/\\/g, '/');
  if (importPath.startsWith('.')) return importPath;
  return `./${importPath}`;
};

const existingSkillByActionId = new Map(SKILLS.map((skill) => [skill.actionId, skill]));

const resolveCandidateJob = (
  row: ActionRow,
  requestedJob: Job,
  availableJobs: Job[],
): Job | 'ALL' => {
  const classJob = getClassJobAbbreviation(row);
  if (JOB_SET.has(classJob as Job)) return classJob as Job;
  if (availableJobs.length > 1) return 'ALL';
  return requestedJob;
};

const buildCandidates = (rows: ActionRow[], config: ScriptConfig): SkillCandidate[] =>
  rows
    .filter((row) => {
      const fields = row.fields;
      if (!fields?.['Name@lang(en)'] && !fields?.['Name@lang(chs)']) return false;
      if (!fields.IsPlayerAction) return false;
      if (fields.IsPvP) return false;
      if (!config.includeLevelZero && (fields.ClassJobLevel ?? 0) <= 0) return false;
      if (!isActionAvailableForJob(row, config.job)) return false;
      if (!config.allCategories && !config.categories.has(getCategoryName(row))) return false;
      return true;
    })
    .map((row) => {
      const descriptionChs = row.transient?.['Description@lang(chs)'] ?? '';
      const descriptionEn = row.transient?.['Description@lang(en)'] ?? '';
      const fields = row.fields ?? {};
      const availableJobs = getAvailableJobs(row);
      const maximumCharges = parseMaximumCharges(descriptionEn);
      const fieldCharges =
        fields.MaxCharges && fields.MaxCharges > 1 ? fields.MaxCharges : undefined;
      return {
        action: row,
        availableJobs,
        cooldownSec: (fields.Recast100ms ?? 0) / 10,
        descriptionChs,
        descriptionEn,
        durationSec: parseDurationSec(descriptionEn),
        existingSkill: existingSkillByActionId.get(row.row_id),
        job: resolveCandidateJob(row, config.job, availableJobs),
        maximumCharges: maximumCharges ?? fieldCharges,
        slug: toSlug(fields['Name@lang(en)'] ?? fields['Name@lang(chs)'] ?? ''),
        stackWarningLines: findStackWarningLines(descriptionEn),
      };
    })
    .sort((a, b) => {
      const aExists = a.existingSkill ? 1 : 0;
      const bExists = b.existingSkill ? 1 : 0;
      if (aExists !== bExists) return aExists - bExists;
      const levelDelta =
        (a.action.fields?.ClassJobLevel ?? 0) - (b.action.fields?.ClassJobLevel ?? 0);
      if (levelDelta !== 0) return levelDelta;
      return a.action.row_id - b.action.row_id;
    });

const getGroupId = (candidate: SkillCandidate) =>
  candidate.existingSkill?.cooldownGroup ??
  `${String(candidate.job).toLowerCase()}-grp-${candidate.slug}`;

const renderSuggestedGroups = (candidates: SkillCandidate[]) => {
  const groups = new Map<string, { cooldownSec: number; stack: number }>();
  for (const candidate of candidates) {
    if (!candidate.maximumCharges || candidate.maximumCharges <= 1) continue;
    groups.set(getGroupId(candidate), {
      cooldownSec: candidate.cooldownSec,
      stack: candidate.maximumCharges,
    });
  }

  if (groups.size === 0) return ['// 未发现 tooltip 中声明的 Maximum Charges。'];

  return [
    '// 建议补充或核对 COOLDOWN_GROUP：',
    ...Array.from(groups.entries()).map(
      ([id, group]) =>
        `// { id: ${quote(id)}, cooldownSec: ${formatNumber(group.cooldownSec)}, stack: ${group.stack} },`,
    ),
  ];
};

const renderCandidate = (candidate: SkillCandidate) => {
  const fields = candidate.action.fields ?? {};
  const existing = candidate.existingSkill;
  const actionNameEn = fields['Name@lang(en)'] ?? fields['Name@lang(chs)'] ?? '';
  const actionNameChs = fields['Name@lang(chs)'] ?? actionNameEn;
  const name = existing?.name ?? actionNameChs;
  const id = existing?.id ?? `${String(candidate.job).toLowerCase()}-${candidate.slug}`;
  const cooldownGroup =
    existing?.cooldownGroup ??
    (candidate.maximumCharges && candidate.maximumCharges > 1 ? getGroupId(candidate) : undefined);

  const lines: string[] = [];
  lines.push(`  ${formatCommentLine(existing ? `已存在：${existing.id}` : '未收录候选')}`);
  lines.push(`  ${formatCommentLine(`XIVAPI Action ID: ${candidate.action.row_id}`)}`);
  lines.push(
    `  ${formatCommentLine(
      `分类: ${getCategoryDisplayName(candidate.action) || '-'} / ${getCategoryName(candidate.action) || '-'}，等级: ${
        fields.ClassJobLevel ?? 0
      }，可用职业: ${candidate.availableJobs.join(', ') || '-'}`,
    )}`,
  );
  lines.push(
    `  ${formatCommentLine(
      `冷却组: CooldownGroup=${fields.CooldownGroup ?? 0}, AdditionalCooldownGroup=${
        fields.AdditionalCooldownGroup ?? 0
      }, EquivalenceGroup=${fields.EquivalenceGroup ?? 0}`,
    )}`,
  );
  lines.push(
    `  ${formatCommentLine(
      `MaxCharges字段=${fields.MaxCharges ?? 0}, tooltip Maximum Charges=${candidate.maximumCharges ?? '-'}`,
    )}`,
  );
  lines.push(
    `  ${formatCommentLine(
      `目标: self=${Boolean(fields.CanTargetSelf)}, party=${Boolean(fields.CanTargetParty)}, friendly=${Boolean(
        fields.CanTargetFriendly,
      )}, hostile=${Boolean(fields.CanTargetHostile)}, range=${fields.Range ?? 0}, area=${Boolean(
        fields.TargetArea,
      )}`,
    )}`,
  );
  if (fields.Icon?.path) {
    lines.push(`  ${formatCommentLine(`图标: ${fields.Icon.path}`)}`);
  }
  for (const warning of candidate.stackWarningLines) {
    lines.push(`  ${formatCommentLine(`不可叠加提示: ${warning}`)}`);
  }
  if (candidate.descriptionChs) {
    lines.push(
      ...candidate.descriptionChs
        .split('\n')
        .map((line) => `  ${formatCommentLine(`描述(chs): ${line}`)}`),
    );
  }
  if (candidate.descriptionEn) {
    lines.push(
      ...candidate.descriptionEn
        .split('\n')
        .map((line) => `  ${formatCommentLine(`描述(en): ${line}`)}`),
    );
  }

  lines.push('  {');
  lines.push(`    id: ${quote(id)},`);
  lines.push(`    name: ${quote(name)},`);
  lines.push(`    name_en: ${quote(actionNameEn)},`);
  lines.push(`    name_jp: ${quote(fields['Name@lang(ja)'] ?? actionNameEn)},`);
  lines.push(`    name_fr: ${quote(fields['Name@lang(fr)'] ?? actionNameEn)},`);
  lines.push(`    name_de: ${quote(fields['Name@lang(de)'] ?? actionNameEn)},`);
  lines.push(`    cooldownSec: ${formatNumber(candidate.cooldownSec)},`);
  lines.push(`    durationSec: ${formatNumber(candidate.durationSec)},`);
  lines.push(`    job: ${quote(candidate.job)},`);
  lines.push(`    actionId: ${candidate.action.row_id},`);
  if (cooldownGroup) {
    lines.push(`    cooldownGroup: ${quote(cooldownGroup)},`);
  }
  lines.push('  },');
  return lines.join('\n');
};

const renderOutput = (candidates: SkillCandidate[], config: ScriptConfig) => {
  const emittedCandidates = config.missingOnly
    ? candidates.filter((candidate) => !candidate.existingSkill)
    : candidates;
  const missingCount = candidates.filter((candidate) => !candidate.existingSkill).length;
  const existingCount = candidates.length - missingCount;
  const constName = `${config.job}_SKILL_CANDIDATES`;

  return [
    '// 该文件由 scripts/fetch-xiv-job-skills.ts 生成，用于手动挑拣技能数据。',
    '// 技能数据来自 xivapi-v2.xivcdn.com 的 boilmaster 实例；name 字段使用简体中文。',
    `// 生成职业: ${config.job}`,
    `// 候选总数: ${candidates.length}，未收录: ${missingCount}，已存在: ${existingCount}`,
    `// 分类过滤: ${config.allCategories ? '全部' : Array.from(config.categories).join(', ')}`,
    '',
    ...renderSuggestedGroups(emittedCandidates),
    '',
    `import type { Skill } from ${quote(resolveImportPath(config.outPath))};`,
    '',
    `export const ${constName}: Skill[] = [`,
    ...emittedCandidates.map(renderCandidate),
    '];',
    '',
  ].join('\n');
};

const run = async () => {
  const config = parseArgs();
  console.log(`Fetching Action rows for ${config.job}...`);
  const rows = await fetchActionRows(config.limit);
  const candidates = buildCandidates(rows, config);
  const output = renderOutput(candidates, config);

  await mkdir(dirname(config.outPath), { recursive: true });
  await writeFile(config.outPath, output);
  console.log(`已写入 ${config.outPath}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
