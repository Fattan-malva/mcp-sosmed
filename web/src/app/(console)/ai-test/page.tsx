"use client";

import * as React from "react";
import { toast } from "sonner";
import { Bot, Loader2, Send, Trash2, Wrench } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";

interface ToolRun {
  name: string;
  args: unknown;
  ok: boolean;
  durationMs: number;
  error: string | null;
  code?: string | null;
}
interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  toolRuns?: ToolRun[];
}
interface ToolInfo {
  name: string;
  title: string;
  description: string;
}

const errorText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Terjadi kesalahan");

export default function AiTestPage() {
  // Konfigurasi provider LLM. Key hanya di memori tab, tidak disimpan di server/localStorage.
  const [baseUrl, setBaseUrl] = React.useState("https://api.openai.com/v1");
  const [model, setModel] = React.useState("gpt-4o-mini");
  const [llmKey, setLlmKey] = React.useState("");

  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [history, setHistory] = React.useState<{ role: string; content: string }[]>([]);
  const [input, setInput] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [tools, setTools] = React.useState<ToolInfo[]>([]);

  React.useEffect(() => {
    api<{ data: ToolInfo[] }>("/api/agent/tools")
      .then((res) => setTools(res.data))
      .catch((e) => toast.error(errorText(e)));
  }, []);

  const send = async () => {
    const message = input.trim();
    if (!message) return;
    if (!llmKey.trim()) return toast.error("Isi API key LLM dulu");

    setBusy(true);
    setInput("");
    setMessages((m) => [...m, { role: "user", content: message }]);
    try {
      const res = await api<{ data: { reply: string; toolRuns: ToolRun[]; history: { role: string; content: string }[] } }>(
        "/api/agent/chat",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ baseUrl, apiKey: llmKey, model, message, history }),
        },
      );
      setHistory(res.data.history);
      setMessages((m) => [...m, { role: "assistant", content: res.data.reply, toolRuns: res.data.toolRuns }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: `Gagal: ${errorText(e)}` }]);
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setMessages([]);
    setHistory([]);
  };

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">AI Test</h1>
        <p className="text-muted-foreground text-sm">
          Uji tool MCP lewat LLM. Hubungkan provider yang kompatibel dengan OpenAI (OpenAI, Groq, OpenRouter, Ollama, vLLM, dan lainnya).
          Tool yang dipanggil LLM berjalan di server ini dan tetap mengikuti cooldown Instagram.
        </p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
        <div className="grid gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Provider LLM</CardTitle>
              <CardDescription>Key disimpan hanya selama tab ini terbuka.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid gap-1.5">
                <Label htmlFor="base">Base URL</Label>
                <Input id="base" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="model">Model</Label>
                <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="llm-key">API key LLM</Label>
                <Input id="llm-key" type="password" autoComplete="off" value={llmKey} onChange={(e) => setLlmKey(e.target.value)} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wrench className="size-4" /> Tool tersedia
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-2">
              {tools.map((t) => (
                <div key={t.name} className="text-xs">
                  <code className="font-mono">{t.name}</code>
                  <p className="text-muted-foreground">{t.title}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <Card className="flex min-h-[560px] flex-col">
          <CardHeader className="flex flex-row items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Bot className="size-4" /> Percakapan
            </CardTitle>
            <Button variant="outline" size="sm" onClick={clear} disabled={busy || messages.length === 0}>
              <Trash2 className="size-3" /> Bersihkan
            </Button>
          </CardHeader>
          <CardContent className="flex flex-1 flex-col gap-4">
            <div className="flex-1 space-y-4 overflow-y-auto">
              {messages.length === 0 && (
                <p className="text-muted-foreground py-12 text-center text-sm">
                  Contoh: &quot;Ambil 5 post terbaru hashtag #kopi lalu ringkas&quot; atau &quot;Berapa followers akun instagram?&quot;
                </p>
              )}
              {messages.map((m, i) => (
                <div key={i} className={m.role === "user" ? "ml-auto max-w-[85%]" : "max-w-[90%]"}>
                  <div className={`rounded-md border p-3 text-sm whitespace-pre-wrap ${m.role === "user" ? "bg-muted" : ""}`}>{m.content}</div>
                  {m.toolRuns && m.toolRuns.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {m.toolRuns.map((t, j) => (
                        <Badge key={j} variant={t.ok ? "secondary" : "destructive"} title={t.error ?? undefined}>
                          {t.name} · {t.ok ? `${t.durationMs} ms` : t.code ?? "gagal"}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              {busy && (
                <p className="text-muted-foreground flex items-center gap-2 text-xs">
                  <Loader2 className="size-3 animate-spin" /> Agent sedang bekerja…
                </p>
              )}
            </div>

            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                send();
              }}
            >
              <Textarea
                rows={2}
                placeholder="Tulis pertanyaan…"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <Button type="submit" disabled={busy || !input.trim()} className="self-end">
                <Send className="size-4" /> Kirim
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
