import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { loggerMock, getSecretOrEnvMock, execSyncMock } = vi.hoisted(() => ({
  loggerMock: {
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    errorLog: vi.fn(),
  },
  getSecretOrEnvMock: vi.fn(),
  execSyncMock: vi.fn(),
}));

vi.mock('../../../server/utils/logger', () => ({
  default: loggerMock,
}));

vi.mock('../../../server/utils/secrets', () => ({
  getSecretOrEnv: getSecretOrEnvMock,
}));

vi.mock('child_process', () => ({
  execSync: execSyncMock,
}));

describe('JenkinsService trigger fallback', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.unstubAllGlobals();

    process.env.JENKINS_URL = 'https://jenkins.wiac.xyz/';
    process.env.JENKINS_USER = 'root';
    process.env.JENKINS_JOB_API = 'SeleniumBaseCi-AutoTest';
    process.env.JENKINS_TEST_REPO_URL = 'https://cnb.cool/ImAcaiy/SeleniumBase-CI.git';
    process.env.JENKINS_TEST_REPO_BRANCH = 'master';

    getSecretOrEnvMock.mockReturnValue('token');
    execSyncMock.mockReturnValue('');
  });

  afterEach(() => {
    delete process.env.JENKINS_URL;
    delete process.env.JENKINS_USER;
    delete process.env.JENKINS_JOB_API;
    delete process.env.JENKINS_TEST_REPO_URL;
    delete process.env.JENKINS_TEST_REPO_BRANCH;
    vi.unstubAllGlobals();
  });

  it('retries batch trigger without crumb when Jenkins rejects the crumb header', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        crumbRequestField: 'Jenkins-Crumb',
        crumb: 'crumb-value',
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response('No valid crumb was included in the request', {
        status: 400,
        statusText: 'Bad Request',
      }))
      .mockResolvedValueOnce(new Response('', {
        status: 201,
        statusText: 'Created',
        headers: { Location: 'https://jenkins.wiac.xyz/queue/item/123/' },
      }));

    vi.stubGlobal('fetch', fetchMock);

    const { JenkinsService } = await import('../../../server/services/JenkinsService');
    const service = new JenkinsService();

    const result = await service.triggerBatchJob(
      4829,
      [3032],
      ['examples/D/test_console_logging.py::TestConsoleLogging::test_console_logging'],
      'https://platform.example.com/api/jenkins/callback'
    );

    expect(result.success).toBe(true);
    expect(result.queueId).toBe(123);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const firstPostHeaders = fetchMock.mock.calls[1][1]?.headers as Record<string, string>;
    expect(firstPostHeaders['Jenkins-Crumb']).toBe('crumb-value');

    const retryPostHeaders = fetchMock.mock.calls[2][1]?.headers as Record<string, string>;
    expect(retryPostHeaders['Jenkins-Crumb']).toBeUndefined();
    expect(retryPostHeaders.Authorization).toBeDefined();
  });
});
