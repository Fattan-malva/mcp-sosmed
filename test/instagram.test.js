// Tes fitur Instagram yang TIDAK menyentuh jaringan: validasi input,
// parsing post, dan perilaku saat cookie belum diisi.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parsePostRef, normalizeUsername, normalizeHashtag, shortcodeToMediaId, mediaIdToShortcode } from '../src/instagram/utils.js';
import { TtlCache } from '../src/instagram/cache.js';
import { endpointKey } from '../src/instagram/client.js';
import { handleInstagramApi } from '../src/instagram/routes.js';
import { deleteCookies, setCookies } from '../src/cookies.js';

let tmpDir;
before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-ig-'));
  process.env.COOKIE_FILE = path.join(tmpDir, 'cookies.json');
});
after(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.COOKIE_FILE;
});

test('shortcode <-> media id bolak-balik', () => {
  const id = shortcodeToMediaId('Cd3xYz_9-A');
  assert.equal(mediaIdToShortcode(id), 'Cd3xYz_9-A');
});

test('parsePostRef menerima ID, shortcode, dan URL', () => {
  assert.equal(parsePostRef('3123456789012345'), '3123456789012345');
  const fromUrl = parsePostRef('https://www.instagram.com/reel/Cd3xYz_9-A/?igsh=abc');
  assert.equal(fromUrl, shortcodeToMediaId('Cd3xYz_9-A'));
  assert.throws(() => parsePostRef(''), /wajib/);
  assert.throws(() => parsePostRef('!!'), /Tidak bisa mengenali/);
});

test('normalizeUsername dan normalizeHashtag membersihkan input', () => {
  assert.equal(normalizeUsername('@instagram'), 'instagram');
  assert.throws(() => normalizeUsername('a b'), /tidak valid/);
  assert.equal(normalizeHashtag('#JavaScript'), 'javascript');
});

test('endpointKey menjaga cooldown per-endpoint tidak pecah karena ID dinamis', () => {
  assert.equal(endpointKey('/api/v1/users/alice/usernameinfo/'), '/users/{username}/usernameinfo');
  assert.equal(endpointKey('/api/v1/users/bob/usernameinfo/'), '/users/{username}/usernameinfo');
  assert.equal(endpointKey('/api/v1/media/123_456/info/'), '/media/{id}/info');
});

test('TtlCache menyimpan dan membuang entri yang kedaluwarsa', async () => {
  const cache = new TtlCache(20);
  cache.set('a', 1);
  assert.equal(cache.get('a'), 1);
  await new Promise((r) => setTimeout(r, 40));
  assert.equal(cache.get('a'), undefined);
});

test('route Instagram tanpa cookie mengembalikan IG_NOT_CONFIGURED tanpa request ke Instagram', async () => {
  await deleteCookies('instagram');
  const status = await handleInstagramApi('GET', '/api/instagram/session', new URLSearchParams());
  assert.equal(status.configured, false);
});

test('route Instagram menolak path yang tidak dikenal', async () => {
  await assert.rejects(() => handleInstagramApi('GET', '/api/instagram/unknown', new URLSearchParams()), /tidak dikenal/);
});

test('setCookies instagram wajib sessionid', async () => {
  assert.throws(() => setCookies('instagram', 'csrftoken=abc'), /sessionid/);
  const ok = await setCookies('instagram', 'sessionid=TEST123456; csrftoken=abc');
  assert.equal(ok.configured, true);
  await deleteCookies('instagram');
});
