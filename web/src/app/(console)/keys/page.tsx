"use client";

import * as React from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Loader2, Plus, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

interface KeyRecord {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
  revoked: boolean;
}

const errorText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Terjadi kesalahan");
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString("id-ID") : "belum pernah");

export default function KeysPage() {
  const [keys, setKeys] = React.useState<KeyRecord[]>([]);
  const [name, setName] = React.useState("");
  const [created, setCreated] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await api<{ data: KeyRecord[] }>("/api/keys");
      setKeys(res.data);
    } catch (e) {
      toast.error(errorText(e));
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    setBusy(true);
    try {
      const res = await api<{ data: { key: string; record: KeyRecord } }>("/api/keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setCreated(res.data.key);
      setName("");
      toast.success("API key dibuat. Salin sekarang, key tidak ditampilkan lagi.");
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    try {
      await api(`/api/keys/${id}`, { method: "DELETE" });
      toast.success("API key dicabut");
      load();
    } catch (e) {
      toast.error(errorText(e));
    }
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Disalin");
    } catch {
      toast.error("Gagal menyalin, salin manual");
    }
  };

  const base = typeof window !== "undefined" ? window.location.origin : "https://your-domain";
  const example = created ?? "msk_xxxxxxxx";

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">API Keys</h1>
        <p className="text-muted-foreground text-sm">
          Key untuk aplikasi lain agar bisa mengambil data hasil fetch Instagram dan LinkedIn. Key hanya membuka endpoint data
          (baca saja), tidak bisa dipakai untuk AI Test, MCP, atau mengubah cookie.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Buat API key</CardTitle>
          <CardDescription>Beri nama yang menunjukkan aplikasi pemakainya.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              create();
            }}
          >
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="key-name">Nama</Label>
              <Input id="key-name" placeholder="mis. Dashboard tim marketing" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Buat key
            </Button>
          </form>

          {created && (
            <div className="grid gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3">
              <p className="text-xs font-medium">Salin key ini sekarang. Tidak akan ditampilkan lagi.</p>
              <div className="flex items-center gap-2">
                <code className="bg-background flex-1 overflow-x-auto rounded px-2 py-1 font-mono text-xs">{created}</code>
                <Button variant="outline" size="sm" onClick={() => copy(created)}>
                  <Copy className="size-3" /> Salin
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Daftar key</CardTitle>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">Belum ada API key.</p>
          ) : (
            <div className="grid gap-2">
              {keys.map((k) => (
                <div key={k.id} className="flex flex-col gap-2 rounded-md border p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2">
                      <KeyRound className="text-muted-foreground size-4" />
                      <p className="truncate text-sm font-medium">{k.name}</p>
                      {k.revoked ? <Badge variant="outline">dicabut</Badge> : <Badge variant="secondary">aktif</Badge>}
                    </div>
                    <p className="text-muted-foreground font-mono text-xs">{k.prefix}…</p>
                    <p className="text-muted-foreground text-xs">
                      Dibuat {when(k.createdAt)} · Terakhir dipakai {when(k.lastUsedAt)}
                    </p>
                  </div>
                  {!k.revoked && (
                    <Button variant="outline" size="sm" onClick={() => revoke(k.id)}>
                      <Trash2 className="size-3" /> Cabut
                    </Button>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cara pakai</CardTitle>
          <CardDescription>Kirim key di header Authorization. Contoh untuk mengambil data:</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2">
          <pre className="bg-muted overflow-x-auto rounded-md p-3 font-mono text-xs">{`curl -H "Authorization: Bearer ${example}" \\
  ${base}/api/instagram/users/instagram

curl -H "Authorization: Bearer ${example}" \\
  "${base}/api/instagram/search?q=jakarta&type=hashtags"

curl -H "Authorization: Bearer ${example}" \\
  "${base}/api/linkedin?url=https://www.linkedin.com/posts/..."`}</pre>
        </CardContent>
      </Card>
    </div>
  );
}
