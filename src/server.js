import http from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';

const PORT = Number(process.env.PORT || 3000);
const UA = 'Mozilla/5.0 (compatible; PublicSocialAPI/1.0)';

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

function meta(html, property) {
  const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'))
    || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, 'i'));
  return m?.[1]?.replace(/&amp;/g, '&').replace(/&quot;/g, '"') || null;
}

async function instagram(input) {
  let target;
  try { target = new URL(input); } catch { throw new Error('Invalid Instagram URL'); }
  if (!['instagram.com', 'www.instagram.com'].includes(target.hostname)) throw new Error('Only instagram.com URLs are allowed');
  const response = await fetch(target, { headers: { 'user-agent': UA, accept: 'text/html' }, redirect: 'follow' });
  if (!response.ok) throw new Error(`Instagram returned ${response.status}`);
  const html = await response.text();
  return {
    url: response.url,
    title: meta(html, 'og:title'),
    description: meta(html, 'og:description'),
    image: meta(html, 'og:image'),
    type: meta(html, 'og:type')
  };
}

function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

function attr(html, name) {
  const m = html.match(new RegExp(`${name}="([^"]*)"`, 'i'));
  return m ? m[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"') : null;
}

function parseJobs(html) {
  return [...html.matchAll(/<li>[\s\S]*?<\/li>/gi)].map(({ 0: card }) => {
    const id = card.match(/jobPosting:(\d+)/)?.[1];
    if (!id) return null;
    return {
      id,
      title: text(card.match(/<h3[^>]*>([\s\S]*?)<\/h3>/i)?.[1] || ''),
      company: text(card.match(/<h4[^>]*>([\s\S]*?)<\/h4>/i)?.[1] || ''),
      location: text(card.match(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/i)?.[1] || ''),
      postedAt: attr(card.match(/<time[\s\S]*?<\/time>/i)?.[0] || '', 'datetime'),
      url: (attr(card.match(/<a[^>]+base-card__full-link[^>]*>/i)?.[0] || '', 'href') || '').replace(/&amp;/g, '&')
    };
  }).filter(Boolean);
}

async function jobs(query) {
  const p = new URLSearchParams({ keywords: query.keywords || '', location: query.location || '', start: String(query.start || 0) });
  const response = await fetch(`https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?${p}`, { headers: { 'user-agent': UA } });
  if (!response.ok) throw new Error(`LinkedIn returned ${response.status}`);
  return parseJobs(await response.text());
}

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader('content-type', 'application/json; charset=utf-8');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  res.setHeader('access-control-allow-origin', '*');

  if (url.pathname === '/health') return json(res, 200, { ok: true });
  if (url.pathname.startsWith('/api/')) {
    try {
      if (url.pathname === '/api/jobs') return json(res, 200, { data: await jobs(Object.fromEntries(url.searchParams)) });
      if (url.pathname === '/api/instagram') return json(res, 200, { data: await instagram(url.searchParams.get('url')) });
      return json(res, 404, { error: 'Not found' });
    } catch (error) {
      return json(res, 502, { error: error.message });
    }
  }

  if (serveStatic(url.pathname, res)) return;
  json(res, 404, { error: 'Not found' });
});

if (import.meta.url === `file://${process.argv[1]}`) {
  server.listen(PORT, () => console.log(`Server listening on http://localhost:${PORT}`));
}

export { parseJobs };
