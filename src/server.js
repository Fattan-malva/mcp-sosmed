import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual } from 'node:crypto';
import { URL } from 'node:url';
import { PLATFORMS, cookieStatus, setCookies, deleteCookies, ValidationError } from './cookies.js';
import { jobs, instagram, linkedin, parseJobs } from './upstream.js';
import { handleMcp } from './mcp.js';

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
  // Cache policy diatur nginx (vhost --no-cache), jangan kirim header kedua.
  createReadStream(file).pipe(res);
  return true;
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

/** Cek token admin (ADMIN_TOKEN). Dipakai untuk /mcp, cookie, dan get dengan cookie. */
function authorize(req) {
  const expected = process.env.ADMIN_TOKEN || '';
  if (!expected) return { ok: false, status: 503, error: 'ADMIN_TOKEN belum diatur di server' };
  const header = req.headers.authorization || '';
  const provided = header.startsWith('Bearer ') ? header.slice(7) : String(req.headers['x-admin-token'] || '');
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return { ok: false, status: 401, error: 'Unauthorized' };
  return { ok: true };
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
      const auth = authorize(req);
      if (!auth.ok) return json(res, auth.status, { error: auth.error });
      const raw = req.method === 'POST' ? await readBody(req, 1024 * 1024) : '';
      const body = raw ? JSON.parse(raw) : undefined;
      return await handleMcp(req, res, body);
    }

    if (url.pathname.startsWith('/api/')) {
      // Jobs publik, tidak butuh cookie.
      if (url.pathname === '/api/jobs') return json(res, 200, { data: await jobs(Object.fromEntries(url.searchParams)) });

      const auth = authorize(req);
      if (!auth.ok) return json(res, auth.status, { error: auth.error });

      if (url.pathname === '/api/cookies' && req.method === 'GET') return json(res, 200, { data: await cookieStatus() });

      const cookieRoute = url.pathname.match(/^\/api\/cookies\/([a-z]+)$/);
      if (cookieRoute) {
        const platform = cookieRoute[1];
        if (!Object.hasOwn(PLATFORMS, platform)) return json(res, 404, { error: 'Platform tidak dikenal' });
        if (req.method === 'PUT') {
          const payload = JSON.parse((await readBody(req)) || '{}');
          return json(res, 200, { data: await setCookies(platform, payload.cookies) });
        }
        if (req.method === 'DELETE') return json(res, 200, { data: await deleteCookies(platform) });
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
    // ValidationError &413 membawa status sendiri; error upstream dianggap 502.
    return json(res, error.status ?? 502, { error: error.message });
  }
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
}

export { parseJobs, server };
