import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomBytes, createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ValidationError } from './cookies.js';

// mcp-sosmed sebagai penyedia API key. Key ditampilkan penuh hanya sekali saat
// dibuat; yang disimpan di data/api-keys.json hanyalah SHA-256 hash-nya.

function keysFilePath() {
  if (process.env.API_KEYS_FILE) return path.resolve(process.env.API_KEYS_FILE);
  const dataDir = process.env.DATA_DIR || path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  return path.join(dataDir, 'api-keys.json');
}

const hashKey = (key) => createHash('sha256').update(key).digest('hex');

let queue = Promise.resolve();
function serialize(task) {
  const run = queue.then(task, task);
  queue = run.catch(() => {});
  return run;
}

async function readAll() {
  try {
    return JSON.parse(await fs.readFile(keysFilePath(), 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

async function writeAll(records) {
  const file = keysFilePath();
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(records, null, 2), { mode: 0o600 });
  await fs.rename(tmp, file);
}

const publicView = ({ hash, ...rest }) => rest;

export function listApiKeys() {
  return serialize(async () => (await readAll()).map(publicView));
}

export function createApiKey(name) {
  const label = String(name ?? '').trim();
  if (!label) throw new ValidationError('Nama API key wajib diisi');
  if (label.length > 80) throw new ValidationError('Nama API key maksimal 80 karakter');

  return serialize(async () => {
    const records = await readAll();
    const key = `msk_${randomBytes(32).toString('base64url')}`;
    const record = {
      id: randomUUID(),
      name: label,
      prefix: key.slice(0, 12),
      hash: hashKey(key),
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revoked: false,
    };
    records.push(record);
    await writeAll(records);
    // `key` hanya dikembalikan di sini, tidak pernah disimpan.
    return { key, record: publicView(record) };
  });
}

export function revokeApiKey(id) {
  return serialize(async () => {
    const records = await readAll();
    const record = records.find((r) => r.id === id);
    if (!record) throw Object.assign(new Error('API key tidak ditemukan'), { status: 404 });
    record.revoked = true;
    record.revokedAt = new Date().toISOString();
    await writeAll(records);
    return publicView(record);
  });
}

/** Cek token Bearer terhadap daftar key aktif. Mengembalikan record atau null. */
export async function verifyApiKey(token) {
  if (!token || !token.startsWith('msk_')) return null;
  const digest = Buffer.from(hashKey(token), 'hex');
  return serialize(async () => {
    const records = await readAll();
    const match = records.find((r) => {
      if (r.revoked) return false;
      const stored = Buffer.from(r.hash, 'hex');
      return stored.length === digest.length && timingSafeEqual(stored, digest);
    });
    if (match) {
      match.lastUsedAt = new Date().toISOString();
      await writeAll(records);
      return publicView(match);
    }
    return null;
  });
}
