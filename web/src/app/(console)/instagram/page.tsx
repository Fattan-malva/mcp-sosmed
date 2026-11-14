"use client";

import * as React from "react";
import { ExternalLink, Image as ImageIcon, Camera, Loader2, Search } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

interface Meta { url: string; title: string | null; description: string | null; image: string | null; type: string | null }

export default function InstagramPage() {
  const [url, setUrl] = React.useState("https://www.instagram.com/");
  const [data, setData] = React.useState<Meta | null>(null);
  const [busy, setBusy] = React.useState(false);
  const fetchMeta = async () => {
    setBusy(true);
    try { setData((await api<{ data: Meta }>(`/api/instagram?url=${encodeURIComponent(url)}`)).data); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Fetch failed"); }
    finally { setBusy(false); }
  };
  return <div className="grid gap-4">
    <div><h1 className="text-2xl font-semibold tracking-tight">Instagram Metadata</h1><p className="text-muted-foreground text-sm">Read Open Graph metadata from an Instagram URL. Memakai cookie dari menu Cookies (butuh token admin).</p></div>
    <div className="grid items-start gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card><CardHeader><CardTitle className="text-base">Instagram URL</CardTitle></CardHeader><CardContent><form className="grid gap-3" onSubmit={(e) => { e.preventDefault(); fetchMeta(); }}><div className="grid gap-1.5"><Label htmlFor="url">URL</Label><Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.instagram.com/p/..." /></div><Button disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />} Fetch metadata</Button></form></CardContent></Card>
      <Card><CardHeader><CardTitle className="text-base">Preview</CardTitle></CardHeader><CardContent>{!data ? <div className="text-muted-foreground flex flex-col items-center gap-2 py-12 text-center text-sm"><Camera className="size-8" /><p>Enter a public Instagram URL to preview its metadata.</p></div> : <div className="grid gap-4 sm:grid-cols-[180px_minmax(0,1fr)]">{data.image ? <img src={data.image} alt="" className="aspect-square w-full rounded-md border object-cover" /> : <div className="bg-muted flex aspect-square items-center justify-center rounded-md"><ImageIcon className="text-muted-foreground size-8" /></div>}<div className="space-y-3"><div><p className="text-muted-foreground text-xs uppercase">Title</p><p className="text-sm font-medium">{data.title || "—"}</p></div><div><p className="text-muted-foreground text-xs uppercase">Description</p><p className="text-sm">{data.description || "—"}</p></div><div className="flex flex-wrap gap-2"><code className="bg-muted rounded px-2 py-1 font-mono text-xs">{data.type || "unknown"}</code><Button variant="outline" size="sm" asChild><a href={data.url} target="_blank" rel="noreferrer"><ExternalLink className="size-3" /> Open URL</a></Button></div></div></div>}</CardContent></Card>
    </div>
  </div>;
}
