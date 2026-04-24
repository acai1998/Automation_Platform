import { describe, expect, it } from 'vitest';

import { normalizeConfiguredJenkinsBaseUrl } from '../../../server/utils/jenkinsUrl';
import { isMisconfiguredTestRepoUrl } from '../../../server/utils/jenkinsRepoValidation';

describe('normalizeConfiguredJenkinsBaseUrl', () => {
  it('normalizes the legacy jenkins.wiac.xyz:8080 endpoint to the https entrypoint', () => {
    expect(normalizeConfiguredJenkinsBaseUrl('http://jenkins.wiac.xyz:8080/')).toBe(
      'https://jenkins.wiac.xyz'
    );
  });

  it('normalizes the legacy www.wiac.xyz:8080 alias to the https Jenkins hostname', () => {
    expect(normalizeConfiguredJenkinsBaseUrl('http://www.wiac.xyz:8080')).toBe(
      'https://jenkins.wiac.xyz'
    );
  });

  it('leaves already-correct Jenkins URLs unchanged', () => {
    expect(normalizeConfiguredJenkinsBaseUrl('https://jenkins.wiac.xyz/')).toBe(
      'https://jenkins.wiac.xyz'
    );
  });
});

describe('isMisconfiguredTestRepoUrl', () => {
  it('returns true when test repo url points to the automation platform repository', () => {
    expect(isMisconfiguredTestRepoUrl(
      'https://cnb.cool/ImAcaiy/Automation_Platform.git',
      'https://cnb.cool/ImAcaiy/Automation_Platform'
    )).toBe(true);
  });

  it('returns false when test repo url points to a different repository', () => {
    expect(isMisconfiguredTestRepoUrl(
      'https://cnb.cool/ImAcaiy/SeleniumBase-CI.git',
      'https://cnb.cool/ImAcaiy/Automation_Platform'
    )).toBe(false);
  });

  it('returns false when one side is missing', () => {
    expect(isMisconfiguredTestRepoUrl(undefined, 'https://cnb.cool/ImAcaiy/Automation_Platform')).toBe(false);
    expect(isMisconfiguredTestRepoUrl('https://cnb.cool/ImAcaiy/SeleniumBase-CI', undefined)).toBe(false);
  });
});
