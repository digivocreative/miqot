#!/usr/bin/env node
/**
 * Lightweight webhook server that runs on the HOST.
 * Listens on port 9000 for GitHub push events to the main branch,
 * verifies the HMAC signature, then runs the deploy script.
 */

import { createServer } from 'http';
import { createHmac } from 'crypto';
import { execFile } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = 9000;
const SECRET = process.env.WEBHOOK_SECRET;

if (!SECRET) {
  console.error('WEBHOOK_SECRET environment variable is required');
  process.exit(1);
}

function verifySignature(payload, signature) {
  if (!signature) return false;
  const hmac = createHmac('sha256', SECRET);
  hmac.update(payload);
  const expected = 'sha256=' + hmac.digest('hex');
  return signature.length === expected.length &&
    createHmac('sha256', SECRET).update(signature).digest().equals(
      createHmac('sha256', SECRET).update(expected).digest()
    );
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

const server = createServer((req, res) => {
  if (req.method === 'POST' && req.url === '/webhook/deploy') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      const remoteAddr = req.socket.remoteAddress;
      const isLocal = remoteAddr === '127.0.0.1' || remoteAddr === '::1' || remoteAddr === '::ffff:127.0.0.1';

      if (!isLocal) {
        const sig = req.headers['x-hub-signature-256'];
        if (!verifySignature(body, sig)) {
          console.warn('Invalid signature from', remoteAddr);
          res.writeHead(403);
          res.end('Forbidden');
          return;
        }
      } else {
        console.log('Local request from', remoteAddr, '— skipping signature verification');
      }

      let payload;
      try {
        payload = JSON.parse(body);
        if (payload.ref !== 'refs/heads/main') {
          res.writeHead(200);
          res.end('Ignored (not main branch)');
          return;
        }
      } catch {
        res.writeHead(400);
        res.end('Invalid JSON');
        return;
      }

      const commitMsg = payload.head_commit?.message || 'unknown';
      const commitAuthor = payload.head_commit?.author?.name || 'unknown';
      console.log(`Commit by ${commitAuthor}: ${commitMsg.split('\n')[0]}`);

      runDeploy(commitMsg.split('\n')[0], commitAuthor);
      res.writeHead(200);
      res.end('Deploy triggered');
    });
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

server.listen(PORT, () => {
  console.log(`Webhook server listening on port ${PORT}`);
});
