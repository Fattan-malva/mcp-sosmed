"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2, Save, Trash2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CookieFields, toCookiePayload, type CookieRow } from "@/components/cookie-fields";

interface Status {
  platform: string;
  configured: boolean;
  missingRequired: string[];
  cookieNames: string[];
  updatedAt: string | null;
}

const errorText = (e: unknown) => (e instanceof ApiError || e instanceof Error ? e.message : "Terjadi kesalahan");

/** Form cookie LinkedIn (li_at). Dipakai di halaman Jobs. Cookie tersimpan di cookies.json. */
export function LinkedinSession() {
  const [status, setStatus] = React.useState<Status | null>(null);
  const defaults = (): CookieRow[] => [
    { name: "li_at", value: "" },
    { name: "JSESSIONID", value: "" },
  ];
  const [rows, setRows] = React.useState<CookieRow[]>(defaults);
  const payload = toCookiePayload(rows);
  const hasRequired = payload.some((r) => r.name === "li_at");
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    try {
      const res = await api<{ data: Status[] }>("/api/cookies");
      setStatus(res.data.find((s) => s.platform === "linkedin") ?? null);
    } catch (e) {
      toast.error(errorText(e));
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  const save = async () => {
    setBusy(true);
    try {
      await api("/api/cookies/linkedin", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cookies: payload }),
      });
      setRows(defaults());
      toast.success("Cookie LinkedIn disimpan");
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await api("/api/cookies/linkedin", { method: "DELETE" });
      toast.success("Cookie LinkedIn dihapus");
      load();
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">Session LinkedIn</CardTitle>
          <Badge variant={status?.configured ? "secondary" : "outline"}>{status?.configured ? "Terisi" : "Belum diisi"}</Badge>
        </div>
        <CardDescription>
          Opsional. Isi cookie satu per satu. <code className="font-mono">li_at</code> wajib. Disimpan di cookies.json.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        {status?.cookieNames?.length ? (
          <p className="text-muted-foreground text-xs">Cookie tersimpan: {status.cookieNames.join(", ")}</p>
        ) : null}
        <CookieFields rows={rows} onChange={setRows} required={["li_at"]} />
        <div className="flex flex-wrap gap-2">
          <Button disabled={busy || !hasRequired} onClick={save}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />} Simpan
          </Button>
          <Button variant="outline" disabled={busy || !status?.configured} onClick={remove}>
            <Trash2 className="size-4" /> Hapus
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
