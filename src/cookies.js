import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Cookie sesi per platform. Semua data disimpan di satu file JSON
// (default: data/cookies.json, bisa diganti env COOKIE_FILE).
export const PLATFORMS = {
  instagram: { label: 'Instagram', required: ['sessionid'] },
  linkedin: { label: 'LinkedIn', required: ['li_at'] },
};

const MAX_INPUT_CHARS = 20_000;

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

export function assertPlatform(platform) {
  if (!Object.hasOwn(PLATFORMS, platform)) throw new ValidationError(`Platform tidak dikenal: ${platform}`);
}

export function cookieFilePath() {
  if (process.env.COOKIE_FILE) return path.resolve(process.env.COOKIE_FILE);
  const dataDir = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  return path.join(dataDir, 'cookies.json');
}

/**
 * Terima cookie dalam 3 bentuk:
 *  - string header:  "sessionid=abc; csrftoken=xyz"
 *  - JSON array:     [{"name":"sessionid","value":"abc"}, ...] (format export browser)
 *  - JSON object:    {"sessionid":"abc", ...}
 */
export function parseCookieInput(raw) {
  if (typeof raw === 'string' && raw.length > MAX_INPUT_CHARS) throw new ValidationError('Input cookie terlalu panjang');

  let list;
  if (Array.isArray(raw)) {
    list = raw;
  } else if (raw && typeof raw === 'object') {
    list = Object.entries(raw).map(([name, value]) => ({ name, value }));
  } else if (typeof raw === 'string') {
    const s = raw.trim();
    if (!s) throw new ValidationError('Cookie kosong');
    if (s.startsWith('[') || s.startsWith('{')) {
      let parsed;
      try { parsed = JSON.parse(s); } catch { throw new ValidationError('Format JSON cookie tidak valid'); }
      return parseCookieInput(parsed);
    }
    list = s.split(';').map((part) => {
      const i = part.indexOf('=');
      if (i < 1) return null;
      return { name: part.slice(0, i).trim(), value: part.slice(i + 1).trim() };
    });
  } else {
    throw new ValidationError('Cookie harus berupa teks atau objek');
  }

  const map = new Map();
  for (const c of list) {
    const name = String(c?.name ?? '').trim();
    const value = String(c?.value ?? '').trim();
    if (name && value) map.set(name, value);
  }
  return [...map].map(([name, value]) => ({ name, value }));
}

let queue = Promise.resolve();
function serialize(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

async function readStore() {
  try {
    return JSON.parse(await fs.readFile(cookieFilePath(), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return {};
    throw error;
  }
}

async function writeStore(store) {
  const file = cookieFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
}

function statusOf(platform, store) {
  const entry = store[platform];
  const names = entry?.cookies?.map((c) => c.name) ?? [];
  const missing = PLATFORMS[platform].required.filter((n) => !names.includes(n));
  return {
    platform,
    label: PLATFORMS[platform].label,
    configured: names.length > 0 && missing.length === 0,
    missingRequired: missing,
    cookieNames: names,
    updatedAt: entry?.updatedAt ?? null,
  };
}

export function cookieStatus() {
  return serialize(async () => {
    const store = await readStore();
    return Object.keys(PLATFORMS).map((p) => statusOf(p, store));
  });
}

export function setCookies(platform, raw) {
  assertPlatform(platform);
  const cookies = parseCookieInput(raw);
  if (cookies.length === 0) throw new ValidationError('Tidak ada cookie valid (format: name=value)');
  const missing = PLATFORMS[platform].required.filter((n) => !cookies.some((c) => c.name === n));
  if (missing.length) throw new ValidationError(`Cookie ${missing.join(', ')} wajib ada untuk ${PLATFORMS[platform].label}`);

  return serialize(async () => {
    const store = await readStore();
    store[platform] = { updatedAt: new Date().toISOString(), cookies };
    await writeStore(store);
    return statusOf(platform, store);
  });
}

export function deleteCookies(platform) {
  assertPlatform(platform);
  return serialize(async () => {
    const store = await readStore();
    delete store[platform];
    await writeStore(store);
    return statusOf(platform, store);
  });
}

/** Header untuk request upstream. Null jika platform belum punya cookie. */
export async function getRequestHeaders(platform) {
  const store = await serialize(readStore);
  const entry = store[platform];
  if (!entry?.cookies?.length) return null;
  const headers = { cookie: entry.cookies.map((c) => `${c.name}=${c.value}`).join('; ') };
  const jsession = entry.cookies.find((c) => c.name === 'JSESSIONID')?.value;
  if (jsession) headers['csrf-token'] = jsession.replace(/"/g, '');
  return headers;
}
