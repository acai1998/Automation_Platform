import { describe, expect, it } from 'vitest';

import { buildJenkinsTriggerFailureDiagnostic } from '../../../server/utils/jenkinsTriggerDiagnostics';

describe('buildJenkinsTriggerFailureDiagnostic', () => {
  it('keeps generic Jenkins 403 trigger failures as auth failures', () => {
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
      'Jenkins trigger failed before build start: authentication or authorization was rejected by Jenkins.'
    );
    expect(diagnostic.abortReason).toContain('Detail: Failed to trigger batch job: 403 Forbidden');
    expect(diagnostic.errorStack).toContain('phase=trigger');
    expect(diagnostic.errorStack).toContain('kind=auth');
    expect(diagnostic.errorStack).toContain('warning=callback_url_points_to_localhost_while_jenkins_is_remote');
    expect(diagnostic.logPath).toBe('http://jenkins.wiac.xyz/job/api-automation/');
  });

  it('classifies explicit Jenkins Job/Build permission failures', () => {
    const diagnostic = buildJenkinsTriggerFailureDiagnostic({
      message: 'Failed to trigger batch job: 403 Forbidden (Jenkins account lacks required Job/Build permission)',
      errorCategory: 'auth_failed',
    });

    expect(diagnostic.errorMessage).toBe(
      'Jenkins trigger failed before build start: Jenkins account lacks Job/Build permission.'
    );
    expect(diagnostic.errorStack).toContain('kind=permission');
  });

  it('classifies Jenkins crumb failures separately', () => {
    const diagnostic = buildJenkinsTriggerFailureDiagnostic({
      message: 'Failed to trigger batch job: 403 Forbidden (Jenkins crumb rejected or missing)',
      errorCategory: 'auth_failed',
    });

    expect(diagnostic.errorMessage).toBe(
      'Jenkins trigger failed before build start: crumb is missing, invalid, or rejected.'
    );
    expect(diagnostic.errorStack).toContain('kind=crumb');
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

  it('classifies non-parameterized Jenkins jobs explicitly', () => {
    const diagnostic = buildJenkinsTriggerFailureDiagnostic({
      message: 'Failed to trigger batch job: 400 Bad Request Body: <title>Error 400 SeleniumBaseCi-AutoTest is not parameterized</title>',
      errorCategory: 'bad_request',
    });

    expect(diagnostic.errorMessage).toBe(
      'Jenkins trigger failed before build start: target Jenkins job is not parameterized.'
    );
    expect(diagnostic.errorStack).toContain('kind=not_parameterized');
  });
});
