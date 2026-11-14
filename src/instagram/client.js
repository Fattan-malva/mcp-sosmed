import { setTimeout as sleep } from 'node:timers/promises';
import { TtlCache } from './cache.js';
import { getInstagramSession, maskSecret } from './session.js';
import { AuthError, IGError, NotFoundError, RateLimitError } from './errors.js';
import { randomRankToken, flattenHashtagSections, normalizeTopSearch } from './utils.js';

// Pengaturan dari env. Batas minimum/maksimum sama dengan scraper asli:
// cooldown tidak bisa diset lebih kecil dari batas aman yang ditetapkan di sini.
function readInt(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(value ?? '', 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export const IG_SETTINGS = {
  baseUrl: (process.env.IG_BASE_URL ?? 'https://i.instagram.com/api/v1').replace(/\/+$/, ''),
  appId: process.env.IG_APP_ID ?? '936619743392459',
  userAgent:
    process.env.IG_USER_AGENT ??
    'Instagram 269.0.0.18.75 Android (30/11; 480dpi; 1080x2148; samsung; SM-A505F; a20; exynos9610; en_US; 383236585)',
  timeoutMs: readInt(process.env.IG_TIMEOUT_MS, 20000, { min: 1000, max: 120000 }),
  retries: readInt(process.env.IG_RETRIES, 2, { min: 0, max: 5 }),
  requestsPerMinute: readInt(process.env.IG_REQUESTS_PER_MINUTE, 30, { min: 1, max: 600 }),
  cacheTtlMs: readInt(process.env.IG_CACHE_TTL_MS, 60000, { min: 0, max: 3600000 }),
  cooldownMs: readInt(process.env.IG_COOLDOWN_MS, 600000, { min: 10000, max: 3600000 }),
  rateLimitCooldownMs: readInt(process.env.IG_RATE_LIMIT_COOLDOWN_MS, 60000, { min: 5000, max: 3600000 }),
  endpointCooldownMs: readInt(process.env.IG_ENDPOINT_COOLDOWN_MS, 120000, { min: 10000, max: 3600000 }),
};

const AUTH_MESSAGES = new Set([
  'login_required',
  'checkpoint_required',
  'challenge_required',
  'consent_required',
  'not_authorized',
  'user_has_logged_out',
  'bad_password',
]);

const COOLDOWN_MESSAGES = new Set([
  'rate_limit_error',
  'feedback_required',
  'please_wait_a_few_minutes',
  'unknown_error',
]);

// Instagram membalas 200 + status "fail" saat akun di-soft-block. Pola ini
// sengaja tidak di-retry karena request tambahan hanya memperpanjang blokir.
const SORRY_PATTERN = /we'?re sorry|something went wrong|please try again later/i;
const HTML_HINT = /<html|<!doctype|<body|<head/i;

function backoffMs(attempt) {
  const base = Math.min(1000 * 2 ** attempt, 15000);
  return base + Math.floor(Math.random() * 500);
}

function snippet(text, length = 160) {
  return String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, length);
}

function parseJson(text, path, response) {
  if (!text || !text.trim()) return {};

  try {
    return JSON.parse(text);
  } catch {
    const status = response?.status ?? 0;
    const contentType = response?.headers?.get('content-type') ?? '';
    const body = snippet(text);

    if (status === 404) {
      throw new IGError(
        `Endpoint Instagram tidak tersedia (${path}, HTTP 404). Sebagian endpoint private API berubah.`,
        { status: 502, code: 'IG_ENDPOINT_UNAVAILABLE', meta: { upstreamStatus: status, path } },
      );
    }
    if (status === 401 || status === 403) {
      throw new AuthError(`Sesi Instagram ditolak saat mengakses ${path} (HTTP ${status}).`, {
        meta: { upstreamStatus: status, path },
      });
    }
    if (status === 429) {
      throw new RateLimitError(`Instagram membatasi permintaan saat mengakses ${path} (HTTP 429).`, {
        meta: { upstreamStatus: status, path },
      });
    }
    if (/text\/html/i.test(contentType) || HTML_HINT.test(body) || /login|checkpoint|challenge/i.test(body)) {
      throw new AuthError(
        'Instagram mengembalikan halaman login/html, bukan JSON. Session tidak valid, kedaluwarsa, atau diblokir.',
        { meta: { upstreamStatus: status, path, snippet: body } },
      );
    }
    throw new IGError(`Respons Instagram bukan JSON (${path}, HTTP ${status}).`, {
      status: 502,
      code: 'IG_INVALID_JSON',
      meta: { upstreamStatus: status, path, snippet: body },
    });
  }
}

function readFailure(response, payload) {
  const message = String(payload?.message ?? payload?.error_type ?? '').trim();
  const failedBody = payload?.status === 'fail' || payload?.status === 'error' || Boolean(payload?.error_type);

  if (response.ok && !failedBody) return null;

  const cooldown = response.status === 429 || COOLDOWN_MESSAGES.has(message);
  const softBlock = !cooldown && SORRY_PATTERN.test(message);

  return {
    code: message,
    message: message || `HTTP ${response.status}`,
    httpStatus: response.status,
    cooldown,
    softBlock,
    retryable: !cooldown && !softBlock && (response.status >= 500 || COOLDOWN_MESSAGES.has(message)),
  };
}

function toIGError(failure, payload) {
  const { code, message, httpStatus } = failure;
  const meta = { upstreamStatus: httpStatus, upstream: payload };

  if (httpStatus === 429 || COOLDOWN_MESSAGES.has(code)) {
    return new RateLimitError(`Instagram membatasi permintaan (${message}).`, { meta });
  }
  if (failure.softBlock) {
    return new IGError(`Instagram menolak endpoint ini sementara (soft block: ${message}).`, {
      status: 503,
      code: 'IG_SOFT_BLOCK',
      meta,
    });
  }
  if (httpStatus === 401 || httpStatus === 403 || AUTH_MESSAGES.has(code)) {
    return new AuthError(`Sesi Instagram tidak valid atau terblokir (${message}). Perbarui cookie.`, { meta });
  }
  if (httpStatus === 404 || code === 'not_found' || code === 'invalid_media') {
    return new NotFoundError(`Data tidak ditemukan di Instagram (${message}).`, { meta });
  }
  return new IGError(`Instagram menolak permintaan (${message}).`, {
    status: httpStatus >= 400 && httpStatus < 500 ? httpStatus : 502,
    code: 'IG_UPSTREAM_ERROR',
    meta,
  });
}

function isReel(media = {}) {
  return media.product_type === 'clips' || media.media_type === 2;
}

/**
 * Kelompokkan path upstream jadi kunci stabil untuk cooldown per-endpoint,
 * mis. `/api/v1/users/instagram/usernameinfo/` -> `/users/{username}/usernameinfo`.
 */
export function endpointKey(pathname) {
  let path = String(pathname ?? '')
    .replace(/^\/api\/v\d+/, '')
    .replace(/\/+$/, '');

  path = path
    .replace(/^\/users\/[^/]+\/usernameinfo$/, '/users/{username}/usernameinfo')
    .replace(/^\/tags\/[^/]+\/(info|sections|related)$/, '/tags/{tag}/$1')
    .replace(/^\/locations\/[^/]+\/(info|sections)$/, '/locations/{id}/$1')
    .replace(/^\/media\/[^/]+/, '/media/{id}')
    .replace(/^\/friendships\/[^/]+/, '/friendships/{id}');

  return path || '/';
}

/**
 * Satu instance client untuk seluruh server. Throttle, cooldown akun, dan
 * cooldown per-endpoint disimpan di memori dan TIDAK direset saat cookie
 * diganti, supaya tidak bisa dipakai untuk menerobos pembatasan Instagram.
 */
export class InstagramClient {
  #intervalMs;
  #nextSlotAt = 0;
  #cooldownUntil = 0;
  #cooldownReason = null;
  #endpointCooldown = new Map();
  #sessionStamp = null;

  constructor(settings = IG_SETTINGS) {
    this.settings = settings;
    this.cache = new TtlCache(settings.cacheTtlMs);
    this.stats = { requests: 0, failures: 0, lastRequestAt: null };
    this.#intervalMs = Math.ceil(60000 / Math.max(settings.requestsPerMinute, 1));
  }

  async #session() {
    const session = await getInstagramSession();
    if (!session) {
      throw new AuthError('Session Instagram belum diisi. Simpan cookie di halaman Instagram.', {
        code: 'IG_NOT_CONFIGURED',
      });
    }
    // Cookie berubah: hapus cache data, tapi cooldown tetap berlaku.
    if (session.updatedAt !== this.#sessionStamp) {
      this.#sessionStamp = session.updatedAt;
      this.cache.clear();
    }
    return session;
  }

  async sessionInfo() {
    const now = Date.now();
    const session = await getInstagramSession();
    const cooldownSeconds = Math.max(0, Math.ceil((this.#cooldownUntil - now) / 1000));
    const endpointCooldowns = [];
    for (const [endpoint, entry] of this.#endpointCooldown) {
      if (entry.until <= now) {
        this.#endpointCooldown.delete(endpoint);
        continue;
      }
      endpointCooldowns.push({
        endpoint,
        retryAfterSeconds: Math.ceil((entry.until - now) / 1000),
        reason: entry.reason,
      });
    }

    return {
      configured: Boolean(session),
      sessionId: maskSecret(session?.sessionId),
      csrfToken: session?.csrfToken ? 'present' : 'missing',
      dsUserId: session?.dsUserId || null,
      updatedAt: session?.updatedAt ?? null,
      cooldownSeconds,
      cooldownReason: cooldownSeconds > 0 ? this.#cooldownReason : null,
      endpointCooldowns,
      requestsPerMinute: this.settings.requestsPerMinute,
      cacheTtlMs: this.settings.cacheTtlMs,
      stats: this.stats,
    };
  }

  async #throttle() {
    const waitMs = Math.max(0, this.#nextSlotAt - Date.now());
    if (waitMs > 0) await sleep(waitMs);
    this.#nextSlotAt = Math.max(Date.now(), this.#nextSlotAt) + this.#intervalMs;
  }

  #headers(session, { method = 'GET', hasBody = false } = {}) {
    const headers = {
      accept: '*/*',
      'accept-language': 'en-US,en;q=0.9',
      'user-agent': this.settings.userAgent,
      'x-ig-app-id': this.settings.appId,
      'x-ig-www-claim': '0',
      'x-asbd-id': '129477',
      'x-requested-with': 'XMLHttpRequest',
      origin: 'https://www.instagram.com',
      referer: 'https://www.instagram.com/',
      cookie: session.cookie,
    };
    if (session.csrfToken) headers['x-csrftoken'] = session.csrfToken;
    if (method !== 'GET' && hasBody) headers['content-type'] = 'application/x-www-form-urlencoded';
    return headers;
  }

  async request(path, { method = 'GET', query, body, retries } = {}) {
    const session = await this.#session();

    if (this.#cooldownUntil > Date.now()) {
      const seconds = Math.ceil((this.#cooldownUntil - Date.now()) / 1000);
      throw new RateLimitError(
        `Instagram sedang membatasi akun ini. Berhenti mengirim request selama ~${Math.ceil(seconds / 60)} menit.`,
        {
          code: 'IG_COOLDOWN',
          meta: { retryAfterSeconds: seconds, until: new Date(this.#cooldownUntil).toISOString() },
        },
      );
    }

    const url = path.startsWith('http') ? new URL(path) : new URL(`${this.settings.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }

    const endpoint = endpointKey(url.pathname);
    const blocked = this.#endpointCooldown.get(endpoint);
    if (blocked) {
      if (blocked.until > Date.now()) {
        const seconds = Math.ceil((blocked.until - Date.now()) / 1000);
        throw new IGError(
          `Endpoint Instagram ${endpoint} sedang diblokir sementara. Coba lagi ~${Math.ceil(seconds / 60)} menit lagi.`,
          {
            status: 503,
            code: 'IG_SOFT_BLOCK',
            meta: { endpoint, retryAfterSeconds: seconds, upstreamMessage: blocked.reason },
          },
        );
      }
      this.#endpointCooldown.delete(endpoint);
    }

    const maxRetries = retries ?? this.settings.retries;
    let attempt = 0;

    for (;;) {
      await this.#throttle();
      this.stats.requests += 1;
      this.stats.lastRequestAt = new Date().toISOString();

      try {
        const response = await fetch(url, {
          method,
          headers: this.#headers(session, { method, hasBody: Boolean(body) }),
          body: body ? new URLSearchParams(body).toString() : undefined,
          signal: AbortSignal.timeout(this.settings.timeoutMs),
        });

        const payload = parseJson(await response.text(), url.pathname, response);
        const failure = readFailure(response, payload);

        if (!failure) return payload;

        if (failure.cooldown) {
          const retryAfter = Number.parseInt(response.headers.get('retry-after') ?? '', 10);
          const baseMs = failure.httpStatus === 429 ? this.settings.rateLimitCooldownMs : this.settings.cooldownMs;
          const cooldownMs = Number.isFinite(retryAfter) && retryAfter > 0 ? Math.max(retryAfter * 1000, baseMs) : baseMs;

          this.#cooldownUntil = Date.now() + cooldownMs;
          this.#cooldownReason = failure.message;
          this.stats.failures += 1;

          throw new RateLimitError(
            `Instagram membatasi akun ini (${failure.message}). Request dihentikan sementara selama ~${Math.ceil(cooldownMs / 60000)} menit.`,
            {
              code: 'IG_COOLDOWN',
              meta: {
                retryAfterSeconds: Math.ceil(cooldownMs / 1000),
                until: new Date(this.#cooldownUntil).toISOString(),
                upstreamStatus: failure.httpStatus,
              },
            },
          );
        }

        // Soft block biasanya hanya mengenai satu endpoint: tandai endpoint itu saja.
        if (failure.softBlock) {
          const cooldownMs = this.settings.endpointCooldownMs;
          const until = Date.now() + cooldownMs;
          this.#endpointCooldown.set(endpoint, { until, reason: failure.message });
          this.stats.failures += 1;

          throw new IGError(
            `Instagram menolak endpoint ${endpoint} sementara (soft block). Coba lagi ~${Math.ceil(cooldownMs / 60000)} menit lagi.`,
            {
              status: 503,
              code: 'IG_SOFT_BLOCK',
              meta: { endpoint, upstreamMessage: failure.message, retryAfterSeconds: Math.ceil(cooldownMs / 1000) },
            },
          );
        }

        if (failure.retryable && attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          attempt += 1;
          continue;
        }

        this.stats.failures += 1;
        throw toIGError(failure, payload);
      } catch (error) {
        if (error instanceof IGError) throw error;

        this.stats.failures += 1;
        if (attempt < maxRetries) {
          await sleep(backoffMs(attempt));
          attempt += 1;
          continue;
        }
        throw new IGError(`Gagal menghubungi Instagram: ${error.message}`, { status: 502, code: 'IG_NETWORK_ERROR' });
      }
    }
  }

  #rankToken(session) {
    return randomRankToken(session?.dsUserId || '0');
  }

  // --- Users & relations -------------------------------------------------

  profile(username) {
    return this.cache.wrap(`profile:${username.toLowerCase()}`, async () => {
      const payload = await this.request(`/users/${encodeURIComponent(username)}/usernameinfo/`);
      const user = payload.user ?? payload.data?.user;
      if (!user) throw new NotFoundError(`User @${username} tidak ditemukan atau profilnya tidak dapat diakses.`);
      return { data: { user } };
    });
  }

  async resolveUserId(username) {
    const payload = await this.profile(username);
    const user = payload?.data?.user;
    const id = user?.pk ?? user?.pk_id ?? user?.id;
    if (!id) throw new NotFoundError(`User @${username} tidak ditemukan atau profilnya tidak dapat diakses.`);
    return String(id);
  }

  followers(userId, { count = 50, cursor } = {}) {
    return this.request(`/friendships/${userId}/followers/`, {
      query: { count, max_id: cursor, search_surface: 'follow_list_page' },
    });
  }

  following(userId, { count = 50, cursor } = {}) {
    return this.request(`/friendships/${userId}/following/`, { query: { count, max_id: cursor } });
  }

  userReels(userId, { count = 12, cursor } = {}) {
    return this.request('/clips/user/', {
      query: { target_user_id: userId, page_size: count, max_id: cursor, include_feed_video: 'true' },
    });
  }

  // --- Media -------------------------------------------------------------

  mediaInfo(mediaId) {
    return this.request(`/media/${mediaId}/info/`);
  }

  mediaLikers(mediaId, { cursor } = {}) {
    return this.request(`/media/${mediaId}/likers/`, { query: { max_id: cursor } });
  }

  mediaComments(mediaId, { cursor, maxId, count = 20, threading = true } = {}) {
    return this.request(`/media/${mediaId}/comments/`, {
      query: {
        can_support_threading: threading ? 'true' : 'false',
        permalink_enabled: 'false',
        min_id: cursor,
        max_id: maxId,
        count,
      },
    });
  }

  commentReplies(mediaId, commentId, { cursor, count = 20 } = {}) {
    return this.request(`/media/${mediaId}/comments/${commentId}/child_comments/`, {
      query: { max_id: cursor, count },
    });
  }

  // --- Search / discovery ------------------------------------------------

  async searchTop(query, { count = 30 } = {}) {
    try {
      const payload = await this.request('/fbsearch/topsearch_flat/', {
        query: { query, count, timezone_offset: '0', search_surface: 'top_search_page' },
      });
      return {
        data: normalizeTopSearch(payload),
        page: { nextCursor: null, hasMore: Boolean(payload.has_more) },
        meta: { query, source: 'topsearch_flat' },
      };
    } catch (error) {
      if (error instanceof AuthError || error instanceof RateLimitError) throw error;

      const [users, hashtags, locations] = await Promise.allSettled([
        this.searchUsers(query, { count }),
        this.searchHashtags(query, { count }),
        this.searchLocations(query, { count }),
      ]);
      if (users.status === 'rejected' && hashtags.status === 'rejected' && locations.status === 'rejected') throw error;

      return {
        data: {
          users: users.status === 'fulfilled' ? (users.value.users ?? []) : [],
          hashtags: hashtags.status === 'fulfilled' ? (hashtags.value.results ?? []) : [],
          places: locations.status === 'fulfilled' ? (locations.value.items ?? []) : [],
          music: [],
        },
        page: { nextCursor: null, hasMore: false },
        meta: { query, source: 'combined' },
      };
    }
  }

  searchUsers(query, { count = 30 } = {}) {
    return this.request('/users/search/', { query: { q: query, count, timezone_offset: '0' } });
  }

  searchHashtags(query, { count = 30 } = {}) {
    return this.request('/tags/search/', { query: { q: query, count, timezone_offset: '0' } });
  }

  searchLocations(query, { count = 30 } = {}) {
    return this.request('/fbsearch/places/', { query: { query, count, timezone_offset: '0' } });
  }

  async searchMusic(query, { count = 30 } = {}) {
    for (const product of ['story_camera_music_overlay', 'feed_post_music_overlay']) {
      try {
        const payload = await this.request('/music/search/', { query: { query, count, product } });
        return { items: payload.items ?? payload.results ?? [], meta: { query, source: 'music/search' } };
      } catch (error) {
        if (error instanceof AuthError || error instanceof RateLimitError) throw error;
      }
    }
    try {
      const flat = await this.request('/fbsearch/topsearch_flat/', { query: { query, count, timezone_offset: '0' } });
      const { music } = normalizeTopSearch(flat);
      if (music.length) return { items: music, meta: { query, source: 'topsearch_flat' } };
    } catch (error) {
      if (error instanceof AuthError || error instanceof RateLimitError) throw error;
    }
    throw new IGError('Pencarian musik tidak tersedia dari API privat Instagram saat ini.', {
      status: 501,
      code: 'IG_FEATURE_UNAVAILABLE',
      meta: { query },
    });
  }

  async searchReels(query, { count = 24, cursor } = {}) {
    // Endpoint reels/clips search sudah 404; fallback lewat hashtag paling relevan.
    const tags = await this.searchHashtags(query, { count: 5 });
    const tag = tags.results?.[0]?.name;
    if (tag) {
      const payload = await this.hashtagPosts(tag, { tab: 'top', count, cursor });
      return {
        items: (payload.medias ?? []).filter(isReel),
        paging_info: { more_available: Boolean(payload.more_available), max_id: payload.next_max_id ?? null },
        meta: { query, via: 'hashtag', tag },
      };
    }
    throw new IGError('Pencarian Reels tidak tersedia lagi di API privat Instagram.', {
      status: 501,
      code: 'IG_FEATURE_UNAVAILABLE',
      meta: { query },
    });
  }

  // --- Hashtags ----------------------------------------------------------

  hashtagInfo(tag) {
    return this.request(`/tags/${encodeURIComponent(tag)}/info/`);
  }

  async hashtagPosts(tag, { tab = 'top', cursor, count = 30 } = {}) {
    const session = await this.#session();
    const body = { tab: tab === 'recent' ? 'recent' : 'top', rank_token: this.#rankToken(session), include_persistent: 'true' };
    if (cursor) body.max_id = cursor;

    try {
      // Endpoint sections sejak 2025 hanya menerima POST.
      const payload = await this.request(`/tags/${encodeURIComponent(tag)}/sections/`, { method: 'POST', body });
      return { ...payload, medias: flattenHashtagSections(payload) };
    } catch (error) {
      if (error instanceof AuthError || error instanceof RateLimitError || error.code === 'IG_SOFT_BLOCK') throw error;
      const payload = await this.request(`/feed/tag/${encodeURIComponent(tag)}/`, {
        query: { max_id: cursor, rank_token: this.#rankToken(session), count },
      });
      return { ...payload, medias: payload.items ?? [] };
    }
  }

  // --- Locations ---------------------------------------------------------

  locationInfo(locationId) {
    return this.request(`/locations/${locationId}/info/`);
  }

  async locationPosts(locationId, { cursor, count = 30 } = {}) {
    const session = await this.#session();
    const body = { tab: 'recent', rank_token: this.#rankToken(session), include_persistent: 'true' };
    if (cursor) body.max_id = cursor;

    try {
      const payload = await this.request(`/locations/${locationId}/sections/`, { method: 'POST', body });
      return { ...payload, items: flattenHashtagSections(payload) };
    } catch (error) {
      if (error instanceof AuthError || error instanceof RateLimitError || error.code === 'IG_SOFT_BLOCK') throw error;
      const payload = await this.request(`/feed/location/${locationId}/`, {
        query: { max_id: cursor, rank_token: this.#rankToken(session), count },
      });
      return { ...payload, items: payload.items ?? [] };
    }
  }
}

export const ig = new InstagramClient();
