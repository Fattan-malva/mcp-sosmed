import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, mkdirSync, writeFileSync, renameSync, chmodSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES, SocialError, scrape } from './snscrape.js';

// Sumber loker: daftar akun/channel/hashtag yang sering memposting lowongan.
// Disimpan di data/loker-sources.json (ikut volume Docker, tidak di-commit).

const here = path.dirname(fileURLToPath(import.meta.url));
const FILE = process.env.LOKER_SOURCES_FILE || path.join(process.env.DATA_DIR || path.join(here, '..', '..'), 'data', 'loker-sources.json');

// Kata kunci default (tidak case-sensitive, pencocokan substring).
export const DEFAULT_KEYWORDS = ['loker', 'lowongan', 'hiring', 'we are hiring', 'dibutuhkan', 'vacancy', 'job opening', 'karir'];

function read() {
  try {
    if (!existsSync(FILE)) return { sources: [] };
    const parsed = JSON.parse(readFileSync(FILE, 'utf8'));
    return { sources: Array.isArray(parsed.sources) ? parsed.sources : [] };
  } catch {
    return { sources: [] };
  }
}

// Penulisan atomik (tmp + rename), mode 0600.
function write(data) {
  mkdirSync(path.dirname(FILE), { recursive: true });
  const tmp = `${FILE}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), { mode: 0o600 });
  chmodSync(tmp, 0o600);
  renameSync(tmp, FILE);
}

let chain = Promise.resolve();
const serial = (fn) => {
  const run = chain.then(fn, fn);
  chain = run.catch(() => {});
  return run;
};

export function listSources() {
  return read().sources;
}

export function addSource({ name, module, target } = {}) {
  if (!MODULES[module]) throw new SocialError(`Modul "${module}" tidak tersedia.`, { code: 'MODULE_NOT_ALLOWED' });
  const label = String(name ?? '').trim();
  if (!label || label.length > 80) throw new SocialError('Nama sumber wajib, maks 80 karakter.', { code: 'INVALID_NAME' });
  const value = String(target ?? '').trim();
  if (!value || value.length > 300 || /[\s\0]/.test(value) || value.startsWith('-')) {
    throw new SocialError('Target tidak valid.', { code: 'INVALID_TARGET' });
  }
  return serial(() => {
    const data = read();
    const source = { id: randomBytes(6).toString('hex'), name: label, module, target: value, createdAt: new Date().toISOString() };
    data.sources.push(source);
    write(data);
    return source;
  });
}

export function removeSource(id) {
  return serial(() => {
    const data = read();
    const before = data.sources.length;
    data.sources = data.sources.filter((s) => s.id !== id);
    if (data.sources.length === before) throw new SocialError('Sumber tidak ditemukan.', { status: 404, code: 'NOT_FOUND' });
    write(data);
    return { id, removed: true };
  });
}

const parseKeywords = (raw) => {
  if (!raw) return DEFAULT_KEYWORDS;
  const list = String(raw).split(',').map((k) => k.trim().toLowerCase()).filter(Boolean).slice(0, 20);
  return list.length ? list : DEFAULT_KEYWORDS;
};

const textOf = (item) => [item.content, item.renderedContent, item.title, item.description, item.username]
  .filter((v) => typeof v === 'string')
  .join(' ')
  .toLowerCase();

/** Ambil postingan terbaru dari semua sumber lalu saring dengan kata kunci loker. */
export async function lokerFeed({ keywords, limit = 20, perSource = 30 } = {}) {
  const words = parseKeywords(keywords);
  const sources = listSources();
  const seen = new Set();
  const results = [];
  const warnings = [];

  for (const source of sources) {
    try {
      const { items, warning } = await scrape({ module: source.module, target: source.target, limit: perSource });
      if (warning) warnings.push({ source: source.name, warning });
      for (const item of items) {
        const text = textOf(item);
        if (!words.some((w) => text.includes(w))) continue;
        const key = item.url || `${source.id}:${item.id ?? text.slice(0, 80)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        results.push({ ...item, source: { id: source.id, name: source.name, module: source.module } });
      }
    } catch (err) {
      warnings.push({ source: source.name, warning: err.message });
    }
  }

  results.sort((a, b) => String(b.date ?? '').localeCompare(String(a.date ?? '')));
  return {
    data: results.slice(0, Math.min(200, Math.max(1, Number(limit) || 20))),
    meta: { sources: sources.length, keywords: words, warnings },
  };
}
