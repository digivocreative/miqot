#!/usr/bin/env node
/**
 * Lightweight webhook server that runs on the HOST.
 * Listens on port 9000 for GitHub push events to the main branch,
 * verifies the HMAC signature, then runs the deploy script.
 */

import { createServer } from 'http';
import { execFile } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { createDeployWebhookHandler } from './lib/deploy-webhook.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 9000;
const SECRET = process.env.WEBHOOK_SECRET;

if (!SECRET) {
  console.error('WEBHOOK_SECRET environment variable is required');
  process.exit(1);
}

let deploying = false;

function runDeploy(commitMsg = '', commitAuthor = '') {
  if (deploying) {
    console.log('Deploy already in progress, skipping');
    return;
  }
  deploying = true;
  const script = join(__dirname, 'deploy.sh');
  console.log(`[${new Date().toISOString()}] Starting deploy...`);
  const env = { ...process.env, DEPLOY_COMMIT_MSG: commitMsg, DEPLOY_COMMIT_AUTHOR: commitAuthor };
  execFile('bash', [script], { cwd: __dirname, timeout: 300_000, env }, (err, stdout, stderr) => {
    deploying = false;
    if (err) {
      console.error('Deploy failed:', err.message);
      console.error(stderr);
    } else {
      console.log('Deploy finished successfully');
    }
    if (stdout) console.log(stdout);
  });
}

const server = createServer(createDeployWebhookHandler({ secret: SECRET, deploy: runDeploy }));

server.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});
