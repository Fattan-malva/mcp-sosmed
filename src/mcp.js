import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { cookieStatus } from './cookies.js';
import { instagram, linkedin, jobs } from './upstream.js';
import * as ig from './instagram/service.js';

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

async function run(fn) {
  try {
    return ok(await fn());
  } catch (error) {
    return fail(error.message);
  }
}

/** Satu instance MCP server berisi semua tool. Dibuat per request (stateless). */
export function createMcpServer() {
  const server = new McpServer({ name: 'mcp-sosmed', version: '1.1.0' });

  server.registerTool(
    'linkedin_get',
    {
      title: 'LinkedIn get',
      description: 'Ambil metadata (title, description, image) dari URL LinkedIn. Memakai cookie li_at yang tersimpan di menu Cookies jika ada.',
      inputSchema: { url: z.string().describe('URL linkedin.com, mis. https://www.linkedin.com/posts/...') },
    },
    async ({ url }) => run(() => linkedin(url)),
  );

  server.registerTool(
    'instagram_get',
    {
      title: 'Instagram get',
      description: 'Ambil metadata (title, description, image) dari URL Instagram. Memakai cookie sessionid yang tersimpan di menu Cookies jika ada.',
      inputSchema: { url: z.string().describe('URL instagram.com, mis. https://www.instagram.com/p/...') },
    },
    async ({ url }) => run(() => instagram(url)),
  );

  server.registerTool(
    'jobs_search',
    {
      title: 'LinkedIn jobs search',
      description: 'Cari lowongan publik di LinkedIn (guest search, tanpa login).',
      inputSchema: {
        keywords: z.string().optional().describe('Kata kunci pekerjaan'),
        location: z.string().optional().describe('Lokasi, mis. Indonesia'),
        start: z.number().int().min(0).optional().describe('Offset pagination'),
      },
    },
    async (args) => run(() => jobs({ ...args, start: args.start ?? 0 })),
  );

  // --- Instagram (pakai cookie dari menu Instagram) ---------------------------

  const count = z.number().int().min(1).max(100).optional();
  const cursor = z.string().optional();

  server.registerTool('instagram_session', { title: 'Instagram session', description: 'Status session & cooldown Instagram.', inputSchema: {} },
    async () => run(() => ig.sessionStatus()));

  server.registerTool('instagram_profile', {
    title: 'Instagram profil',
    description: 'Profil user Instagram berdasarkan username.',
    inputSchema: { username: z.string() },
  }, async (args) => run(() => ig.userProfile(args)));

  server.registerTool('instagram_followers', {
    title: 'Instagram followers',
    description: 'Daftar followers user Instagram (pagination dengan cursor).',
    inputSchema: { username: z.string(), count, cursor },
  }, async (args) => run(() => ig.userFollowers(args)));

  server.registerTool('instagram_following', {
    title: 'Instagram following',
    description: 'Daftar following user Instagram (pagination dengan cursor).',
    inputSchema: { username: z.string(), count, cursor },
  }, async (args) => run(() => ig.userFollowing(args)));

  server.registerTool('instagram_post', {
    title: 'Instagram post',
    description: 'Detail post. Terima media ID, shortcode, atau URL post.',
    inputSchema: { post: z.string() },
  }, async (args) => run(() => ig.postDetail(args)));

  server.registerTool('instagram_comments', {
    title: 'Instagram komentar',
    description: 'Komentar sebuah post (pagination dengan cursor).',
    inputSchema: { post: z.string(), count, cursor },
  }, async (args) => run(() => ig.postComments(args)));

  server.registerTool('instagram_search', {
    title: 'Instagram pencarian',
    description: 'Cari di Instagram. type: top, users, reels, hashtags, music, locations.',
    inputSchema: { q: z.string(), type: z.enum(ig.SEARCH_TYPES).optional(), count },
  }, async (args) => run(() => ig.search(args)));

  server.registerTool('instagram_hashtag_posts', {
    title: 'Instagram posts per hashtag',
    description: 'Postingan berdasarkan hashtag. tab: top atau recent.',
    inputSchema: { tag: z.string(), tab: z.enum(['top', 'recent']).optional(), count, cursor },
  }, async (args) => run(() => ig.hashtagPosts(args)));

  server.registerTool('instagram_location_posts', {
    title: 'Instagram posts per lokasi',
    description: 'Postingan pada lokasi Instagram (ID lokasi numerik).',
    inputSchema: { location: z.string(), count, cursor },
  }, async (args) => run(() => ig.locationPostsGet(args)));

  server.registerTool(
    'cookies_status',
    {
      title: 'Cookie status',
      description: 'Cek platform mana yang sudah punya cookie tersimpan. Nilai cookie tidak pernah ditampilkan.',
      inputSchema: {},
    },
    async () => run(() => cookieStatus()),
  );

  return server;
}

/** Layani satu request MCP (Streamable HTTP, stateless). */
export async function handleMcp(req, res, parsedBody) {
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  res.on('close', () => {
    transport.close();
    server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, parsedBody);
}
