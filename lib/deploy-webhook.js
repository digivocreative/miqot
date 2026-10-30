import { createHmac, timingSafeEqual } from 'node:crypto';

export function verifyDeploySignature(payload, signature, secret) {
  if (!secret || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(payload).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export function createDeployWebhookHandler({ secret, deploy, maxBytes = 1024 * 1024 }) {
  return (req, res) => {
    if (req.method !== 'POST' || req.url !== '/webhook/deploy') {
      res.writeHead(404).end('Not found');
      return;
    }
    let size = 0;
    let rejected = false;
    const chunks = [];
    req.on('data', chunk => {
      if (rejected) return;
      size += chunk.length;
      if (size > maxBytes) {
        rejected = true;
        chunks.length = 0;
        res.writeHead(413).end('Payload too large');
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      const body = Buffer.concat(chunks);
      // Reverse proxies connect from loopback too; loopback is not proof that
      // this is an authorized local request.
      if (!verifyDeploySignature(body, req.headers['x-hub-signature-256'], secret)) {
        res.writeHead(403).end('Forbidden');
        return;
      }
      let payload;
      try { payload = JSON.parse(body.toString('utf8')); } catch {
        res.writeHead(400).end('Invalid JSON');
        return;
      }
      if (payload?.ref !== 'refs/heads/main') {
        res.writeHead(200).end('Ignored (not main branch)');
        return;
      }
      const message = typeof payload.head_commit?.message === 'string' ? payload.head_commit.message.split('\n')[0] : 'unknown';
      const author = typeof payload.head_commit?.author?.name === 'string' ? payload.head_commit.author.name : 'unknown';
      deploy(message, author);
      res.writeHead(200).end('Deploy triggered');
    });
  };
}
