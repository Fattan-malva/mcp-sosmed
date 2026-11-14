import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { cookieStatus } from './cookies.js';
import { instagram, linkedin, jobs } from './upstream.js';

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
