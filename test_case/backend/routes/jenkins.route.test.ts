import { describe, it, expect, vi } from 'vitest';

const { mockExecutionRegistrar, mockCallbackToolRegistrar, mockDiagnosticRegistrar } = vi.hoisted(() => ({
  mockExecutionRegistrar: vi.fn(),
  mockCallbackToolRegistrar: vi.fn(),
  mockDiagnosticRegistrar: vi.fn(),
}));

vi.mock('../../../server/routes/jenkinsExecutionRoutes', () => ({
  registerJenkinsExecutionRoutes: mockExecutionRegistrar,
}));

vi.mock('../../../server/routes/jenkinsCallbackToolRoutes', () => ({
  registerJenkinsCallbackToolRoutes: mockCallbackToolRegistrar,
}));

vi.mock('../../../server/routes/jenkinsDiagnosticRoutes', () => ({
  registerJenkinsDiagnosticRoutes: mockDiagnosticRegistrar,
}));

import jenkinsRouter from '../../../server/routes/jenkins';

describe('jenkins router delegation', () => {
  it('exports a router as default', () => {
    expect(jenkinsRouter).toBeDefined();
    expect(typeof jenkinsRouter).toBe('function');
  });

  it('calls registerJenkinsExecutionRoutes with the router', () => {
    expect(mockExecutionRegistrar).toHaveBeenCalledWith(jenkinsRouter);
  });

  it('calls registerJenkinsCallbackToolRoutes with the router', () => {
    expect(mockCallbackToolRegistrar).toHaveBeenCalledWith(jenkinsRouter);
  });

  it('calls registerJenkinsDiagnosticRoutes with the router', () => {
    expect(mockDiagnosticRegistrar).toHaveBeenCalledWith(jenkinsRouter);
  });

  it('calls each registrar exactly once', () => {
    expect(mockExecutionRegistrar).toHaveBeenCalledTimes(1);
    expect(mockCallbackToolRegistrar).toHaveBeenCalledTimes(1);
    expect(mockDiagnosticRegistrar).toHaveBeenCalledTimes(1);
  });
});
