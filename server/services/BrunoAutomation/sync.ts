import fs from 'fs/promises';
import path from 'path';
import simpleGit, { type SimpleGit } from 'simple-git';
import type { BrunoRepositoryRecord } from '@shared/types/bruno';
import { parseBruRequestFile } from './bruFileParser';
import { BrunoAutomationRepository } from './repository';

export interface BrunoSyncResult {
  repositoryId: number;
  commit: string;
  requestCount: number;
}

interface CheckoutResult {
  checkoutPath: string;
  commit: string;
}

type CheckoutRepository = (repo: BrunoRepositoryRecord) => Promise<CheckoutResult>;
type FindBruFiles = (root: string) => Promise<string[]>;
type ReadBruFile = (absolutePath: string) => Promise<string>;

interface BrunoSyncRepositoryPort {
  replaceRequestIndex(input: {
    repositoryId: number;
    collectionName: string;
    collectionPath: string;
    projectId: number;
    syncCommit: string;
    requests: ReturnType<typeof parseBruRequestFile>[];
  }): Promise<void>;
}

interface BrunoSyncServiceOptions {
  repository?: BrunoSyncRepositoryPort;
  checkoutRepository?: CheckoutRepository;
  findBruFiles?: FindBruFiles;
  readBruFile?: ReadBruFile;
  repositoryRoot?: string;
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function defaultFindBruFiles(root: string): Promise<string[]> {
  const output: string[] = [];

  async function walk(currentDir: string): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        await walk(absolutePath);
      } else if (entry.isFile() && entry.name.endsWith('.bru')) {
        output.push(path.relative(root, absolutePath).replace(/\\/g, '/'));
      }
    }
  }

  await walk(root);
  return output.sort();
}

async function checkoutWithSimpleGit(repo: BrunoRepositoryRecord, repositoryRoot: string): Promise<CheckoutResult> {
  const checkoutPath = path.resolve(repositoryRoot, `repo-${repo.id}`);
  const exists = await pathExists(path.join(checkoutPath, '.git'));

  if (!exists) {
    await fs.mkdir(repositoryRoot, { recursive: true });
    await simpleGit().clone(repo.gitUrl, checkoutPath, ['--branch', repo.defaultBranch]);
  } else {
    const git: SimpleGit = simpleGit(checkoutPath);
    await git.fetch();
    await git.checkout(repo.defaultBranch);
    await git.pull('origin', repo.defaultBranch);
  }

  const git = simpleGit(checkoutPath);
  const commit = (await git.revparse(['HEAD'])).trim();
  return { checkoutPath, commit };
}

export class BrunoSyncService {
  private readonly repository: BrunoSyncRepositoryPort;
  private readonly checkoutRepository: CheckoutRepository;
  private readonly findBruFiles: FindBruFiles;
  private readonly readBruFile: ReadBruFile;

  constructor(options: BrunoSyncServiceOptions = {}) {
    const repositoryRoot = options.repositoryRoot ?? path.resolve(process.env.BRUNO_REPOSITORY_ROOT ?? 'tmp/bruno-repositories');
    this.repository = options.repository ?? new BrunoAutomationRepository();
    this.checkoutRepository = options.checkoutRepository ?? ((repo) => checkoutWithSimpleGit(repo, repositoryRoot));
    this.findBruFiles = options.findBruFiles ?? defaultFindBruFiles;
    this.readBruFile = options.readBruFile ?? ((absolutePath) => fs.readFile(absolutePath, 'utf8'));
  }

  async syncRepository(repo: BrunoRepositoryRecord): Promise<BrunoSyncResult> {
    const checkout = await this.checkoutRepository(repo);
    const collectionRoot = path.join(checkout.checkoutPath, repo.collectionRoot);
    const files = await this.findBruFiles(collectionRoot);
    const requests = [];

    for (const relativePath of files) {
      const content = await this.readBruFile(path.join(collectionRoot, relativePath));
      requests.push(parseBruRequestFile(relativePath, content));
    }

    await this.repository.replaceRequestIndex({
      repositoryId: repo.id,
      collectionName: repo.name,
      collectionPath: repo.collectionRoot,
      projectId: repo.projectId,
      syncCommit: checkout.commit,
      requests,
    });

    return {
      repositoryId: repo.id,
      commit: checkout.commit,
      requestCount: requests.length,
    };
  }
}
