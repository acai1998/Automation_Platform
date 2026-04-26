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

describe('JenkinsService job inspection', () => {
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

  it('reports a trigger-ready SCM Pipeline job with expected parameters', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        _class: 'org.jenkinsci.plugins.workflow.job.WorkflowJob',
        actions: [
          {
            parameterDefinitions: [
              { name: 'RUN_ID' },
              { name: 'CASE_IDS' },
              { name: 'SCRIPT_PATHS' },
              { name: 'CALLBACK_URL' },
              { name: 'REPO_URL' },
              { name: 'REPO_BRANCH' },
            ],
          },
        ],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(`
        <flow-definition plugin="workflow-job">
          <definition class="org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition" plugin="workflow-cps">
            <scm class="hudson.plugins.git.GitSCM" plugin="git">
              <userRemoteConfigs>
                <hudson.plugins.git.UserRemoteConfig>
                  <url>https://cnb.cool/ImAcaiy/SeleniumBase-CI.git</url>
                </hudson.plugins.git.UserRemoteConfig>
              </userRemoteConfigs>
              <branches>
                <hudson.plugins.git.BranchSpec>
                  <name>*/master</name>
                </hudson.plugins.git.BranchSpec>
              </branches>
            </scm>
            <scriptPath>Jenkinsfile</scriptPath>
          </definition>
          <properties>
            <hudson.model.ParametersDefinitionProperty>
              <parameterDefinitions>
                <hudson.model.StringParameterDefinition><name>RUN_ID</name></hudson.model.StringParameterDefinition>
              </parameterDefinitions>
            </hudson.model.ParametersDefinitionProperty>
          </properties>
          <triggers />
        </flow-definition>
      `, {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      }));

    vi.stubGlobal('fetch', fetchMock);

    const { JenkinsService } = await import('../../../server/services/JenkinsService');
    const service = new JenkinsService();
    const inspection = await service.inspectConfiguredApiJob();

    expect(inspection).not.toBeNull();
    expect(inspection?.parameterized).toBe(true);
    expect(inspection?.triggerReady).toBe(true);
    expect(inspection?.definitionClass).toBe('org.jenkinsci.plugins.workflow.cps.CpsScmFlowDefinition');
    expect(inspection?.scriptPath).toBe('Jenkinsfile');
    expect(inspection?.parameterNames).toContain('RUN_ID');
    expect(inspection?.hasTimerTrigger).toBe(false);
    expect(inspection?.issues).toHaveLength(0);
  });

  it('flags a non-parameterized inline Pipeline job with a timer trigger', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        _class: 'org.jenkinsci.plugins.workflow.job.WorkflowJob',
        actions: [],
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(`
        <flow-definition plugin="workflow-job">
          <definition class="org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition" plugin="workflow-cps">
            <script>pipeline { agent any }</script>
          </definition>
          <triggers>
            <hudson.triggers.TimerTrigger>
              <spec>H/5 * * * *</spec>
            </hudson.triggers.TimerTrigger>
          </triggers>
        </flow-definition>
      `, {
        status: 200,
        headers: { 'Content-Type': 'application/xml' },
      }));

    vi.stubGlobal('fetch', fetchMock);

    const { JenkinsService } = await import('../../../server/services/JenkinsService');
    const service = new JenkinsService();
    const inspection = await service.inspectConfiguredApiJob();

    expect(inspection).not.toBeNull();
    expect(inspection?.parameterized).toBe(false);
    expect(inspection?.triggerReady).toBe(false);
    expect(inspection?.definitionClass).toBe('org.jenkinsci.plugins.workflow.cps.CpsFlowDefinition');
    expect(inspection?.hasTimerTrigger).toBe(true);
    expect(inspection?.issues).toContain('Target Jenkins job is not parameterized');
    expect(inspection?.issues).toContain('Pipeline job is not using Pipeline script from SCM');
    expect(inspection?.issues).toContain('Jenkins Timer Trigger is enabled on the target job');
  });
});
