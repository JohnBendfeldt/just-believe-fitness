import type { IncomingMessage } from 'node:http';
import react from '@vitejs/plugin-react';
import { loadEnv, type Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

interface NetlifyHandlerResult {
  statusCode: number;
  headers?: Record<string, string>;
  body?: string;
}

interface NetlifyFunctionModule {
  handler: (event: {
    httpMethod: string;
    body: string;
    headers: IncomingMessage['headers'];
  }) => Promise<NetlifyHandlerResult>;
}

const MAX_LOCAL_PROXY_BODY_BYTES = 10 * 1024 * 1024;

function readRequestBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer | string) => {
      const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
      totalBytes += buf.length;
      if (totalBytes > MAX_LOCAL_PROXY_BODY_BYTES) {
        req.destroy();
        reject(new Error('Request payload too large.'));
        return;
      }
      chunks.push(buf);
    });
    req.on('end', () => {
      resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function localNetlifyFunctionsPlugin(): Plugin {
  return {
    name: 'local-netlify-functions',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '');
      for (const [key, value] of Object.entries(env)) {
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }

      server.middlewares.use(async (req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if (pathname !== '/api/garmin-sync' && pathname !== '/api/strava-token') {
          next();
          return;
        }

        try {
          const fnFile =
            pathname === '/api/garmin-sync'
              ? './netlify/functions/garmin-sync.mjs'
              : './netlify/functions/strava-token.mjs';
          const moduleHref = new URL(fnFile, import.meta.url).href;
          const mod = (await import(/* @vite-ignore */ moduleHref)) as NetlifyFunctionModule;
          const body = await readRequestBody(req);
          const result = await mod.handler({
            httpMethod: req.method || 'GET',
            body,
            headers: req.headers,
          });

          res.statusCode = result.statusCode || 200;
          if (result.headers) {
            for (const [key, value] of Object.entries(result.headers)) {
              res.setHeader(key, value);
            }
          }
          res.end(result.body ?? '');
        } catch (err) {
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          res.end(
            JSON.stringify({
              error: err instanceof Error ? err.message : 'Local serverless proxy failed.',
            })
          );
        }
      });
    },
  };
}

function buildVersionManifestPlugin(buildId: string): Plugin {
  const payload = JSON.stringify({ buildId });
  return {
    name: 'jbf-version-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = (req.url || '').split('?')[0];
        if (pathname !== '/version.json') {
          next();
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(payload);
      });
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: payload,
      });
    },
  };
}

const APP_BUILD_ID = process.env.COMMIT_REF || process.env.DEPLOY_ID || `${Date.now()}`;

// https://vite.dev/config/
export default defineConfig({
  define: {
    __JBF_BUILD_ID__: JSON.stringify(APP_BUILD_ID),
  },
  plugins: [react(), localNetlifyFunctionsPlugin(), buildVersionManifestPlugin(APP_BUILD_ID)],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'netlify/**/*.test.mjs'],
    clearMocks: true,
    restoreMocks: true,
  },
});
