import { Router } from 'express';
import { registerJenkinsCallbackToolRoutes } from './jenkinsCallbackToolRoutes';
import { registerJenkinsDiagnosticRoutes } from './jenkinsDiagnosticRoutes';
import { registerJenkinsExecutionRoutes } from './jenkinsExecutionRoutes';

const router = Router();

registerJenkinsExecutionRoutes(router);
registerJenkinsCallbackToolRoutes(router);
registerJenkinsDiagnosticRoutes(router);

export default router;
