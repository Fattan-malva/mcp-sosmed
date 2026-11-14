// Agent test: memakai MCP client sungguhan untuk bicara ke endpoint /mcp,
// seperti agent AI akan melakukannya. Tidak ada request ke internet —
// tool yang memanggil LinkedIn/Instagram hanya diuji sisi validasi input.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { server } from '../src/server.js';
import { parseCookieInput, setCookies, cookieStatus, deleteCookies, cookieFilePath, ValidationError } from '../src/cookies.js';

const TOKEN = 'test-token-12345';
let tmpDir;
let base;
let httpServer;

before(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'mcp-sosmed-'));
  process.env.COOKIE_FILE = path.join(tmpDir, 'cookies.json');
  process.env.ADMIN_TOKEN = TOKEN;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  await fs.rm(tmpDir, { recursive: true, force: true });
  delete process.env.COOKIE_FILE;
  delete process.env.ADMIN_TOKEN;
});

async function connectAgent(token = TOKEN) {
  const client = new Client({ name: 'test-agent', version: '1.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(`${base}/mcp`), {
    requestInit: token ? { headers: { authorization: `Bearer ${token}` } } : {},
  });
  await client.connect(transport);
  return client;
}

function textOf(result) {
  return result.content.map((c) => c.text).join('\n');
}

test('/mcp menolak request tanpa token admin', async () => {
  const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}' });
  assert.equal(res.status, 401);
});

test('/mcp menolak token yang salah', async () => {
  const res = await fetch(`${base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer salah' }, body: '{}' });
  assert.equal(res.status, 401);
});

test('agent bisa connect dan melihat semua tool', async () => {
  const client = await connectAgent();
  try {
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    assert.deepEqual(names, [
      'cookies_status',
      'instagram_comments',
      'instagram_followers',
      'instagram_following',
      'instagram_get',
      'instagram_hashtag_posts',
      'instagram_location_posts',
      'instagram_post',
      'instagram_profile',
      'instagram_search',
      'instagram_session',
      'jobs_search',
      'linkedin_get',
    ]);
  } finally {
    await client.close();
  }
});

test('cookies_status awalnya belum terkonfigurasi', async () => {
  const client = await connectAgent();
  try {
    const result = await client.callTool({ name: 'cookies_status', arguments: {} });
    const data = JSON.parse(textOf(result));
    assert.equal(data.length, 2);
    assert.ok(data.every((p) => p.configured === false));
  } finally {
    await client.close();
  }
});

test('simpan cookie via menu (PUT) lalu agent melihat statusnya tanpa nilai rahasia', async () => {
  const put = await fetch(`${base}/api/cookies/instagram`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ cookies: 'sessionid=SECRET-IG-123; csrftoken=abc' }),
  });
  assert.equal(put.status, 200);
  const saved = (await put.json()).data;
  assert.equal(saved.configured, true);
  assert.deepEqual(saved.cookieNames, ['sessionid', 'csrftoken']);

  const stored = JSON.parse(await fs.readFile(cookieFilePath(), 'utf8'));
  assert.equal(stored.instagram.cookies[0].value, 'SECRET-IG-123');

  const client = await connectAgent();
  try {
    const result = await client.callTool({ name: 'cookies_status', arguments: {} });
    const text = textOf(result);
    assert.ok(!text.includes('SECRET-IG-123'), 'nilai cookie tidak boleh bocor ke agent');
    const ig = JSON.parse(text).find((p) => p.platform === 'instagram');
    assert.equal(ig.configured, true);
  } finally {
    await client.close();
  }
});

test('PUT cookie tanpa cookie wajib ditolak dengan 400', async () => {
  const res = await fetch(`${base}/api/cookies/linkedin`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${TOKEN}` },
    body: JSON.stringify({ cookies: 'JSESSIONID=x' }),
  });
  assert.equal(res.status, 400);
  assert.match((await res.json()).error, /li_at/);
});

test('DELETE cookie menghapus konfigurasi platform', async () => {
  const res = await fetch(`${base}/api/cookies/instagram`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${TOKEN}` },
  });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).data.configured, false);
});

test('linkedin_get dan instagram_get menolak URL dari domain lain', async () => {
  const client = await connectAgent();
  try {
    const evil = await client.callTool({ name: 'linkedin_get', arguments: { url: 'https://example.com/x' } });
    assert.equal(evil.isError, true);
    assert.match(textOf(evil), /linkedin\.com/);

    const bad = await client.callTool({ name: 'instagram_get', arguments: { url: 'bukan-url' } });
    assert.equal(bad.isError, true);
    assert.match(textOf(bad), /tidak valid/);
  } finally {
    await client.close();
  }
});

test('endpoint cookie tanpa token ditolak', async () => {
  const res = await fetch(`${base}/api/cookies`);
  assert.equal(res.status, 401);
});

test('parseCookieInput: string header', () => {
  assert.deepEqual(parseCookieInput('sessionid=abc; csrftoken=xyz'), [
    { name: 'sessionid', value: 'abc' },
    { name: 'csrftoken', value: 'xyz' },
  ]);
});

test('parseCookieInput: JSON array format export browser', () => {
  const input = JSON.stringify([
    { name: 'li_at', value: 'AQE', domain: '.linkedin.com' },
    { name: 'JSESSIONID', value: '"ajax:1"', domain: '.linkedin.com' },
  ]);
  assert.deepEqual(parseCookieInput(input), [
    { name: 'li_at', value: 'AQE' },
    { name: 'JSESSIONID', value: '"ajax:1"' },
  ]);
});

test('parseCookieInput: JSON object, buang entri kosong, nama duplikat pakai yang terakhir', () => {
  assert.deepEqual(parseCookieInput('{"a":"1","b":"","c":"2"}'), [
    { name: 'a', value: '1' },
    { name: 'c', value: '2' },
  ]);
  assert.deepEqual(parseCookieInput('a=1; a=2'), [{ name: 'a', value: '2' }]);
});

test('parseCookieInput menolak input kosong dan JSON rusak', () => {
  assert.throws(() => parseCookieInput('   '), ValidationError);
  assert.throws(() => parseCookieInput('[{"name":'), ValidationError);
});

test('setCookies dan deleteCookies bekerja langsung di file JSON', async () => {
  await setCookies('linkedin', 'li_at=TOKEN1');
  const [li] = (await cookieStatus()).filter((p) => p.platform === 'linkedin');
  assert.equal(li.configured, true);
  await deleteCookies('linkedin');
  const after = (await cookieStatus()).find((p) => p.platform === 'linkedin');
  assert.equal(after.configured, false);
});
