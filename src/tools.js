import { z } from 'zod';
import { cookieStatus } from './cookies.js';
import { instagram, linkedin, jobs } from './upstream.js';
import * as ig from './instagram/service.js';

// Satu sumber definisi tool. Dipakai oleh:
//  - MCP server (/mcp) untuk klien eksternal (Claude Desktop, Cursor, dll.)
//  - Agent AI Test (/api/agent/chat) untuk LLM yang kita hubungkan.

const count = z.number().int().min(1).max(100).optional();
const cursor = z.string().optional();

export const TOOLS = [
  {
    name: 'linkedin_get',
    title: 'LinkedIn get',
    description: 'Ambil metadata (title, description, image) dari URL LinkedIn. Memakai cookie li_at yang tersimpan jika ada.',
    shape: { url: z.string().describe('URL linkedin.com') },
    handler: ({ url }) => linkedin(url),
  },
  {
    name: 'instagram_get',
    title: 'Instagram metadata',
    description: 'Ambil metadata (title, description, image) dari URL Instagram. Memakai cookie sessionid jika ada.',
    shape: { url: z.string().describe('URL instagram.com') },
    handler: ({ url }) => instagram(url),
  },
  {
    name: 'jobs_search',
    title: 'LinkedIn jobs search',
    description: 'Cari lowongan publik di LinkedIn (guest search, tanpa login).',
    shape: {
      keywords: z.string().optional().describe('Kata kunci pekerjaan'),
      location: z.string().optional().describe('Lokasi, mis. Indonesia'),
      start: z.number().int().min(0).optional().describe('Offset pagination'),
    },
    handler: (args) => jobs({ ...args, start: args.start ?? 0 }),
  },
  {
    name: 'cookies_status',
    title: 'Cookie status',
    description: 'Cek platform mana yang sudah punya cookie tersimpan. Nilai cookie tidak pernah ditampilkan.',
    shape: {},
    handler: () => cookieStatus(),
  },
  {
    name: 'instagram_session',
    title: 'Instagram session',
    description: 'Status session dan cooldown Instagram.',
    shape: {},
    handler: () => ig.sessionStatus(),
  },
  {
    name: 'instagram_profile',
    title: 'Instagram profil',
    description: 'Profil user Instagram berdasarkan username.',
    shape: { username: z.string() },
    handler: (args) => ig.userProfile(args),
  },
  {
    name: 'instagram_followers',
    title: 'Instagram followers',
    description: 'Daftar followers user Instagram (pagination dengan cursor).',
    shape: { username: z.string(), count, cursor },
    handler: (args) => ig.userFollowers(args),
  },
  {
    name: 'instagram_following',
    title: 'Instagram following',
    description: 'Daftar following user Instagram (pagination dengan cursor).',
    shape: { username: z.string(), count, cursor },
    handler: (args) => ig.userFollowing(args),
  },
  {
    name: 'instagram_post',
    title: 'Instagram post',
    description: 'Detail post. Terima media ID, shortcode, atau URL post.',
    shape: { post: z.string() },
    handler: (args) => ig.postDetail(args),
  },
  {
    name: 'instagram_comments',
    title: 'Instagram komentar',
    description: 'Komentar sebuah post (pagination dengan cursor).',
    shape: { post: z.string(), count, cursor },
    handler: (args) => ig.postComments(args),
  },
  {
    name: 'instagram_search',
    title: 'Instagram pencarian',
    description: 'Cari di Instagram. type: top, users, reels, hashtags, music, locations.',
    shape: { q: z.string(), type: z.enum(ig.SEARCH_TYPES).optional(), count },
    handler: (args) => ig.search(args),
  },
  {
    name: 'instagram_hashtag_posts',
    title: 'Instagram posts per hashtag',
    description: 'Postingan berdasarkan hashtag. tab: top atau recent.',
    shape: { tag: z.string(), tab: z.enum(['top', 'recent']).optional(), count, cursor },
    handler: (args) => ig.hashtagPosts(args),
  },
  {
    name: 'instagram_location_posts',
    title: 'Instagram posts per lokasi',
    description: 'Postingan pada lokasi Instagram (ID lokasi numerik).',
    shape: { location: z.string(), count, cursor },
    handler: (args) => ig.locationPostsGet(args),
  },
];

export const toolByName = (name) => TOOLS.find((t) => t.name === name);
