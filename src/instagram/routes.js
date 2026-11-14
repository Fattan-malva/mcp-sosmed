import * as svc from './service.js';
import { IGError } from './errors.js';

const seg = (s) => decodeURIComponent(s);

/**
 * Router untuk /api/instagram/*. Mengembalikan body JSON, atau null jika path tidak cocok.
 * Dipanggil setelah auth token admin dicek di server.js.
 */
export async function handleInstagramApi(method, pathname, searchParams) {
  if (method !== 'GET') return null;
  const parts = pathname.replace(/^\/api\/instagram\/?/, '').split('/').filter(Boolean).map(seg);
  const q = Object.fromEntries(searchParams);
  const [a, b, c, d, e] = parts;

  if (a === 'session' && !b) return svc.sessionStatus();

  if (a === 'users' && b) {
    if (!c) return svc.userProfile({ username: b });
    if (c === 'followers') return svc.userFollowers({ username: b, ...q });
    if (c === 'following') return svc.userFollowing({ username: b, ...q });
    if (c === 'reels') return svc.userReels({ username: b, ...q });
  }

  if (a === 'posts' && b) {
    if (!c) return svc.postDetail({ post: b });
    if (c === 'likes') return svc.postLikes({ post: b, ...q });
    if (c === 'comments' && !d) return svc.postComments({ post: b, ...q });
    if (c === 'comments' && d && e === 'replies') return svc.commentReplies({ post: b, comment: d, ...q });
  }

  if (a === 'search' && !b) return svc.search(q);

  if (a === 'hashtags' && b) {
    if (!c) return svc.hashtagInfo({ tag: b });
    if (c === 'posts') return svc.hashtagPosts({ tag: b, ...q });
  }

  if (a === 'locations' && b) {
    if (!c) return svc.locationInfoGet({ location: b });
    if (c === 'posts') return svc.locationPostsGet({ location: b, ...q });
  }

  throw new IGError(`Endpoint Instagram tidak dikenal: ${pathname}`, { status: 404, code: 'NOT_FOUND' });
}
