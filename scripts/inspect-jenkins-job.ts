import 'dotenv/config';

import fs from 'fs';
import path from 'path';

import { JenkinsService } from '../server/services/JenkinsService';

function resolveSavePath(args: string[]): string | null {
  const flagIndex = args.findIndex((arg) => arg === '--save-config');
  if (flagIndex === -1) {
    return null;
  }

  const nextValue = args[flagIndex + 1];
  if (!nextValue) {
    throw new Error('Missing file path after --save-config');
  }

  return path.isAbsolute(nextValue)
    ? nextValue
    : path.resolve(process.cwd(), nextValue);
}

void (async () => {
  const args = process.argv.slice(2);
  const savePath = resolveSavePath(args);
  const service = new JenkinsService();

  if (!service.isEnabled()) {
    console.error('Jenkins integration is not enabled. Check JENKINS_URL, JENKINS_USER, and JENKINS_TOKEN.');
    process.exit(1);
  }

  const inspection = await service.inspectConfiguredApiJob();
  if (!inspection) {
    console.error('Unable to inspect the configured Jenkins API job.');
    process.exit(1);
  }

  console.log(JSON.stringify(inspection, null, 2));

  if (savePath) {
    const configXml = await service.fetchConfiguredApiJobConfigXml();
    if (!configXml) {
      console.error('Unable to export Jenkins config.xml for the configured job.');
      process.exit(1);
    }

    fs.mkdirSync(path.dirname(savePath), { recursive: true });
    fs.writeFileSync(savePath, configXml, 'utf8');
    console.log(`Saved Jenkins config.xml to ${savePath}`);
  }

  process.exit(inspection.triggerReady ? 0 : 2);
})().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
