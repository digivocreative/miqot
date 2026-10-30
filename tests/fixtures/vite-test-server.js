import { createServer as createHttpServer } from 'node:http';
import { createServer as createViteServer } from 'vite';

// Vite 6 treats config.server.port=0 as its default port. Parallel test files
// then collide on 5173. Middleware mode lets Node reserve an actual ephemeral
// port atomically. HMR uses that same HTTP server, so Vite's injected client
// does not open a failing connection to a separate default WebSocket port.
export async function createServer(config) {
  const http = createHttpServer();
  const vite = await createViteServer({
    ...config,
    server: { ...config.server, middlewareMode: true, hmr: { server: http } },
  });
  http.on('request', vite.middlewares);
  const closeVite = vite.close.bind(vite);
  return Object.assign(vite, {
    httpServer: http,
    async listen() {
      await new Promise((resolve, reject) => {
        http.once('error', reject);
        http.listen(0, config.server?.host || '127.0.0.1', () => {
          http.off('error', reject);
          vite.config.server.port = http.address().port;
          resolve();
        });
      });
    },
    async close() {
      await closeVite();
      http.closeAllConnections();
      await new Promise(resolve => http.close(resolve));
    },
  });
}
