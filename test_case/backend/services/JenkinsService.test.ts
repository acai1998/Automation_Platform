import { describe, expect, it } from 'vitest';

import { isMisconfiguredTestRepoUrl } from '../../../server/utils/jenkinsRepoValidation';

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
