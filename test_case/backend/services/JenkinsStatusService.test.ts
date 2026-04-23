import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../server/utils/secrets', () => ({
  getSecretOrEnv: vi.fn(() => 'test-token'),
}));

vi.mock('../../../server/utils/logger', () => ({
  LogLevel: {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
  },
  default: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    errorLog: vi.fn(),
  },
}));

import {
  extractCaseNameFromNodeId,
  extractJenkinsLogDiagnostics,
} from '../../../server/services/JenkinsStatusService';

describe('JenkinsStatusService diagnostics', () => {
  it('extracts actionable diagnostics from a failed Jenkins console log', () => {
    const log = [
      '❌ SCRIPT_PATHS 校验失败，以下路径在仓库中不存在：',
      '- examples/D/test_console_logging.py::TestConsoleLogging::test_console_logging -> examples/D/test_console_logging.py',
      '请先修正 Auto_TestCase.script_path，再重新触发 Jenkins。',
      '[00:40:10] docker-run done, exitCode=2',
      '❌ 测试执行失败，exitCode=2',
      'http_code=403',
      '⚠️ 失败回调发送异常，status=0:403, body=Forbidden',
      'Jenkins trigger failed: Failed to trigger batch job: 403 Forbidden (check Jenkins crumb and Job/Build permission)',
    ].join('\n');

    const diagnostics = extractJenkinsLogDiagnostics(log);

    expect(diagnostics.missingScriptPaths).toEqual([
      {
        nodeId: 'examples/D/test_console_logging.py::TestConsoleLogging::test_console_logging',
        filePath: 'examples/D/test_console_logging.py',
      },
    ]);
    expect(diagnostics.exitCode).toBe(2);
    expect(diagnostics.callbackStatus).toBe('0:403');
    expect(diagnostics.messages).toEqual(
      expect.arrayContaining([
        expect.stringContaining('SCRIPT_PATHS validation failed'),
        'Jenkins test runner exited with code 2',
        'Jenkins callback failed with status 0:403',
        'Jenkins returned 403 Forbidden; check crumb, credentials, and Job/Build permission',
      ])
    );
    expect(diagnostics.excerpt).toContain('SCRIPT_PATHS');
    expect(diagnostics.excerpt).toContain('http_code=403');
  });

  it('uses the pytest method name as the platform result fallback key', () => {
    expect(
      extractCaseNameFromNodeId('examples/D/test_console_logging.py::TestConsoleLogging::test_console_logging')
    ).toBe('test_console_logging');
  });
});
