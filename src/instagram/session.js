import { readCookieEntry } from '../cookies.js';

/**
 * Session Instagram dibaca dari cookies.json (diisi lewat form di halaman Instagram).
 * Tidak ada lagi IG_COOKIE / IG_COOKIE_FILE di .env.
 */
export async function getInstagramSession() {
  const entry = await readCookieEntry('instagram');
  if (!entry) return null;

  const get = (name) => entry.cookies.find((c) => c.name === name)?.value ?? '';
  return {
    cookie: entry.cookies.map((c) => `${c.name}=${c.value}`).join('; '),
    sessionId: get('sessionid'),
    csrfToken: get('csrftoken'),
    dsUserId: get('ds_user_id'),
    updatedAt: entry.updatedAt ?? null,
  };
}

export function maskSecret(value) {
  if (!value) return null;
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}...${value.slice(-4)}`;
}
