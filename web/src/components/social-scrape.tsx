"use client";

import * as React from "react";
import { toast } from "sonner";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export interface ModuleInfo {
  name: string;
  platform: string;
  target: string;
  description: string;
}

export interface ScrapeItem {
  url?: string;
  date?: string;
  content?: string;
  username?: string;
  [key: string]: unknown;
}

interface ScrapeResult {
  module: string;
  target: string;
  items: ScrapeItem[];
  warning: string | null;
}

export const errorText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Terjadi kesalahan");

// Isi HTML (Mastodon) dibersihkan jadi teks biasa untuk pratinjau.
export const plain = (value: unknown) =>
  String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();

export function ItemList({ items, badge }: { items: ScrapeItem[]; badge?: (item: ScrapeItem) => React.ReactNode }) {
  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const text = plain(item.content ?? item.renderedContent ?? item.title ?? "");
        return (
          <div key={`${item.url ?? i}-${i}`} className="rounded-md border p-3">
            <div className="text-muted-foreground flex flex-wrap items-center gap-3 text-xs">
              {item.username && <span className="font-medium">@{item.username}</span>}
              {item.date && <span className="font-mono">{String(item.date).slice(0, 16).replace("T", " ")}</span>}
              {badge?.(item)}
              {item.url && (
                <a href={item.url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 hover:underline">
                  <ExternalLink className="size-3" /> Buka
                </a>
              )}
            </div>
            <p className="mt-2 line-clamp-4 text-sm whitespace-pre-wrap">{text || <span className="text-muted-foreground">(tanpa teks)</span>}</p>
          </div>
        );
      })}
    </div>
  );
}

export function SocialScrapePanel({ modules, title = "Scrape publik" }: { modules: ModuleInfo[]; title?: string }) {
  const [moduleName, setModuleName] = React.useState(modules[0]?.name ?? "");
  const [target, setTarget] = React.useState("");
  const [limit, setLimit] = React.useState("20");
  const [busy, setBusy] = React.useState(false);
  const [result, setResult] = React.useState<ScrapeResult | null>(null);

  const current = modules.find((m) => m.name === moduleName);

  const run = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ module: moduleName, target: target.trim(), limit });
      const { data } = await api<{ data: ScrapeResult }>(`/api/social/scrape?${params}`);
      setResult(data);
      if (data.items.length === 0) toast.info("Tidak ada postingan yang ditemukan.");
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
      <Card>
        <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
        <CardContent>
          <form
            className="grid gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!target.trim()) return toast.error("Isi target dulu");
              run();
            }}
          >
            <div className="grid gap-1.5">
              <Label htmlFor="sc-module">Modul</Label>
              <select
                id="sc-module"
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                value={moduleName}
                onChange={(e) => setModuleName(e.target.value)}
              >
                {modules.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
              {current && <p className="text-muted-foreground text-xs">{current.description}</p>}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sc-target">Target ({current?.target ?? "—"})</Label>
              <Input id="sc-target" value={target} onChange={(e) => setTarget(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="sc-limit">Jumlah hasil (maks 200)</Label>
              <Input id="sc-limit" type="number" min={1} max={200} value={limit} onChange={(e) => setLimit(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Ambil data
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle className="text-base">Hasil {result ? `(${result.items.length})` : ""}</CardTitle>
          <code className="text-muted-foreground font-mono text-xs">GET /api/social/scrape</code>
        </CardHeader>
        <CardContent className="space-y-3">
          {busy && <p className="text-muted-foreground py-6 text-center text-sm">Mengambil data… (bisa beberapa detik)</p>}
          {!busy && !result && <p className="text-muted-foreground py-10 text-center text-sm">Pilih modul lalu jalankan scrape.</p>}
          {!busy && result?.warning && (
            <p className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">Peringatan dari snscrape: {result.warning}</p>
          )}
          {!busy && result && result.items.length > 0 && (
            <ItemList items={result.items} badge={() => <Badge variant="outline" className="text-[10px]">{result.module}</Badge>} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
