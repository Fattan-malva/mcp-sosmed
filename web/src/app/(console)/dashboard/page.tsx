"use client";

import * as React from "react";
import Link from "next/link";
import { Activity, CheckCircle2, XCircle, Zap, RefreshCw, BriefcaseBusiness, Camera } from "lucide-react";
import { api, useApi } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface Health { ok: boolean }
interface Endpoint { name: string; path: string; desc: string }

const ENDPOINTS: Endpoint[] = [
  { name: "Health", path: "/health", desc: "Liveness probe — always public." },
  { name: "LinkedIn Jobs", path: "/api/jobs", desc: "Guest job search: keywords, location, start." },
  { name: "Instagram", path: "/api/instagram", desc: "OG metadata for a post or profile URL." },
];

export default function DashboardPage() {
  const { data: health, error, loading, reload } = useApi<Health>("/health");
  const [checks, setChecks] = React.useState<{ path: string; status: number | null; ms: number | null }[]>([]);
  const [busy, setBusy] = React.useState(false);

  const probe = React.useCallback(async () => {
    setBusy(true);
    const out: { path: string; status: number | null; ms: number | null }[] = [];
    for (const e of ENDPOINTS) {
      const t0 = performance.now();
      try {
        const res = await fetch(e.path);
        out.push({ path: e.path, status: res.status, ms: Math.round(performance.now() - t0) });
      } catch {
        out.push({ path: e.path, status: null, ms: null });
      }
    }
    setChecks(out);
    setBusy(false);
  }, []);

  React.useEffect(() => {
    probe();
  }, [probe]);

  const up = checks.filter((c) => c.status && c.status < 500).length;
  const avg = checks.filter((c) => c.ms != null).length
    ? Math.round(checks.reduce((a, c) => a + (c.ms ?? 0), 0) / checks.filter((c) => c.ms != null).length)
    : null;

  const kpis = [
    { icon: Activity, label: "API status", value: loading ? "…" : health?.ok ? "ONLINE" : error ? "DOWN" : "—", tone: health?.ok ? "text-emerald-500" : "text-destructive" },
    { icon: CheckCircle2, label: "Endpoints reachable", value: `${up} / ${ENDPOINTS.length}` },
    { icon: Zap, label: "Avg latency", value: avg == null ? "—" : `${avg} ms` },
    { icon: XCircle, label: "Failing", value: String(checks.filter((c) => c.status == null || c.status >= 500).length), tone: checks.some((c) => c.status == null || c.status >= 500) ? "text-destructive" : "text-emerald-500" },
  ];

  return (
    <div className="grid gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground text-sm">Public social data API — read-only endpoints.</p>
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => { reload(); probe(); }}>
          <RefreshCw className={`size-4 ${busy ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {kpis.map((k) => (
          <Card key={k.label}>
            <CardContent className="space-y-1">
              <div className="text-muted-foreground flex items-center gap-2 text-xs font-medium uppercase tracking-wide">
                <k.icon className={`size-4 ${k.tone ?? ""}`} /> {k.label}
              </div>
              <div className={`text-2xl font-semibold ${k.tone ?? ""}`}>
                {loading ? <Skeleton className="h-7 w-20" /> : k.value}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <Card>
          <CardHeader><CardTitle className="text-base">Endpoint health</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {checks.map((c) => {
              const ok = c.status != null && c.status < 500;
              return (
                <div key={c.path} className="flex items-center gap-3 rounded-md border px-3 py-2">
                  <span className={`size-2 shrink-0 rounded-full ${ok ? "bg-emerald-500" : "bg-destructive"}`} />
                  <code className="min-w-0 flex-1 truncate font-mono text-xs">{c.path}</code>
                  <span className="text-muted-foreground font-mono text-xs">{c.ms == null ? "—" : `${c.ms} ms`}</span>
                  <Badge variant={c.status != null && c.status < 400 ? "secondary" : "destructive"}>{c.status ?? "ERR"}</Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Quick links</CardTitle></CardHeader>
          <CardContent className="grid gap-2">
            <Link href="/jobs/" className="hover:bg-accent flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors">
              <BriefcaseBusiness className="size-4" /> <span className="flex-1">Search LinkedIn jobs</span> →
            </Link>
            <Link href="/instagram/" className="hover:bg-accent flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors">
              <Camera className="size-4" /> <span className="flex-1">Fetch Instagram metadata</span> →
            </Link>
            <Link href="/docs/" className="hover:bg-accent flex items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors">
              <code className="font-mono text-xs">/docs</code> <span className="flex-1">API reference</span> →
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
