import { z } from 'zod';
import { TOOLS, toolByName } from './tools.js';
import { ValidationError } from './cookies.js';

// AI Test: LLM apa pun yang kompatibel dengan OpenAI (OpenAI, Groq, OpenRouter,
// Ollama, vLLM, ...) dihubungkan ke tool MCP milik mcp-sosmed.
// Key LLM dikirim per request dan TIDAK disimpan di server.

const MAX_ROUNDS = 8;
const TIMEOUT_MS = 120_000;
const MAX_HISTORY = 30;
const MAX_TOOL_TEXT = 12_000;

const SYSTEM_PROMPT = () => {
  const names = TOOLS.map((t) => `${t.name} (${t.title})`).join(', ');
  return `Kamu adalah agent mcp-sosmed. Kamu punya tool untuk mengambil data sosial media dan lowongan kerja: ${names}.
Aturan:
1. Gunakan tool untuk setiap pertanyaan yang butuh data. Jangan menebak angka atau isi post.
2. Jika tool menolak atau gagal (misalnya cooldown, session belum diisi), jelaskan dengan jujur. Jangan mencoba-coba berulang kali.
3. Jangan meminta atau menampilkan cookie, token, atau API key.
4. Jawab dalam bahasa yang sama dengan pertanyaan user. Gunakan tabel Markdown untuk data tabular, dan ringkas.`;
};

function chatEndpoint(baseUrl) {
  const base = baseUrl.replace(/\/+$/, '');
  return /\/v\d+$/.test(base) ? `${base}/chat/completions` : `${base}/v1/chat/completions`;
}

function toolsForLlm() {
  return TOOLS.map((t) => {
    const schema = z.toJSONSchema(z.object(t.shape));
    delete schema.$schema;
    return { type: 'function', function: { name: t.name, description: `${t.title}. ${t.description}`, parameters: schema } };
  });
}

function validateInput({ baseUrl, apiKey, model, message }) {
  let url;
  try {
    url = new URL(String(baseUrl ?? '').trim());
  } catch {
    throw new ValidationError('Base URL harus berupa URL http(s) yang valid');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new ValidationError('Base URL harus http(s)');
  if (!String(apiKey ?? '').trim()) throw new ValidationError('API key LLM wajib diisi');
  if (!String(model ?? '').trim()) throw new ValidationError('Nama model wajib diisi');
  const text = String(message ?? '').trim();
  if (!text) throw new ValidationError('Pesan tidak boleh kosong');
  if (text.length > 4000) throw new ValidationError('Pesan maksimal 4000 karakter');
  return { baseUrl: url.toString(), apiKey: String(apiKey).trim(), model: String(model).trim(), message: text };
}

async function callLlm({ baseUrl, apiKey, model, messages, tools }) {
  const response = await fetch(chatEndpoint(baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages, tools, tool_choice: 'auto' }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = {};
  }
  if (!response.ok) {
    const detail = body?.error?.message ?? text.slice(0, 200);
    throw Object.assign(new Error(`LLM menolak request (HTTP ${response.status}): ${detail}`), { status: 502 });
  }
  const message = body?.choices?.[0]?.message;
  if (!message) throw Object.assign(new Error('Respons LLM tidak memiliki pesan'), { status: 502 });
  return message;
}

async function runTool(call) {
  const started = Date.now();
  const name = call.function?.name ?? '';
  let args = {};
  try {
    args = call.function?.arguments ? JSON.parse(call.function.arguments) : {};
  } catch {
    return { run: { name, args: call.function?.arguments, ok: false, durationMs: 0, error: 'Argumen tool bukan JSON valid' }, content: JSON.stringify({ error: 'Argumen tool bukan JSON valid' }) };
  }

  const tool = toolByName(name);
  if (!tool) {
    return { run: { name, args, ok: false, durationMs: 0, error: 'Tool tidak dikenal' }, content: JSON.stringify({ error: `Tool tidak dikenal: ${name}` }) };
  }

  const parsed = z.object(tool.shape).safeParse(args);
  if (!parsed.success) {
    const error = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    return { run: { name, args, ok: false, durationMs: 0, error }, content: JSON.stringify({ error }) };
  }

  try {
    const data = await tool.handler(parsed.data);
    const content = JSON.stringify(data).slice(0, MAX_TOOL_TEXT);
    return { run: { name, args, ok: true, durationMs: Date.now() - started, error: null }, content, data };
  } catch (error) {
    return {
      run: { name, args, ok: false, durationMs: Date.now() - started, error: error.message, code: error.code ?? null },
      content: JSON.stringify({ error: error.message, code: error.code ?? null }),
    };
  }
}

/**
 * Satu giliran percakapan. history: [{role:'user'|'assistant', content}] dari klien.
 * Mengembalikan balasan akhir, jejak tool yang dipanggil, dan history baru.
 */
export async function chatWithTools({ history = [], ...input }) {
  const { baseUrl, apiKey, model, message } = validateInput(input);

  const past = (Array.isArray(history) ? history : [])
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));

  const messages = [{ role: 'system', content: SYSTEM_PROMPT() }, ...past, { role: 'user', content: message }];
  const tools = toolsForLlm();
  const toolRuns = [];

  for (let round = 0; round < MAX_ROUNDS; round += 1) {
    const reply = await callLlm({ baseUrl, apiKey, model, messages, tools });
    const calls = reply.tool_calls ?? [];

    if (!calls.length) {
      const content = String(reply.content ?? '').trim() || '(tidak ada jawaban)';
      return {
        reply: content,
        toolRuns,
        history: [...past, { role: 'user', content: message }, { role: 'assistant', content }].slice(-MAX_HISTORY),
      };
    }

    messages.push({ role: 'assistant', content: reply.content ?? null, tool_calls: calls });
    for (const call of calls) {
      const result = await runTool(call);
      toolRuns.push(result.run);
      messages.push({ role: 'tool', tool_call_id: call.id, content: result.content });
    }
  }

  throw Object.assign(new Error(`Agent melebihi ${MAX_ROUNDS} putaran tool tanpa jawaban akhir.`), { status: 502 });
}

export const agentTools = () => TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description }));
