import { describe, expect, it } from 'vitest';

import {
  findMissingScriptPaths,
  normalizeRequestedScriptPath,
} from '../../../server/utils/testRepoScriptPathValidator';

describe('testRepoScriptPathValidator', () => {
  it('normalizes pytest node ids to repository file paths', () => {
    expect(normalizeRequestedScriptPath('examples/D/test_console_logging.py::TestConsoleLogging::test_console_logging'))
      .toBe('examples/D/test_console_logging.py');
    expect(normalizeRequestedScriptPath('\\examples\\D\\test_console_logging.py'))
      .toBe('examples/D/test_console_logging.py');
  });

  it('finds script paths missing from the repository snapshot', () => {
    const existingPaths = new Set([
      'examples/A/test_login.py',
      'examples/D/test_console_logging.py',
    ]);

    const missingPaths = findMissingScriptPaths(
      [
        'examples/A/test_login.py::TestLogin::test_ok',
        'examples/Z/test_missing.py::TestMissing::test_missing',
      ],
      (relativePath) => existingPaths.has(relativePath)
    );

    expect(missingPaths).toEqual([
      'examples/Z/test_missing.py::TestMissing::test_missing',
    ]);
  });
});
