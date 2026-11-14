import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// Python palsu: mencetak JSONL seperti snscrape, tanpa akses jaringan.
const dir = mkdtempSync(path.join(tmpdir(), 'social-test-'));
const fakePython = path.join(dir, 'fake-python');
writeFileSync(
  fakePython,
  [
    '#!/bin/sh',
    'echo \'{"url":"https://example.test/1","content":"Lowongan Backend Developer dibutuhkan","date":"2026-01-02T00:00:00","username":"infoloker"}\'',
    'echo \'{"url":"https://example.test/2","content":"Foto makan siang","date":"2026-01-01T00:00:00","username":"someone"}\'',
    'exit 0',
  ].join('\n'),
);
chmodSync(fakePython, 0o755);
process.env.PYTHON_BIN = fakePython;
process.env.SOCIAL_MIN_INTERVAL_MS = '2000';

const { scrape, validateScrape, MODULES, SocialError } = await import('../src/social/snscrape.js');

test('modul X/Twitter tidak tersedia', () => {
  assert.equal(Object.keys(MODULES).some((m) => m.startsWith('twitter')), false);
  assert.throws(() => validateScrape({ module: 'twitter-user', target: 'x' }), (e) => e instanceof SocialError && e.code === 'MODULE_NOT_ALLOWED');
});

test('target tidak boleh diawali tanda minus atau berisi spasi', () => {
  assert.throws(() => validateScrape({ module: 'instagram-user', target: '-o' }), { code: 'INVALID_TARGET' });
  assert.throws(() => validateScrape({ module: 'instagram-user', target: 'a b' }), { code: 'INVALID_TARGET' });
});

test('limit dibatasi', () => {
  assert.throws(() => validateScrape({ module: 'instagram-user', target: 'a', limit: 0 }), { code: 'INVALID_LIMIT' });
  assert.throws(() => validateScrape({ module: 'instagram-user', target: 'a', limit: 500 }), { code: 'INVALID_LIMIT' });
  assert.equal(validateScrape({ module: 'instagram-user', target: 'a' }).limit, 20);
});

test('mastodon user@instance otomatis diberi @', () => {
  assert.equal(validateScrape({ module: 'mastodon-profile', target: 'Gargron@mastodon.social' }).target, '@Gargron@mastodon.social');
  assert.equal(validateScrape({ module: 'mastodon-toot', target: 'https://mastodon.social/@a/1' }).target, 'https://mastodon.social/@a/1');
});

test('scrape membaca JSONL dari proses snscrape', async () => {
  const result = await scrape({ module: 'instagram-user', target: 'infoloker', limit: 2 });
  assert.equal(result.items.length, 2);
  assert.equal(result.items[0].url, 'https://example.test/1');
  assert.equal(result.warning, null);
});
