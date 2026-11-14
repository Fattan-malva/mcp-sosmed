import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { TOOLS } from './tools.js';

const ok = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (message) => ({ content: [{ type: 'text', text: message }], isError: true });

/** Satu instance MCP server berisi semua tool dari TOOLS. Dibuat per request (stateless). */
export function createMcpServer() {
  const server = new McpServer({ name: 'mcp-sosmed', version: '1.2.0' });

  for (const tool of TOOLS) {
    server.registerTool(
      tool.name,
      { title: tool.title, description: tool.description, inputSchema: tool.shape },
      async (args) => {
        try {
          return ok(await tool.handler(args));
        } catch (error) {
          return fail(error.message);
        }
      },
    );
  }

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
