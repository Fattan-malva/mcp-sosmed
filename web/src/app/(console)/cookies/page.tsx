"use client";

import * as React from "react";
import { CheckCircle2, KeyRound, Loader2, Save, Trash2, XCircle } from "lucide-react";
import { api, getAdminToken, setAdminToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";

interface Status {
  platform: "instagram" | "linkedin";
  label: string;
  configured: boolean;
  missingRequired: string[];
  cookieNames: string[];
  updatedAt: string | null;
}

const HINTS: Record<Status["platform"], string> = {
  instagram: "Wajib ada: sessionid. Contoh: sessionid=...; csrftoken=...; ds_user_id=...",
  linkedin: "Wajib ada: li_at. JSESSIONID disarankan (dipakai sebagai csrf-token).",
};

const errorText = (e: unknown) => (e instanceof Error ? e.message : "Terjadi kesalahan");

export default function CookiesPage() {
  const [token, setToken] = React.useState("");
  const [statuses, setStatuses] = React.useState<Status[]>([]);
  const [drafts, setDrafts] = React.useState<Record<string, string>>({ instagram: "", linkedin: "" });
  const [busy, setBusy] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const { data } = await api<{ data: Status[] }>("/api/cookies");
      setStatuses(data.filter((s) => s.platform === "linkedin"));
    } catch (e) {
      toast.error(errorText(e));
    }
  }, []);

  React.useEffect(() => {
    setToken(getAdminToken());
    load();
  }, [load]);

  const saveToken = () => {
    setAdminToken(token.trim());
    toast.success(token.trim() ? "Token disimpan di browser ini" : "Token dihapus");
    load();
  };

  const save = async (platform: string) => {
    setBusy(platform);
    try {
      const { data } = await api<{ data: Status }>(`/api/cookies/${platform}`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cookies: drafts[platform] }),
      });
      setStatuses((prev) => prev.map((s) => (s.platform === platform ? data : s)));
      setDrafts((d) => ({ ...d, [platform]: "" }));
      toast.success(`Cookie ${data.label} disimpan`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (platform: string, label: string) => {
    setBusy(platform);
    try {
      const { data } = await api<{ data: Status }>(`/api/cookies/${platform}`, { method: "DELETE" });
      setStatuses((prev) => prev.map((s) => (s.platform === platform ? data : s)));
      toast.success(`Cookie ${label} dihapus`);
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Cookies</h1>
        <p className="text-muted-foreground text-sm">
          Simpan cookie sesi Instagram dan LinkedIn. Semua data disimpan di <code className="font-mono">data/cookies.json</code> di server.
          Nilai cookie tidak pernah ditampilkan lagi setelah disimpan.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Token admin</CardTitle>
          <CardDescription>Dibutuhkan untuk menyimpan cookie dan untuk endpoint /mcp. Diisi sama dengan ADMIN_TOKEN di .env server.</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex flex-col gap-3 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              saveToken();
            }}
          >
            <div className="grid flex-1 gap-1.5">
              <Label htmlFor="token">ADMIN_TOKEN</Label>
              <Input id="token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
            </div>
            <Button type="submit" variant="outline">Simpan token</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        {statuses.map((s) => (
          <Card key={s.platform}>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <KeyRound className="size-4" /> {s.label}
                </CardTitle>
                {s.configured ? (
                  <Badge variant="secondary" className="gap-1"><CheckCircle2 className="size-3" /> Tersimpan</Badge>
                ) : (
                  <Badge variant="outline" className="gap-1"><XCircle className="size-3" /> Belum ada</Badge>
                )}
              </div>
              <CardDescription>{HINTS[s.platform]}</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              {s.cookieNames.length > 0 && (
                <div className="space-y-1">
                  <p className="text-muted-foreground text-xs uppercase">Cookie tersimpan</p>
                  <div className="flex flex-wrap gap-1.5">
                    {s.cookieNames.map((n) => (
                      <code key={n} className="bg-muted rounded px-2 py-0.5 font-mono text-xs">{n}</code>
                    ))}
                  </div>
                  {s.updatedAt && <p className="text-muted-foreground text-xs">Terakhir diubah {new Date(s.updatedAt).toLocaleString("id-ID")}</p>}
                </div>
              )}
              {s.cookieNames.length > 0 && s.missingRequired.length > 0 && (
                <p className="text-destructive text-xs">Belum lengkap, kurang: {s.missingRequired.join(", ")}</p>
              )}
              <div className="grid gap-1.5">
                <Label htmlFor={`cookie-${s.platform}`}>Input cookie (teks header atau JSON)</Label>
                <Textarea
                  id={`cookie-${s.platform}`}
                  rows={5}
                  className="font-mono text-xs"
                  placeholder={s.platform === "instagram" ? "sessionid=...; csrftoken=...; ds_user_id=..." : "li_at=...; JSESSIONID=\"ajax:...\""}
                  value={drafts[s.platform]}
                  onChange={(e) => setDrafts((d) => ({ ...d, [s.platform]: e.target.value }))}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button disabled={busy !== null || !drafts[s.platform].trim()} onClick={() => save(s.platform)}>
                  {busy === s.platform ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Simpan
                </Button>
                <Button variant="outline" disabled={busy !== null || !s.configured} onClick={() => remove(s.platform, s.label)}>
                  <Trash2 className="size-4" /> Hapus
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
