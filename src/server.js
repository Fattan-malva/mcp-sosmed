import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { PLATFORMS, cookieStatus, setCookies, deleteCookies } from './cookies.js';
import { jobs, instagram, linkedin, parseJobs } from './upstream.js';
import { handleMcp } from './mcp.js';
import { handleInstagramApi } from './instagram/routes.js';
import { listApiKeys, createApiKey, revokeApiKey, verifyApiKey } from './apikeys.js';
import { chatWithTools, agentTools } from './agent.js';
import { ValidationError } from './cookies.js';
import { MODULES, listModules, scrape, SocialError } from './social/snscrape.js';
import { listSources, addSource, removeSource, lokerFeed } from './social/loker.js';

const PORT = Number(process.env.PORT || 3000);

// Hasil `npm run build` di web/ (Next.js static export, trailingSlash).
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'web', 'out');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2',
};

function serveStatic(pathname, res) {
  if (!existsSync(ROOT)) return false;
  const rel = decodeURIComponent(pathname);
  let file = path.join(ROOT, rel);
  if (!file.startsWith(ROOT)) return false;
  if (existsSync(file) && statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!existsSync(file) && rel !== '/' && !path.extname(rel)) file = path.join(ROOT, rel, 'index.html');
  if (!existsSync(file)) return false;
  res.setHeader('content-type', TYPES[path.extname(file)] ?? 'application/octet-stream');
  createReadStream(file).pipe(res);
  return true;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

function bearer(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : String(req.headers['x-admin-token'] || '');
}

const safeEqual = (a, b) => {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

/**
 * Autentikasi:
 *  - token admin (ADMIN_TOKEN): akses penuh (pengelolaan key, cookie, MCP, AI Test, data).
 *  - API key msk_... aktif: HANYA untuk mengambil data hasil fetch Instagram/LinkedIn
 *    (GET /api/instagram/*, /api/linkedin). Bukan untuk AI maupun MCP.
 * adminOnly: endpoint yang hanya boleh dengan token admin.
 */
async function authorize(req, { adminOnly = false } = {}) {
  const provided = bearer(req);
  const adminToken = process.env.ADMIN_TOKEN || '';

  if (!adminToken) return { ok: false, status: 503, error: 'ADMIN_TOKEN belum diatur di server' };
  if (provided && safeEqual(provided, adminToken)) return { ok: true, role: 'admin' };

  if (!adminOnly) {
    const key = await verifyApiKey(provided);
    if (key) return { ok: true, role: 'apikey', key };
  }
  return { ok: false, status: 401, error: 'Unauthorized' };
}

async function readBody(req, limit = 64 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw Object.assign(new Error('Body terlalu besar'), { status: 413 });
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

const readJson = async (req, limit) => JSON.parse((await readBody(req, limit)) || '{}');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('access-control-allow-origin', '*');

  if (req.method === 'OPTIONS') {
    res.setHeader('access-control-allow-headers', 'authorization, content-type, x-admin-token, mcp-session-id, mcp-protocol-version');
    res.setHeader('access-control-allow-methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.statusCode = 204;
    return res.end();
  }

  if (url.pathname === '/health') return json(res, 200, { ok: true });

  try {
    if (url.pathname === '/mcp') {
      const auth = await authorize(req, { adminOnly: true });
      if (!auth.ok) return json(res, auth.status, { error: auth.error });
      const raw = req.method === 'POST' ? await readBody(req, 1024 * 1024) : '';
      const body = raw ? JSON.parse(raw) : undefined;
      return await handleMcp(req, res, body);
    }

    if (url.pathname.startsWith('/api/')) {
      // Jobs publik, tidak butuh auth.
      if (url.pathname === '/api/jobs') return json(res, 200, { data: await jobs(Object.fromEntries(url.searchParams)) });

      // Pengelolaan API key: hanya token admin.
      if (url.pathname === '/api/keys' || url.pathname.startsWith('/api/keys/')) {
        const auth = await authorize(req, { adminOnly: true });
        if (!auth.ok) return json(res, auth.status, { error: auth.error });

        if (url.pathname === '/api/keys' && req.method === 'GET') return json(res, 200, { data: await listApiKeys() });
        if (url.pathname === '/api/keys' && req.method === 'POST') {
          const payload = await readJson(req);
          return json(res, 201, { data: await createApiKey(payload.name) });
        }
        const keyId = url.pathname.match(/^\/api\/keys\/([\w-]+)$/);
        if (keyId && req.method === 'DELETE') return json(res, 200, { data: await revokeApiKey(keyId[1]) });
        return json(res, 404, { error: 'Not found' });
      }

      // AI Test: hanya token admin.
      if (url.pathname.startsWith('/api/agent/')) {
        const admin = await authorize(req, { adminOnly: true });
        if (!admin.ok) return json(res, admin.status, { error: admin.error });
        if (url.pathname === '/api/agent/tools' && req.method === 'GET') return json(res, 200, { data: agentTools() });
        if (url.pathname === '/api/agent/chat' && req.method === 'POST') {
          const payload = await readJson(req, 256 * 1024);
          return json(res, 200, { data: await chatWithTools(payload) });
        }
        return json(res, 404, { error: 'Not found' });
      }

      // Data Instagram/LinkedIn: boleh token admin atau API key (read-only).
      const auth = await authorize(req);
      if (!auth.ok) return json(res, auth.status, { error: auth.error });

      if (url.pathname.startsWith('/api/instagram/')) {
        return json(res, 200, await handleInstagramApi(req.method, url.pathname, url.searchParams));
      }

      // snscrape (Instagram/Facebook/Mastodon publik, Telegram) dan sumber loker.
      if (url.pathname.startsWith('/api/social/')) {
        if (url.pathname.startsWith('/api/social/loker/sources') && (req.method === 'POST' || req.method === 'DELETE')) {
          const admin = await authorize(req, { adminOnly: true });
          if (!admin.ok) return json(res, admin.status, { error: admin.error });
          if (req.method === 'POST') return json(res, 201, { data: await addSource(await readJson(req)) });
          const sourceId = url.pathname.match(/^\/api\/social\/loker\/sources\/([\w-]+)$/);
          if (sourceId) return json(res, 200, { data: await removeSource(sourceId[1]) });
          return json(res, 404, { error: 'Not found' });
        }
        if (req.method !== 'GET') return json(res, 405, { error: 'Method not allowed' });
        if (url.pathname === '/api/social/modules') return json(res, 200, { data: listModules() });
        if (url.pathname === '/api/social/scrape') {
          const q = url.searchParams;
          return json(res, 200, { data: await scrape({ module: q.get('module'), target: q.get('target'), limit: q.get('limit') ?? undefined, since: q.get('since') || undefined }) });
        }
        if (url.pathname === '/api/social/loker/sources') return json(res, 200, { data: listSources() });
        if (url.pathname === '/api/social/loker') {
          const q = url.searchParams;
          return json(res, 200, await lokerFeed({ keywords: q.get('keywords') || undefined, limit: q.get('limit') || undefined }));
        }
        return json(res, 404, { error: 'Not found' });
      }

      // Cookie: baca dan tulis hanya token admin.
      if (url.pathname === '/api/cookies' && req.method === 'GET') {
        const admin = await authorize(req, { adminOnly: true });
        if (!admin.ok) return json(res, admin.status, { error: admin.error });
        return json(res, 200, { data: await cookieStatus() });
      }

      const cookieRoute = url.pathname.match(/^\/api\/cookies\/([a-z]+)$/);
      if (cookieRoute) {
        const platform = cookieRoute[1];
        if (!Object.hasOwn(PLATFORMS, platform)) return json(res, 404, { error: 'Platform tidak dikenal' });
        if (req.method === 'PUT' || req.method === 'DELETE') {
          const admin = await authorize(req, { adminOnly: true });
          if (!admin.ok) return json(res, admin.status, { error: admin.error });
          if (req.method === 'PUT') {
            const payload = await readJson(req);
            return json(res, 200, { data: await setCookies(platform, payload.cookies) });
          }
          return json(res, 200, { data: await deleteCookies(platform) });
        }
        return json(res, 405, { error: 'Method not allowed' });
      }

      if (url.pathname === '/api/instagram' && req.method === 'GET') return json(res, 200, { data: await instagram(url.searchParams.get('url')) });
      if (url.pathname === '/api/linkedin' && req.method === 'GET') return json(res, 200, { data: await linkedin(url.searchParams.get('url')) });

      return json(res, 404, { error: 'Not found' });
    }

    if (serveStatic(url.pathname, res)) return;
    return json(res, 404, { error: 'Not found' });
  } catch (error) {
    if (error instanceof SyntaxError) return json(res, 400, { error: 'Body JSON tidak valid' });
    if (error instanceof ValidationError) return json(res, 400, { error: error.message, code: 'VALIDATION' });
    // Error upstream dan error lain tanpa status dianggap 502/500.
    return json(res, error.status ?? 502, { error: error.message, code: error.code ?? null, meta: error.meta ?? null });
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
}

export { parseJobs, server };
