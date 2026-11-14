import { randomUUID } from 'node:crypto';
import { IGError } from './errors.js';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const ALPHABET_INDEX = new Map([...ALPHABET].map((char, index) => [char, BigInt(index)]));
const SHORTCODE_PATTERN = /^[A-Za-z0-9_-]{5,64}$/;
const POST_URL_PATTERN = /\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/;

export function shortcodeToMediaId(shortcode) {
  if (!SHORTCODE_PATTERN.test(shortcode)) {
    throw new IGError(`Shortcode tidak valid: "${shortcode}".`, { status: 400, code: 'INVALID_SHORTCODE' });
  }

  let value = 0n;
  for (const char of shortcode) {
    const digit = ALPHABET_INDEX.get(char);
    if (digit === undefined) {
      throw new IGError(`Shortcode mengandung karakter tidak valid: "${char}".`, {
        status: 400,
        code: 'INVALID_SHORTCODE',
      });
    }
    value = value * 64n + digit;
  }

  return value.toString();
}

export function mediaIdToShortcode(mediaId) {
  let value;
  try {
    value = BigInt(String(mediaId));
  } catch {
    throw new IGError(`Media ID tidak valid: "${mediaId}".`, { status: 400, code: 'INVALID_MEDIA_ID' });
  }
  if (value < 0n) {
    throw new IGError(`Media ID tidak boleh negatif: "${mediaId}".`, { status: 400, code: 'INVALID_MEDIA_ID' });
  }

  let shortcode = '';
  do {
    shortcode = ALPHABET[Number(value % 64n)] + shortcode;
    value /= 64n;
  } while (value > 0n);

  return shortcode;
}

export function parsePostRef(input) {
  const raw = String(input ?? '').trim();
  if (!raw) {
    throw new IGError('ID/URL post wajib diisi.', { status: 400, code: 'INVALID_POST_REF' });
  }

  if (/^\d{5,25}$/.test(raw)) return raw;

  const fromUrl = raw.match(POST_URL_PATTERN);
  if (fromUrl) return shortcodeToMediaId(fromUrl[1]);

  if (SHORTCODE_PATTERN.test(raw)) return shortcodeToMediaId(raw);

  throw new IGError(`Tidak bisa mengenali post: "${raw}". Gunakan media ID, shortcode, atau URL Instagram.`, {
    status: 400,
    code: 'INVALID_POST_REF',
  });
}

export function normalizeUsername(input) {
  const username = String(input ?? '').trim().replace(/^@/, '');
  if (!/^[A-Za-z0-9._]{1,30}$/.test(username)) {
    throw new IGError(`Username tidak valid: "${input}".`, { status: 400, code: 'INVALID_USERNAME' });
  }
  return username;
}

export function normalizeHashtag(input) {
  const tag = String(input ?? '').trim().replace(/^#+/, '');
  if (!/^[\p{L}\p{N}_]{1,100}$/u.test(tag)) {
    throw new IGError(`Hashtag tidak valid: "${input}".`, { status: 400, code: 'INVALID_HASHTAG' });
  }
  return tag.toLowerCase();
}

export function toInt(value, fallback, min, max) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export function pickCursor(payload = {}) {
  return payload.next_max_id ?? payload.next_min_id ?? payload.max_id ?? null;
}

export function isMoreAvailable(payload = {}) {
  if (typeof payload.more_available === 'boolean') return payload.more_available;
  if (typeof payload.has_more === 'boolean') return payload.has_more;
  if (typeof payload.has_more_comments === 'boolean') return payload.has_more_comments;
  return Boolean(pickCursor(payload));
}

export function flattenHashtagSections(payload = {}) {
  const medias = [];
  const seen = new Set();

  const push = (media) => {
    if (!media || typeof media !== 'object') return;
    if (!media.pk && !media.id && !media.code && media.media_type === undefined) return;

    const key = media.pk ?? media.id ?? media.code;
    if (key !== undefined) {
      if (seen.has(String(key))) return;
      seen.add(String(key));
    }
    medias.push(media);
  };

  const collect = (items) => {
    for (const item of items ?? []) push(item?.media ?? item?.node ?? item);
  };

  for (const section of payload.sections ?? []) {
    const layout = section?.layout_content ?? {};

    collect(layout.medias);
    collect(layout.fill_items);
    collect(layout.one_by_two_item?.clips?.items);
    collect(layout.one_by_two_item?.conversion?.items);
    collect(section?.items);

    for (const cluster of layout.one_by_two_item?.clips?.items ?? []) {
      push(cluster?.media);
    }
  }

  for (const media of payload.medias ?? payload.items ?? []) {
    push(media);
  }

  return medias;
}

/**
 * `/fbsearch/topsearch_flat/` mengembalikan list campuran user/hashtag/place.
 * Normalkan jadi kelompok yang dipakai UI.
 */
export function normalizeTopSearch(payload = {}) {
  const users = [];
  const hashtags = [];
  const places = [];
  const music = [];

  for (const item of payload.list ?? []) {
    if (!item || typeof item !== 'object') continue;

    if (item.user) users.push(item.user);
    else if (item.hashtag) hashtags.push(item.hashtag);
    else if (item.place) places.push(item.place);
    else if (item.location) places.push(item.location);
    else if (item.music) music.push(item.music);
    else if (item.track) music.push(item.track);
  }

  return { users, hashtags, places, music };
}

export function randomRankToken(seed = '0') {
  return `${seed}_${randomUUID()}`;
}
