import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// Wrapper untuk snscrape (vendor/snscrape) yang dijalankan sebagai proses Python.
//
// Aturan:
//  - Hanya modul di MODULES yang bisa dipanggil. Modul X/Twitter tidak ada di daftar.
//  - Argumen dikirim sebagai array (tanpa shell), target tidak boleh diawali '-'.
//  - Environment Python dibuat minimal, sehingga secret di env server tidak ikut.
//  - Scrape berjalan satu per satu (antrean) dengan jeda minimum antar-permintaan.
//  - Setiap proses punya timeout dan batas ukuran output.

export class SocialError extends Error {
  constructor(message, { status = 400, code = 'SOCIAL_ERROR', meta } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    if (meta) this.meta = meta;
  }
}

// nama modul -> platform & label argumen target
export const MODULES = {
  'instagram-user': { platform: 'instagram', target: 'username', description: 'Postingan publik sebuah akun' },
  'instagram-hashtag': { platform: 'instagram', target: 'hashtag', description: 'Postingan publik per hashtag' },
  'instagram-location': { platform: 'instagram', target: 'location id', description: 'Postingan publik per lokasi' },
  'facebook-user': { platform: 'facebook', target: 'username', description: 'Postingan publik halaman/profil' },
  'facebook-group': { platform: 'facebook', target: 'group id/slug', description: 'Postingan publik grup' },
  'facebook-community': { platform: 'facebook', target: 'community slug', description: 'Postingan publik komunitas' },
  'mastodon-profile': { platform: 'mastodon', target: '@akun@instance atau URL profil', description: 'Toot sebuah profil' },
  'mastodon-toot': { platform: 'mastodon', target: 'URL toot atau instance', description: 'Toot tunggal atau thread' },
  'telegram-channel': { platform: 'telegram', target: 'nama channel', description: 'Pesan publik channel Telegram' },
};

export const listModules = () =>
  Object.entries(MODULES).map(([name, info]) => ({ name, ...info }));

const here = path.dirname(fileURLToPath(import.meta.url));
const VENDOR_DIR = process.env.SNSCRAPE_DIR || path.join(here, '..', '..', 'vendor', 'snscrape');
const PYTHON = process.env.PYTHON_BIN || 'python3';

const num = (value, fallback, min, max) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.trunc(n))) : fallback;
};
const TIMEOUT_MS = num(process.env.SOCIAL_TIMEOUT_MS, 120_000, 10_000, 600_000);
const MIN_INTERVAL_MS = num(process.env.SOCIAL_MIN_INTERVAL_MS, 5_000, 2_000, 3_600_000);
const MAX_OUTPUT = 8 * 1024 * 1024;

// Boot kecil: tambahkan folder vendor ke sys.path lalu panggil CLI snscrape.
const BOOT = [
  'import sys',
  'sys.path.insert(0, sys.argv[1])',
  "sys.argv = ['snscrape'] + sys.argv[2:]",
  'from snscrape._cli import main',
  'main()',
].join('\n');

export function validateScrape({ module, target, limit, since }) {
  const info = MODULES[module];
  if (!info) {
    throw new SocialError(`Modul "${module}" tidak tersedia. Pilih salah satu dari daftar modul.`, { code: 'MODULE_NOT_ALLOWED' });
  }
  let value = String(target ?? '').trim();
  // Mastodon: "user@instance" otomatis diberi "@" di depan.
  if (module === 'mastodon-profile' && /^[^@\s/]+@[^@\s/]+$/.test(value)) value = `@${value}`;
  if (!value || value.length > 300 || /[\s\0]/.test(value) || value.startsWith('-')) {
    throw new SocialError(`Target untuk ${module} tidak valid.`, { code: 'INVALID_TARGET' });
  }
  const max = num(process.env.SOCIAL_MAX_RESULTS, 50, 1, 200);
  const n = limit === undefined || limit === '' ? 20 : Number(limit);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new SocialError(`limit harus 1 sampai ${max}.`, { code: 'INVALID_LIMIT' });
  }
  let sinceIso = null;
  if (since) {
    const d = new Date(since);
    if (Number.isNaN(d.getTime())) throw new SocialError('since harus tanggal valid (ISO 8601).', { code: 'INVALID_SINCE' });
    sinceIso = d.toISOString();
  }
  return { module, target: value, limit: n, since: sinceIso };
}

// Antrean serial: satu scrape dalam satu waktu, dengan jeda minimum.
let queue = Promise.resolve();
let lastFinishedAt = 0;

function enqueue(task) {
  const run = queue.then(async () => {
    const wait = lastFinishedAt + MIN_INTERVAL_MS - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await task();
    } finally {
      lastFinishedAt = Date.now();
    }
  });
  queue = run.catch(() => {});
  return run;
}

function runProcess(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(PYTHON, ['-I', '-c', BOOT, VENDOR_DIR, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH || '/usr/bin:/bin', LANG: 'C.UTF-8', PYTHONDONTWRITEBYTECODE: '1' },
    });
    let stdout = '';
    let stderr = '';
    let size = 0;
    let killed = null;
    const timer = setTimeout(() => {
      killed = 'timeout';
      child.kill('SIGKILL');
    }, TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_OUTPUT) {
        killed = 'output';
        child.kill('SIGKILL');
        return;
      }
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      if (stderr.length < 20_000) stderr += chunk;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(new SocialError(`Tidak bisa menjalankan ${PYTHON}: ${err.message}. Pastikan Python 3 terpasang.`, { status: 503, code: 'PYTHON_MISSING' }));
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed === 'timeout') return reject(new SocialError('Scrape melewati batas waktu.', { status: 504, code: 'SCRAPE_TIMEOUT' }));
      if (killed === 'output') return reject(new SocialError('Output scrape terlalu besar.', { status: 502, code: 'OUTPUT_TOO_LARGE' }));
      resolve({ code, stdout, stderr });
    });
  });
}

// Ambil baris terakhir stderr sebagai penjelasan singkat (tanpa jejak panjang).
const warningFrom = (stderr) => {
  const lines = stderr.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1].slice(0, 300) : null;
};

/** Jalankan satu modul snscrape. Mengembalikan { module, target, items, warning }. */
export function scrape(input) {
  const opts = validateScrape(input);
  const args = ['--jsonl', '--retry', '1', '-n', String(opts.limit)];
  if (opts.since) args.push('--since', opts.since);
  args.push(opts.module, opts.target);

  return enqueue(async () => {
    const { code, stdout, stderr } = await runProcess(args);
    const items = [];
    for (const line of stdout.split('\n')) {
      if (!line.trim()) continue;
      try {
        items.push(JSON.parse(line));
      } catch {
        /* baris bukan JSON, abaikan */
      }
    }
    if (code !== 0 && items.length === 0) {
      throw new SocialError(warningFrom(stderr) || `snscrape keluar dengan kode ${code}.`, {
        status: 502,
        code: 'SCRAPE_FAILED',
      });
    }
    return {
      module: opts.module,
      target: opts.target,
      items,
      warning: code !== 0 ? warningFrom(stderr) : null,
    };
  });
}
