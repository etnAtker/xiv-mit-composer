import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { SKILLS } from '../src/data/skills/index';
import { JOBS } from '../src/model/jobs';
import type { Job, Skill } from '../src/model/types';

const XIVAPI_V2_BASE_URL = 'https://xivapi-v2.xivcdn.com/api';
const DEFAULT_OUTPUT_DIR = join(process.cwd(), 'tmp');
const PAGE_LIMIT = 500;
const ACTION_CATEGORIES = new Set(['Ability', 'Spell']);

const JOB_SET = new Set<Job>(JOBS);

const ACTION_FIELD_NAMES = [
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

const TRAIT_FIELD_NAMES = [
  'Name@lang(chs)',
  'Name@lang(en)',
  'ClassJob.Abbreviation',
  'ClassJobCategory.Name@lang(en)',
  ...JOBS.map((job) => `ClassJobCategory.${job}`),
  'Level',
  'Value',
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

type TraitFields = {
  ClassJob?: ReferenceField<{ Abbreviation?: string }>;
  ClassJobCategory?: ReferenceField<Record<string, unknown>>;
  Level?: number;
  'Name@lang(chs)'?: string;
  'Name@lang(en)'?: string;
  Value?: number;
};

type ActionRow = {
  row_id: number;
  fields?: ActionFields;
  transient?: {
    'Description@lang(chs)'?: string;
    'Description@lang(en)'?: string;
  };
};

type TraitRow = {
  row_id: number;
  fields?: TraitFields;
  transient?: {
    'Description@lang(chs)'?: string;
    'Description@lang(en)'?: string;
  };
};

type SheetResponse<TRow> = {
  rows?: TRow[];
};

type ScriptConfig = {
  job: Job;
  outPath: string;
};

type RecastTraitEffect = {
  kind: 'recast';
  trait: TraitRow;
  actionNames: string[];
  targetCooldownSec: number;
  valueCooldownSec?: number;
};

type ChargesTraitEffect = {
  kind: 'charges';
  trait: TraitRow;
  actionNames: string[];
  maximumCharges: number;
};

type TraitEffect = RecastTraitEffect | ChargesTraitEffect;

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
  recastTrait?: RecastTraitEffect;
  slug: string;
  stackWarningLines: string[];
  traitNotes: TraitEffect[];
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
  bun scripts/fetch-xiv-job-skills.ts <JOB>
  bun run fetch:skills -- <JOB>

Examples:
  bun run fetch:skills -- SCH
  bun run fetch:skills -- AST
`);
};

const parseArgs = (): ScriptConfig => {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    showHelp();
    process.exit(0);
  }

  const positional = args.filter((arg) => !arg.startsWith('--'));
  const job = positional[0]?.toUpperCase() as Job | undefined;

  if (
    args.some((arg) => arg.startsWith('--')) ||
    positional.length !== 1 ||
    !job ||
    !JOB_SET.has(job)
  ) {
    showHelp();
    throw new Error(`只接受一个受支持的职业缩写参数：${JOBS.join(', ')}`);
  }

  return {
    job,
    outPath: join(DEFAULT_OUTPUT_DIR, `${job.toLowerCase()}-skills.ts`),
  };
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const res = await fetch(url);
  if (!res.ok) {
    throw new HttpError(res.status, url);
  }
  return (await res.json()) as T;
};

const fetchSheetRows = async <TRow>(
  sheet: string,
  fields: string[],
  transientFields?: string[],
): Promise<TRow[]> => {
  const rows: TRow[] = [];
  let after = 0;

  while (true) {
    const params = new URLSearchParams({
      after: String(after),
      fields: fields.join(','),
      limit: String(PAGE_LIMIT),
    });
    if (transientFields?.length) {
      params.set('transient', transientFields.join(','));
    }

    const data = await fetchJson<SheetResponse<TRow>>(
      `${XIVAPI_V2_BASE_URL}/sheet/${sheet}?${params}`,
    );
    const pageRows = data.rows ?? [];
    if (pageRows.length === 0) break;

    rows.push(...pageRows);
    after = (pageRows[pageRows.length - 1] as { row_id: number }).row_id;
    console.log(`[XIVAPI] 已读取 ${rows.length} 条 ${sheet}，当前 row_id=${after}`);

    if (pageRows.length < PAGE_LIMIT) break;
  }

  return rows;
};

const fetchActionRows = () =>
  fetchSheetRows<ActionRow>('Action', ACTION_FIELD_NAMES, [
    'Description@lang(chs)',
    'Description@lang(en)',
  ]);

const fetchTraitRows = () =>
  fetchSheetRows<TraitRow>('Trait', TRAIT_FIELD_NAMES, [
    'Description@lang(chs)',
    'Description@lang(en)',
  ]);

const getCategoryName = (row: ActionRow) =>
  row.fields?.ActionCategory?.fields?.['Name@lang(en)'] ?? '';

const getCategoryDisplayName = (row: ActionRow) =>
  row.fields?.ActionCategory?.fields?.['Name@lang(chs)'] ?? getCategoryName(row);

const getClassJobAbbreviation = (row: ActionRow | TraitRow) =>
  row.fields?.ClassJob?.fields?.Abbreviation ?? '';

const getClassJobCategoryFields = (row: ActionRow | TraitRow) =>
  row.fields?.ClassJobCategory?.fields ?? {};

const getClassJobCategoryName = (row: ActionRow | TraitRow) => {
  const value = getClassJobCategoryFields(row)['Name@lang(en)'];
  return typeof value === 'string' ? value : '';
};

const getAvailableJobs = (row: ActionRow | TraitRow): Job[] => {
  const categoryFields = getClassJobCategoryFields(row);
  return JOBS.filter((job) => categoryFields[job] === true);
};

const isRowAvailableForJob = (row: ActionRow | TraitRow, job: Job) => {
  const classJob = getClassJobAbbreviation(row);
  if (classJob === job) return true;
  return getClassJobCategoryFields(row)[job] === true;
};

const isExactJobCategory = (row: ActionRow, job: Job) => getClassJobCategoryName(row) === job;

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

const stripTrailingRomanNumeral = (value: string) =>
  value.replace(/\s+(?:I|II|III|IV|V|VI|VII|VIII|IX|X)$/i, '').trim();

const normalizeName = (value: string) =>
  stripTrailingRomanNumeral(value)
    .normalize('NFKD')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const splitActionNames = (value: string) =>
  value
    .split(/\s*(?:,|\band\b|\/)\s*/i)
    .map((item) => item.trim())
    .filter(Boolean);

const parseRecastTraitEffect = (trait: TraitRow): RecastTraitEffect | undefined => {
  const description = trait.transient?.['Description@lang(en)'] ?? '';
  const match = description.match(
    /^Reduces (.+?) recast (?:time|timer) to (\d+(?:\.\d+)?) seconds(?:\.|\b)/i,
  );
  if (!match) return undefined;

  const value = trait.fields?.Value;
  return {
    kind: 'recast',
    trait,
    actionNames: splitActionNames(match[1]),
    targetCooldownSec: Number(match[2]),
    valueCooldownSec: typeof value === 'number' ? value / 10 : undefined,
  };
};

const parseChargesTraitEffect = (trait: TraitRow): ChargesTraitEffect | undefined => {
  const description = trait.transient?.['Description@lang(en)'] ?? '';
  const match = description.match(
    /Allows the accumulation of charges for consecutive uses of (.+?)\.\s*Maximum Charges:\s*(\d+)/is,
  );
  if (!match) return undefined;

  return {
    kind: 'charges',
    trait,
    actionNames: splitActionNames(match[1].replace(/\s+/g, ' ')),
    maximumCharges: Number(match[2]),
  };
};

const parseTraitEffects = (trait: TraitRow): TraitEffect[] =>
  [parseRecastTraitEffect(trait), parseChargesTraitEffect(trait)].filter(
    (effect): effect is TraitEffect => Boolean(effect),
  );

const isEffectForAction = (effect: TraitEffect, actionNameEn: string) => {
  const normalizedActionName = normalizeName(actionNameEn);
  return effect.actionNames.some((name) => normalizeName(name) === normalizedActionName);
};

const findTraitNotes = (effects: TraitEffect[], actionNameEn: string) =>
  effects.filter((effect) => isEffectForAction(effect, actionNameEn));

const findRecastTrait = (effects: TraitEffect[], actionNameEn: string, actionCooldownSec: number) =>
  effects.find((effect): effect is RecastTraitEffect => {
    if (effect.kind !== 'recast') return false;
    if (!isEffectForAction(effect, actionNameEn)) return false;
    if (effect.valueCooldownSec === undefined) return true;
    return Math.abs(actionCooldownSec + effect.valueCooldownSec - effect.targetCooldownSec) < 0.001;
  });

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
const existingSkillById = new Map(SKILLS.map((skill) => [skill.id, skill]));

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

const shouldIncludeAction = (row: ActionRow, job: Job) => {
  const fields = row.fields;
  if (!fields?.['Name@lang(en)'] && !fields?.['Name@lang(chs)']) return false;
  if (fields.IsPvP) return false;
  if ((fields.ClassJobLevel ?? 0) <= 0) return false;
  if (!ACTION_CATEGORIES.has(getCategoryName(row))) return false;
  if (!isRowAvailableForJob(row, job)) return false;
  if (fields.IsPlayerAction) return true;
  return isExactJobCategory(row, job);
};

const buildCandidates = (
  rows: ActionRow[],
  traitEffects: TraitEffect[],
  config: ScriptConfig,
): SkillCandidate[] =>
  rows
    .filter((row) => shouldIncludeAction(row, config.job))
    .map((row) => {
      const descriptionChs = row.transient?.['Description@lang(chs)'] ?? '';
      const descriptionEn = row.transient?.['Description@lang(en)'] ?? '';
      const fields = row.fields ?? {};
      const actionNameEn = fields['Name@lang(en)'] ?? fields['Name@lang(chs)'] ?? '';
      const actionCooldownSec = (fields.Recast100ms ?? 0) / 10;
      const recastTrait = findRecastTrait(traitEffects, actionNameEn, actionCooldownSec);
      const availableJobs = getAvailableJobs(row);
      const maximumCharges = parseMaximumCharges(descriptionEn);
      const fieldCharges =
        fields.MaxCharges && fields.MaxCharges > 1 ? fields.MaxCharges : undefined;
      return {
        action: row,
        availableJobs,
        cooldownSec: recastTrait?.targetCooldownSec ?? actionCooldownSec,
        descriptionChs,
        descriptionEn,
        durationSec: parseDurationSec(descriptionEn),
        existingSkill: existingSkillByActionId.get(row.row_id),
        job: resolveCandidateJob(row, config.job, availableJobs),
        maximumCharges: maximumCharges ?? fieldCharges,
        recastTrait,
        slug: toSlug(actionNameEn),
        stackWarningLines: findStackWarningLines(descriptionEn),
        traitNotes: findTraitNotes(traitEffects, actionNameEn),
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

const getExistingPrimaryCooldownGroup = (skill: Skill | undefined) => {
  if (!skill?.cooldownGroup) return undefined;
  return Array.isArray(skill.cooldownGroup) ? skill.cooldownGroup[0] : skill.cooldownGroup;
};

const getGroupId = (candidate: SkillCandidate) =>
  getExistingPrimaryCooldownGroup(candidate.existingSkill) ??
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

  for (const candidate of candidates) {
    for (const effect of candidate.traitNotes) {
      if (effect.kind !== 'charges' || effect.maximumCharges <= 1) continue;
      groups.set(getGroupId(candidate), {
        cooldownSec: candidate.cooldownSec,
        stack: effect.maximumCharges,
      });
    }
  }

  if (groups.size === 0) return ['// 未发现 Maximum Charges 候选。'];

  return [
    '// 建议补充或核对 COOLDOWN_GROUP：',
    ...Array.from(groups.entries()).map(
      ([id, group]) =>
        `// { id: ${quote(id)}, stack: ${group.stack}, recovery: { cooldownSec: ${formatNumber(
          group.cooldownSec,
        )} } },`,
    ),
  ];
};

const formatTraitName = (trait: TraitRow) => {
  const fields = trait.fields ?? {};
  return `${fields['Name@lang(chs)'] ?? fields['Name@lang(en)'] ?? 'Unknown Trait'} / ${
    fields['Name@lang(en)'] ?? '-'
  }`;
};

const renderTraitComment = (effect: TraitEffect) => {
  const fields = effect.trait.fields ?? {};
  const prefix = `Trait ${effect.trait.row_id}: ${formatTraitName(effect.trait)}，等级=${
    fields.Level ?? 0
  }，Value=${fields.Value ?? 0}`;
  if (effect.kind === 'recast') {
    return `${prefix}，复唱覆盖到 ${formatNumber(effect.targetCooldownSec)}s`;
  }
  return `${prefix}，Maximum Charges=${effect.maximumCharges}`;
};

const renderCandidate = (candidate: SkillCandidate) => {
  const fields = candidate.action.fields ?? {};
  const existing = candidate.existingSkill;
  const actionNameEn = fields['Name@lang(en)'] ?? fields['Name@lang(chs)'] ?? '';
  const actionNameChs = fields['Name@lang(chs)'] ?? actionNameEn;
  const name = existing?.name ?? actionNameChs;
  const baseId = `${String(candidate.job).toLowerCase()}-${candidate.slug}`;
  const idCollision = existing ? undefined : existingSkillById.get(baseId);
  const id = existing?.id ?? (idCollision ? `${baseId}-${candidate.action.row_id}` : baseId);
  const cooldownGroup =
    existing?.cooldownGroup ??
    (candidate.maximumCharges && candidate.maximumCharges > 1 ? getGroupId(candidate) : undefined);

  const lines: string[] = [];
  lines.push(`  ${formatCommentLine(existing ? `已存在：${existing.id}` : '未收录候选')}`);
  lines.push(`  ${formatCommentLine(`XIVAPI Action ID: ${candidate.action.row_id}`)}`);
  lines.push(
    `  ${formatCommentLine(
      `分类: ${getCategoryDisplayName(candidate.action) || '-'} / ${
        getCategoryName(candidate.action) || '-'
      }，等级: ${fields.ClassJobLevel ?? 0}，可用职业: ${
        candidate.availableJobs.join(', ') || '-'
      }，IsPlayerAction=${Boolean(fields.IsPlayerAction)}`,
    )}`,
  );
  lines.push(
    `  ${formatCommentLine(
      `冷却: Action=${formatNumber((fields.Recast100ms ?? 0) / 10)}s${
        candidate.recastTrait ? `，Trait后=${formatNumber(candidate.cooldownSec)}s` : ''
      }`,
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
      `MaxCharges字段=${fields.MaxCharges ?? 0}, tooltip Maximum Charges=${
        candidate.maximumCharges ?? '-'
      }`,
    )}`,
  );
  lines.push(
    `  ${formatCommentLine(
      `目标: self=${Boolean(fields.CanTargetSelf)}, party=${Boolean(
        fields.CanTargetParty,
      )}, friendly=${Boolean(fields.CanTargetFriendly)}, hostile=${Boolean(
        fields.CanTargetHostile,
      )}, range=${fields.Range ?? 0}, area=${Boolean(fields.TargetArea)}`,
    )}`,
  );
  if (fields.Icon?.path) {
    lines.push(`  ${formatCommentLine(`图标: ${fields.Icon.path}`)}`);
  }
  if (idCollision) {
    lines.push(
      `  ${formatCommentLine(
        `建议 ID 与现有技能 ${idCollision.id} 重名，已追加 Action ID 生成 ${id}`,
      )}`,
    );
  }
  for (const effect of candidate.traitNotes) {
    lines.push(`  ${formatCommentLine(renderTraitComment(effect))}`);
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
    lines.push(
      `    cooldownGroup: ${
        Array.isArray(cooldownGroup)
          ? `[${cooldownGroup.map((group) => quote(group)).join(', ')}]`
          : quote(cooldownGroup)
      },`,
    );
  }
  lines.push('  },');
  return lines.join('\n');
};

const renderOutput = (
  candidates: SkillCandidate[],
  traitEffects: TraitEffect[],
  config: ScriptConfig,
) => {
  const missingCount = candidates.filter((candidate) => !candidate.existingSkill).length;
  const existingCount = candidates.length - missingCount;
  const constName = `${config.job}_SKILL_CANDIDATES`;
  const usedTraitIds = new Set(
    candidates.flatMap((candidate) => candidate.traitNotes.map((effect) => effect.trait.row_id)),
  );
  const unusedEffects = traitEffects.filter((effect) => !usedTraitIds.has(effect.trait.row_id));

  return [
    '// 该文件由 scripts/fetch-xiv-job-skills.ts 生成，用于手动挑拣技能数据。',
    '// 技能数据来自 xivapi-v2.xivcdn.com 的 boilmaster 实例；name 字段使用简体中文。',
    '// Trait 仅对可匹配 Action 名称的明确复唱覆盖和层数提示生效，条件触发型 Trait 不会改写基础 cooldownSec。',
    `// 生成职业: ${config.job}`,
    `// 候选总数: ${candidates.length}，未收录: ${missingCount}，已存在: ${existingCount}`,
    '',
    ...renderSuggestedGroups(candidates),
    '',
    ...(unusedEffects.length
      ? [
          '// 未匹配到候选 Action 的 Trait 规则：',
          ...unusedEffects.map((effect) => `// ${renderTraitComment(effect)}`),
          '',
        ]
      : []),
    `import type { Skill } from ${quote(resolveImportPath(config.outPath))};`,
    '',
    `export const ${constName}: Skill[] = [`,
    ...candidates.map(renderCandidate),
    '];',
    '',
  ].join('\n');
};

const run = async () => {
  const config = parseArgs();
  console.log(`Fetching Action rows for ${config.job}...`);
  const [actionRows, traitRows] = await Promise.all([fetchActionRows(), fetchTraitRows()]);
  const traitEffects = traitRows
    .filter((row) => isRowAvailableForJob(row, config.job))
    .flatMap(parseTraitEffects);
  const candidates = buildCandidates(actionRows, traitEffects, config);
  const output = renderOutput(candidates, traitEffects, config);

  await mkdir(dirname(config.outPath), { recursive: true });
  await writeFile(config.outPath, output);
  console.log(`已写入 ${config.outPath}`);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
