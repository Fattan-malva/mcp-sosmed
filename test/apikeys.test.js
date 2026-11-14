// Tes API key: key hanya untuk data Instagram/LinkedIn, bukan MCP/AI/cookie.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { server } from '../src/server.js';
import { verifyApiKey, createApiKey, revokeApiKey } from '../src/apikeys.js';

const ADMIN = 'admin-test-token-123';
let tmpDir, base, keyId, apiKey;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-keys-'));
  process.env.API_KEYS_FILE = path.join(tmpDir, 'api-keys.json');
  process.env.COOKIE_FILE = path.join(tmpDir, 'cookies.json');
  process.env.ADMIN_TOKEN = ADMIN;
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((r) => server.close(r));
  await fs.rm(tmpDir, { recursive: true, force: true });
  for (const k of ['API_KEYS_FILE', 'COOKIE_FILE', 'ADMIN_TOKEN']) delete process.env[k];
});

const call = (p, { method = 'GET', token, body } = {}) =>
  fetch(`${base}${p}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });

test('tanpa token ditolak', async () => {
  assert.equal((await call('/api/instagram/session')).status, 401);
});

test('admin membuat API key; key hanya tampil sekali dan disimpan sebagai hash', async () => {
  const res = await call('/api/keys', { method: 'POST', token: ADMIN, body: { name: 'Dashboard lain' } });
  assert.equal(res.status, 201);
  const { data } = await res.json();
  apiKey = data.key;
  keyId = data.record.id;
  assert.match(apiKey, /^msk_/);
  assert.equal(data.record.prefix, apiKey.slice(0, 12));
  const stored = await fs.readFile(process.env.API_KEYS_FILE, 'utf8');
  assert.ok(!stored.includes(apiKey), 'key asli tidak boleh tersimpan');
  const list = await (await call('/api/keys', { token: ADMIN })).json();
  assert.ok(list.data.every((k) => !('hash' in k)), 'daftar key tidak menampilkan hash');
});

test('API key boleh mengambil data Instagram', async () => {
  const res = await call('/api/instagram/session', { token: apiKey });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).configured, false);
});

test('API key tidak boleh ke MCP, AI Test, pengelolaan key, atau cookie', async () => {
  assert.equal((await call('/mcp', { method: 'POST', token: apiKey, body: {} })).status, 401);
  assert.equal((await call('/api/agent/tools', { token: apiKey })).status, 401);
  assert.equal((await call('/api/keys', { token: apiKey })).status, 401);
  assert.equal((await call('/api/cookies', { token: apiKey })).status, 401);
});

test('admin tetap bisa ke semua endpoint', async () => {
  assert.equal((await call('/api/agent/tools', { token: ADMIN })).status, 200);
  assert.equal((await call('/api/cookies', { token: ADMIN })).status, 200);
});

test('key yang dicabut langsung tidak berlaku', async () => {
  const res = await call(`/api/keys/${keyId}`, { method: 'DELETE', token: ADMIN });
  assert.equal(res.status, 200);
  assert.equal((await call('/api/instagram/session', { token: apiKey })).status, 401);
});

test('verifyApiKey menolak key acak dan format salah', async () => {
  assert.equal(await verifyApiKey('msk_tidakada'), null);
  assert.equal(await verifyApiKey('bukan-key'), null);
});

test('nama key kosong ditolak', async () => {
  assert.throws(() => createApiKey('   '), /wajib/);
  const tmp = await createApiKey('x');
  await revokeApiKey(tmp.record.id); // bersihkan
});

test('agent chat validasi input tanpa memanggil LLM', async () => {
  const res = await call('/api/agent/chat', { method: 'POST', token: ADMIN, body: { baseUrl: 'bukan-url', apiKey: 'k', model: 'm', message: 'hi' } });
  assert.equal(res.status, 400);
});
