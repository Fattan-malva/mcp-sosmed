import { ig } from './client.js';
import { IGError } from './errors.js';
import { normalizeHashtag, normalizeUsername, parsePostRef, toInt } from './utils.js';

// Satu sumber logika untuk HTTP route (/api/instagram/*) dan MCP tool.

const list = (data, { nextCursor = null, hasMore, meta } = {}) => ({
  data,
  page: { nextCursor: nextCursor ?? null, hasMore: typeof hasMore === 'boolean' ? hasMore : Boolean(nextCursor) },
  ...(meta ? { meta } : {}),
});

const commentId = (value) => {
  const id = String(value ?? '').trim();
  if (!/^\d{5,30}$/.test(id)) throw new IGError(`Comment ID tidak valid: "${id}".`, { status: 400, code: 'INVALID_COMMENT_ID' });
  return id;
};

const locationId = (value) => {
  const id = String(value ?? '').trim();
  if (!/^\d{1,30}$/.test(id)) throw new IGError(`Location ID tidak valid: "${id}".`, { status: 400, code: 'INVALID_LOCATION_ID' });
  return id;
};

const requireQuery = (q) => {
  const query = String(q ?? '').trim();
  if (!query) throw new IGError('Parameter q wajib diisi.', { status: 400, code: 'MISSING_QUERY' });
  return query;
};

// --- Relasi ---------------------------------------------------------------

export async function userProfile({ username }) {
  const u = normalizeUsername(username);
  const payload = await ig.profile(u);
  return { data: payload.data.user, meta: { username: u } };
}

export async function userFollowers({ username, count, cursor }) {
  const u = normalizeUsername(username);
  const userId = await ig.resolveUserId(u);
  const payload = await ig.followers(userId, { count: toInt(count, 50, 1, 200), cursor });
  return list(payload.users ?? [], { nextCursor: payload.next_max_id ?? null, hasMore: Boolean(payload.next_max_id), meta: { username: u, userId } });
}

export async function userFollowing({ username, count, cursor }) {
  const u = normalizeUsername(username);
  const userId = await ig.resolveUserId(u);
  const payload = await ig.following(userId, { count: toInt(count, 50, 1, 200), cursor });
  return list(payload.users ?? [], { nextCursor: payload.next_max_id ?? null, hasMore: Boolean(payload.next_max_id), meta: { username: u, userId } });
}

export async function userReels({ username, count, cursor }) {
  const u = normalizeUsername(username);
  const userId = await ig.resolveUserId(u);
  const payload = await ig.userReels(userId, { count: toInt(count, 12, 1, 50), cursor });
  const items = payload.items ?? payload.clips ?? [];
  const nextCursor = payload.paging_info?.max_id ?? payload.next_max_id ?? null;
  const hasMore = payload.paging_info?.more_available ?? payload.more_available ?? Boolean(nextCursor);
  return list(items, { nextCursor, hasMore, meta: { username: u, userId } });
}

// --- Post -----------------------------------------------------------------

export async function postDetail({ post }) {
  const mediaId = parsePostRef(post);
  const payload = await ig.mediaInfo(mediaId);
  const item = payload.items?.[0];
  if (!item) throw new IGError(`Post ${mediaId} tidak ditemukan.`, { status: 404, code: 'IG_NOT_FOUND' });
  return { data: item, meta: { mediaId } };
}

export async function postLikes({ post, cursor }) {
  const mediaId = parsePostRef(post);
  const payload = await ig.mediaLikers(mediaId, { cursor });
  return list(payload.users ?? [], { nextCursor: payload.next_max_id ?? null, hasMore: Boolean(payload.next_max_id), meta: { mediaId, userCount: payload.user_count ?? null } });
}

export async function postComments({ post, cursor, maxId, count, threading }) {
  const mediaId = parsePostRef(post);
  const payload = await ig.mediaComments(mediaId, {
    cursor,
    maxId,
    count: toInt(count, 20, 1, 100),
    threading: threading !== 'false' && threading !== false,
  });
  const nextCursor = payload.next_min_id ?? payload.next_max_id ?? null;
  return list(payload.comments ?? [], {
    nextCursor,
    hasMore: payload.has_more_comments ?? payload.has_more_headload_comments ?? Boolean(nextCursor),
    meta: { mediaId, commentCount: payload.comment_count ?? null },
  });
}

export async function commentReplies({ post, comment, cursor, count }) {
  const mediaId = parsePostRef(post);
  const cid = commentId(comment);
  const payload = await ig.commentReplies(mediaId, cid, { cursor, count: toInt(count, 20, 1, 100) });
  const nextCursor = payload.next_max_id ?? payload.next_min_id ?? null;
  return list(payload.child_comments ?? [], {
    nextCursor,
    hasMore: Boolean(payload.has_more_tail_child_comments) || Boolean(payload.has_more_head_child_comments) || Boolean(nextCursor),
    meta: { mediaId, commentId: cid },
  });
}

// --- Pencarian ------------------------------------------------------------

export const SEARCH_TYPES = ['top', 'users', 'reels', 'hashtags', 'music', 'locations'];

export async function search({ q, type = 'top', count, cursor }) {
  const query = requireQuery(q);
  const n = toInt(count, 30, 1, 100);
  switch (String(type).toLowerCase()) {
    case 'users': return { data: (await ig.searchUsers(query, { count: n })).users ?? [] };
    case 'hashtags': return { data: (await ig.searchHashtags(query, { count: n })).results ?? [] };
    case 'locations': {
      const p = await ig.searchLocations(query, { count: n });
      return { data: p.items ?? p.venues ?? [] };
    }
    case 'music': {
      const p = await ig.searchMusic(query, { count: n });
      return { data: p.items ?? [], meta: p.meta };
    }
    case 'reels': {
      const p = await ig.searchReels(query, { count: n, cursor });
      const nextCursor = p.paging_info?.max_id ?? null;
      return list(p.items ?? [], { nextCursor, hasMore: p.paging_info?.more_available ?? Boolean(nextCursor), meta: p.meta });
    }
    case 'top': return ig.searchTop(query, { count: n });
    default:
      throw new IGError(`type tidak dikenal: "${type}". Pilihan: ${SEARCH_TYPES.join(', ')}.`, { status: 400, code: 'INVALID_SEARCH_TYPE' });
  }
}

// --- Hashtag --------------------------------------------------------------

export async function hashtagInfo({ tag }) {
  const t = normalizeHashtag(tag);
  const payload = await ig.hashtagInfo(t);
  return { data: payload.data ?? payload, meta: { tag: t } };
}

export async function hashtagPosts({ tag, tab = 'top', cursor, count }) {
  const t = normalizeHashtag(tag);
  const tabName = String(tab).toLowerCase() === 'recent' ? 'recent' : 'top';
  const payload = await ig.hashtagPosts(t, { tab: tabName, cursor, count: toInt(count, 30, 1, 100) });
  const nextCursor = payload.next_max_id ?? payload.next_min_id ?? null;
  return list(payload.medias ?? [], { nextCursor, hasMore: payload.more_available ?? Boolean(nextCursor), meta: { tag: t, tab: tabName } });
}

// --- Lokasi ---------------------------------------------------------------

export async function locationInfoGet({ location }) {
  const id = locationId(location);
  const payload = await ig.locationInfo(id);
  return { data: payload.location ?? payload.data ?? payload, meta: { locationId: id } };
}

export async function locationPostsGet({ location, cursor, count }) {
  const id = locationId(location);
  const payload = await ig.locationPosts(id, { cursor, count: toInt(count, 30, 1, 100) });
  const nextCursor = payload.next_max_id ?? null;
  return list(payload.items ?? [], { nextCursor, hasMore: payload.more_available ?? Boolean(nextCursor), meta: { locationId: id } });
}

// --- Status ---------------------------------------------------------------

export async function sessionStatus() {
  return ig.sessionInfo();
}
