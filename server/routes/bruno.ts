import { Router } from 'express';
import { generalAuthRateLimiter } from '../middleware/authRateLimiter';
import { authenticate } from '../middleware/auth';
import { BrunoAutomationRepository } from '../services/BrunoAutomation/repository';
import { brunoAutomationService } from '../services/BrunoAutomation/service';
import { BrunoSyncService } from '../services/BrunoAutomation/sync';
import { validateBrunoRunConfig } from '../services/BrunoAutomation/validation';

const router = Router();
const repository = new BrunoAutomationRepository();
const syncService = new BrunoSyncService();

function parsePositiveInt(value: unknown, fieldName: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }
  return parsed;
}

router.get('/repositories', async (req, res) => {
  try {
    const projectId = req.query.projectId === undefined
      ? undefined
      : parsePositiveInt(req.query.projectId, 'projectId');
    const data = await repository.listRepositories(projectId);
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid request',
    });
  }
});

router.post('/repositories', generalAuthRateLimiter, authenticate, async (req, res) => {
  try {
    const id = await repository.createRepository({
      name: String(req.body.name ?? '').trim(),
      projectId: parsePositiveInt(req.body.projectId, 'projectId'),
      gitUrl: String(req.body.gitUrl ?? '').trim(),
      defaultBranch: String(req.body.defaultBranch ?? 'main').trim(),
      collectionRoot: String(req.body.collectionRoot ?? '.').trim(),
      authSecretRef: req.body.authSecretRef ? String(req.body.authSecretRef) : undefined,
    });

    res.status(201).json({ success: true, data: { id } });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid request',
    });
  }
});

router.post('/repositories/:id/sync', generalAuthRateLimiter, authenticate, async (req, res) => {
  try {
    const repositoryId = parsePositiveInt(req.params.id, 'repositoryId');
    const repo = await repository.getRepository(repositoryId);
    if (!repo) {
      return res.status(404).json({ success: false, message: 'Bruno repository not found' });
    }

    const data = await syncService.syncRepository(repo);
    res.status(202).json({ success: true, data });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Bruno sync failed',
    });
  }
});

router.get('/collections', async (req, res) => {
  try {
    const repositoryId = req.query.repositoryId === undefined
      ? undefined
      : parsePositiveInt(req.query.repositoryId, 'repositoryId');
    const projectId = req.query.projectId === undefined
      ? undefined
      : parsePositiveInt(req.query.projectId, 'projectId');
    const data = await repository.listCollections({ repositoryId, projectId });
    res.json({ success: true, data });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid request',
    });
  }
});

router.post('/run-preview', (req, res) => {
  try {
    const config = validateBrunoRunConfig(req.body.config);
    res.json({
      success: true,
      data: {
        engine: 'bruno',
        config,
      },
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid Bruno run config',
    });
  }
});

router.post('/runs', generalAuthRateLimiter, authenticate, async (req, res) => {
  try {
    const config = validateBrunoRunConfig(req.body.config);
    const caseIds = Array.isArray(req.body.caseIds)
      ? req.body.caseIds.map((value: unknown) => parsePositiveInt(value, 'caseIds[]'))
      : [];

    if (caseIds.length === 0) {
      return res.status(400).json({ success: false, message: 'caseIds must not be empty' });
    }

    const rawCaseNameById = req.body.caseNameById ?? {};
    const caseNameById = new Map<number, string>(
      Object.entries(rawCaseNameById).map(([caseId, caseName]) => [
        Number(caseId),
        String(caseName),
      ]),
    );

    const result = await brunoAutomationService.runManual({
      projectId: parsePositiveInt(req.body.projectId, 'projectId'),
      triggeredBy: req.user!.id,
      caseIds,
      caseNameById,
      config,
    });

    res.status(202).json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error instanceof Error ? error.message : 'Invalid Bruno run request',
    });
  }
});

export default router;
