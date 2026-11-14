"use client";

import * as React from "react";
import { toast } from "sonner";
import { BriefcaseBusiness, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { api } from "@/lib/api";
import { errorText, ItemList, type ModuleInfo, type ScrapeItem } from "@/components/social-scrape";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface Source {
  id: string;
  name: string;
  module: string;
  target: string;
}
interface LokerItem extends ScrapeItem {
  source?: { id: string; name: string; module: string };
}
interface FeedResponse {
  data: LokerItem[];
  meta: { sources: number; keywords: string[]; warnings: { source: string; warning: string }[] };
}

export default function LokerPage() {
  const [modules, setModules] = React.useState<ModuleInfo[]>([]);
  const [sources, setSources] = React.useState<Source[]>([]);
  const [name, setName] = React.useState("");
  const [moduleName, setModuleName] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [keywords, setKeywords] = React.useState("");
  const [feed, setFeed] = React.useState<FeedResponse | null>(null);
  const [busy, setBusy] = React.useState(false);

  const loadSources = React.useCallback(() => {
    api<{ data: Source[] }>("/api/social/loker/sources")
      .then((r) => setSources(r.data))
      .catch((e) => toast.error(errorText(e)));
  }, []);

  React.useEffect(() => {
    api<{ data: ModuleInfo[] }>("/api/social/modules").then((r) => {
      setModules(r.data);
      setModuleName(r.data[0]?.name ?? "");
    });
    loadSources();
  }, [loadSources]);

  const addSource = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api("/api/social/loker/sources", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, module: moduleName, target }),
      });
      setName("");
      setTarget("");
      toast.success("Sumber ditambahkan");
      loadSources();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const removeSource = async (id: string) => {
    try {
      await api(`/api/social/loker/sources/${id}`, { method: "DELETE" });
      loadSources();
    } catch (err) {
      toast.error(errorText(err));
    }
  };

  const loadFeed = async () => {
    setBusy(true);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (keywords.trim()) params.set("keywords", keywords.trim());
      const res = await api<FeedResponse>(`/api/social/loker?${params}`);
      setFeed(res);
      if (res.data.length === 0) toast.info("Belum ada loker yang cocok dari sumber ini.");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Loker</h1>
        <p className="text-muted-foreground text-sm">
          Kumpulkan postingan lowongan dari akun, channel, atau hashtag yang sering memposting loker, lalu saring dengan kata kunci.
        </p>
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[340px_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Sumber loker</CardTitle>
            <CardDescription>Menambah dan menghapus sumber butuh token admin.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <form className="grid gap-3" onSubmit={addSource}>
              <div className="grid gap-1.5">
                <Label htmlFor="ls-name">Nama</Label>
                <Input id="ls-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Info Loker Jakarta" />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ls-module">Modul</Label>
                <select
                  id="ls-module"
                  className="border-input bg-background h-9 rounded-md border px-3 text-sm"
                  value={moduleName}
                  onChange={(e) => setModuleName(e.target.value)}
                >
                  {modules.map((m) => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="ls-target">Target</Label>
                <Input id="ls-target" value={target} onChange={(e) => setTarget(e.target.value)} />
              </div>
              <Button type="submit" disabled={!name.trim() || !target.trim()}>
                <Plus className="size-4" /> Tambah sumber
              </Button>
            </form>

            <div className="grid gap-2">
              {sources.length === 0 && <p className="text-muted-foreground text-xs">Belum ada sumber.</p>}
              {sources.map((s) => (
                <div key={s.id} className="flex items-center gap-2 rounded-md border p-2 text-xs">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{s.name}</p>
                    <p className="text-muted-foreground truncate font-mono">{s.module} · {s.target}</p>
                  </div>
                  <Button variant="ghost" size="icon" aria-label="Hapus sumber" onClick={() => removeSource(s.id)}>
                    <Trash2 className="size-3" />
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader className="flex flex-col gap-3">
            <div className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Feed loker {feed ? `(${feed.data.length})` : ""}</CardTitle>
              <code className="text-muted-foreground font-mono text-xs">GET /api/social/loker</code>
            </div>
            <form
              className="flex flex-col gap-2 sm:flex-row"
              onSubmit={(e) => {
                e.preventDefault();
                loadFeed();
              }}
            >
              <Input
                aria-label="Kata kunci"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="Kosong = loker, lowongan, hiring, dibutuhkan, … (pisah koma)"
              />
              <Button type="submit" disabled={busy || sources.length === 0}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Muat feed
              </Button>
            </form>
          </CardHeader>
          <CardContent className="space-y-3">
            {!feed && !busy && (
              <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center text-sm">
                <BriefcaseBusiness className="size-8" />
                <p>{sources.length === 0 ? "Tambah sumber dulu, lalu muat feed." : "Muat feed untuk melihat loker terbaru."}</p>
              </div>
            )}
            {feed?.meta.warnings.map((w, i) => (
              <p key={i} className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-xs">
                {w.source}: {w.warning}
              </p>
            ))}
            {feed && feed.data.length > 0 && (
              <ItemList
                items={feed.data}
                badge={(item) => <Badge variant="outline" className="text-[10px]">{(item as LokerItem).source?.name}</Badge>}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
