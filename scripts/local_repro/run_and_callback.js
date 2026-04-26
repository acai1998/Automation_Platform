const http = require('http');

const HOST = process.env.HOST || 'localhost';
const PORT = parseInt(process.env.PORT || '3000', 10);
const CASE_ID = parseInt(process.env.CASE_ID || '3032', 10);
const PROJECT_ID = parseInt(process.env.PROJECT_ID || '1', 10);

function post(path, obj) {
  const data = JSON.stringify(obj);
  const opts = {
    hostname: HOST,
    port: PORT,
    path,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data),
    },
  };

  return new Promise((resolve, reject) => {
    const req = http.request(opts, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body || '{}');
          resolve({ statusCode: res.statusCode, body: parsed });
        } catch (err) {
          resolve({ statusCode: res.statusCode, body: body });
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

(async () => {
  try {
    console.log(`Triggering run-case -> caseId=${CASE_ID} projectId=${PROJECT_ID} on ${HOST}:${PORT}`);
    const trigger = await post('/api/jenkins/run-case', { caseId: CASE_ID, projectId: PROJECT_ID });
    console.log('trigger response:', trigger.statusCode, JSON.stringify(trigger.body));

    if (!trigger.body || !trigger.body.data || !trigger.body.data.runId) {
      console.error('No runId returned, aborting.');
      process.exit(2);
    }

    const runId = trigger.body.data.runId;
    console.log('Got runId:', runId);

    // 等待几秒钟模拟 Jenkins 执行
    await new Promise((r) => setTimeout(r, 3000));

    console.log('Sending simulated callback (success) for runId', runId);
    const callbackPayload = {
      runId,
      status: 'success',
      passedCases: 1,
      failedCases: 0,
      skippedCases: 0,
      durationMs: 1000,
      results: [
        {
          caseId: CASE_ID,
          caseName: 'local_repro_case',
          status: 'passed',
          duration: 1000,
        },
      ],
    };

    const cb = await post('/api/jenkins/callback/test', callbackPayload);
    console.log('callback response:', cb.statusCode, JSON.stringify(cb.body));

    console.log('Done.');
  } catch (err) {
    console.error('Error:', err && err.message ? err.message : err);
    process.exit(1);
  }
})();
