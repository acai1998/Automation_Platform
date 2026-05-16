const fs = require('fs');
const path = require('path');

const file = 'server/repositories/ExecutionRepository.ts';
const text = fs.readFileSync(file, 'utf8');
const eol = text.includes('\r\n') ? '\r\n' : '\n';
const dir = 'server/repositories';

function normalize(content) {
  return content.split(/\r?\n/).join(eol);
}

function slice(start, end) {
  const startIndex = text.indexOf(start);
  if (startIndex < 0) {
    throw new Error(`Missing start marker: ${start}`);
  }
  const endIndex = end ? text.indexOf(end, startIndex) : text.length;
  if (endIndex < 0) {
    throw new Error(`Missing end marker: ${end}`);
  }
  return text.slice(startIndex, endIndex).trimEnd();
}

function write(name, content) {
  fs.writeFileSync(path.join(dir, name), `${normalize(content)}${eol}`);
}

const importBlock = text.slice(0, text.indexOf('// ============================================================================')).trimEnd();
let typesBlock = slice('// ============================================================================', '/**\n * 运行记录 Repository');
typesBlock = typesBlock
  .replace('interface BatchCaseResult', 'export interface BatchCaseResult')
  .replace('interface BatchResults', 'export interface BatchResults');
write('ExecutionRepositoryTypes.ts', typesBlock);

const typeImports = [
  'import type {',
  '  BatchResults,',
  '  ExecutionDetail,',
  '  ExecutionWithJenkinsInfo,',
  '  PotentiallyTimedOutExecution,',
  '  RecentExecution,',
  '  StaleExecutionSummary,',
  '  StuckExecution,',
  '  TestRunBasicInfo,',
  '  TestRunRow,',
  '  TestRunStatusInfo,',
  '  TestRunWithUser,',
  "} from './ExecutionRepositoryTypes';",
].join(eol);

function classFile(name, className, extendsName, body, extraImports = '') {
  write(
    name,
    [
      importBlock,
      extraImports,
      typeImports,
      '',
      `export class ${className} extends ${extendsName} {`,
      body,
      '}',
    ].filter(Boolean).join(`${eol}`)
  );
}

const classHeaderStart = text.indexOf('export class ExecutionRepository extends BaseRepository<TaskExecution> {');
const constructorStart = text.indexOf('  constructor(dataSource: DataSource)', classHeaderStart);
const baseFields = text
  .slice(
    classHeaderStart + 'export class ExecutionRepository extends BaseRepository<TaskExecution> {'.length,
    constructorStart
  )
  .replaceAll('private readonly', 'protected readonly')
  .replaceAll('private static readonly', 'protected static readonly');

const baseBody = `${baseFields}${eol}${slice('  constructor(dataSource: DataSource)', '  async findExecutionId()')}`
  .replaceAll('ExecutionRepository.', 'ExecutionRepositoryBase.');

write(
  'ExecutionRepositoryBase.ts',
  [
    importBlock,
    typeImports,
    '',
    'export abstract class ExecutionRepositoryBase extends BaseRepository<TaskExecution> {',
    baseBody,
    '}',
  ].join(eol)
);

classFile(
  'ExecutionRepositoryLookup.ts',
  'ExecutionRepositoryLookup',
  'ExecutionRepositoryBase',
  slice('  async findExecutionId()', '  async completeBatch(').replaceAll('ExecutionRepository.', 'ExecutionRepositoryBase.'),
  "import { ExecutionRepositoryBase } from './ExecutionRepositoryBase';"
);

const utilityBody = [
  slice('  async countResultsByStatus', '  async syncTestRunByExecutionId'),
  slice('  private mapStatusForTestRun', '  private async resolveExecutionIdForBatch')
    .replace('private mapStatusForTestRun', 'protected mapStatusForTestRun')
    .replace('private normalizeCaseResultStatus', 'protected normalizeCaseResultStatus'),
].join(`${eol}${eol}`);

classFile(
  'ExecutionRepositoryStatusUtilities.ts',
  'ExecutionRepositoryStatusUtilities',
  'ExecutionRepositoryLookup',
  utilityBody.replaceAll('ExecutionRepository.', 'ExecutionRepositoryBase.'),
  "import { ExecutionRepositoryLookup } from './ExecutionRepositoryLookup';\nimport { ExecutionRepositoryBase } from './ExecutionRepositoryBase';"
);

const batchBody = [
  slice('  async completeBatch(', '  async fixOrphanedTestRuns()'),
  slice('  private async resolveExecutionIdForBatch', null).replace(/\n}\s*$/, ''),
].join(`${eol}${eol}`).replaceAll('ExecutionRepository.', 'ExecutionRepositoryBase.');

classFile(
  'ExecutionRepositoryBatch.ts',
  'ExecutionRepositoryBatch',
  'ExecutionRepositoryStatusUtilities',
  batchBody,
  "import { ExecutionRepositoryBase } from './ExecutionRepositoryBase';\nimport { ExecutionRepositoryStatusUtilities } from './ExecutionRepositoryStatusUtilities';"
);

const maintenanceBody = [
  slice('  async fixOrphanedTestRuns()', '  async countResultsByStatus'),
  slice('  async syncTestRunByExecutionId', '  private mapStatusForTestRun'),
].join(`${eol}${eol}`).replaceAll('ExecutionRepository.', 'ExecutionRepositoryBase.');

classFile(
  'ExecutionRepositoryMaintenance.ts',
  'ExecutionRepositoryMaintenance',
  'ExecutionRepositoryBatch',
  maintenanceBody,
  "import { ExecutionRepositoryBase } from './ExecutionRepositoryBase';\nimport { ExecutionRepositoryBatch } from './ExecutionRepositoryBatch';"
);

write(
  'ExecutionRepository.ts',
  [
    "import { ExecutionRepositoryMaintenance } from './ExecutionRepositoryMaintenance';",
    '',
    "export type {",
    '  ExecutionDetail,',
    '  ExecutionResultRow,',
    '  ExecutionWithJenkinsInfo,',
    '  PotentiallyTimedOutExecution,',
    '  RecentExecution,',
    '  StaleExecutionSummary,',
    '  StuckExecution,',
    '  TaskExecutionWithUser,',
    '  TestRunBasicInfo,',
    '  TestRunRow,',
    '  TestRunStatusInfo,',
    '  TestRunWithUser,',
    "} from './ExecutionRepositoryTypes';",
    '',
    'export class ExecutionRepository extends ExecutionRepositoryMaintenance {}',
  ].join(eol)
);
