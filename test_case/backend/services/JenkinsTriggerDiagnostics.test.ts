import { describe, expect, it } from 'vitest';

import { buildJenkinsTriggerFailureDiagnostic } from '../../../server/utils/jenkinsTriggerDiagnostics';

describe('buildJenkinsTriggerFailureDiagnostic', () => {
  it('classifies Jenkins crumb and permission failures', () => {
    const diagnostic = buildJenkinsTriggerFailureDiagnostic(
      {
        message: 'Failed to trigger batch job: 403 Forbidden (check Jenkins crumb and Job/Build permission)',
        errorCategory: 'auth_failed',
      },
      {
        baseUrl: 'http://jenkins.wiac.xyz',
        jobName: 'api-automation',
        callbackUrl: 'http://localhost:3000/api/jenkins/callback',
        caseIds: [3032],
        scriptPaths: ['examples/D/test_console_logging.py::TestConsoleLogging::test_console_logging'],
      }
    );

    expect(diagnostic.errorMessage).toBe(
      'Jenkins trigger failed before build start: Jenkins account lacks Job/Build permission.'
    );
    expect(diagnostic.abortReason).toContain('Detail: Failed to trigger batch job: 403 Forbidden');
    expect(diagnostic.errorStack).toContain('phase=trigger');
    expect(diagnostic.errorStack).toContain('kind=permission');
    expect(diagnostic.errorStack).toContain('warning=callback_url_points_to_localhost_while_jenkins_is_remote');
    expect(diagnostic.logPath).toBe('http://jenkins.wiac.xyz/job/api-automation/');
  });

  it('classifies network trigger failures separately', () => {
    const diagnostic = buildJenkinsTriggerFailureDiagnostic({
      message: 'Error triggering batch job: [TypeError] fetch failed',
      errorCategory: 'network',
    });

    expect(diagnostic.errorMessage).toBe(
      'Jenkins trigger failed before build start: Jenkins endpoint was unreachable.'
    );
    expect(diagnostic.errorStack).toContain('kind=network');
  });
});
