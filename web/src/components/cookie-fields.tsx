"use client";

import * as React from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface CookieRow {
  name: string;
  value: string;
}

// Nama cookie yang sering dipakai. Ditampilkan sebagai saran di input nama.
export const COMMON_COOKIES = ["sessionid", "csrftoken", "ds_user_id", "mid", "ig_did", "datr", "rur", "li_at", "JSESSIONID", "bcookie", "lidc"];

/** Ubah baris form jadi payload: buang baris kosong dan rapikan spasi. */
export function toCookiePayload(rows: CookieRow[]): CookieRow[] {
  return rows
    .map((r) => ({ name: r.name.trim(), value: r.value.trim() }))
    .filter((r) => r.name && r.value);
}

/**
 * Input cookie satu per satu: setiap cookie punya field nama dan nilai sendiri.
 * `required` ditampilkan sebagai baris wajib (nama terkunci, nilai harus diisi).
 */
export function CookieFields({
  rows,
  onChange,
  required = [],
}: {
  rows: CookieRow[];
  onChange: (rows: CookieRow[]) => void;
  required?: string[];
}) {
  const update = (index: number, patch: Partial<CookieRow>) =>
    onChange(rows.map((r, i) => (i === index ? { ...r, ...patch } : r)));
  const remove = (index: number) => onChange(rows.filter((_, i) => i !== index));
  const add = () => onChange([...rows, { name: "", value: "" }]);
  const listId = React.useId();

  return (
    <div className="grid gap-2">
      <div className="text-muted-foreground grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] gap-2 text-xs uppercase">
        <span>Nama cookie</span>
        <span>Nilai</span>
        <span className="sr-only">Hapus</span>
      </div>
      {rows.map((row, i) => {
        const isRequired = required.includes(row.name.trim());
        return (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto] items-center gap-2">
            <Input
              list={listId}
              placeholder="mis. sessionid"
              value={row.name}
              className="font-mono text-xs"
              onChange={(e) => update(i, { name: e.target.value })}
            />
            <Input
              placeholder={isRequired ? "wajib diisi" : "nilai cookie"}
              value={row.value}
              className="font-mono text-xs"
              autoComplete="off"
              onChange={(e) => update(i, { value: e.target.value })}
            />
            <Button variant="ghost" size="icon" aria-label="Hapus baris" onClick={() => remove(i)}>
              <X className="size-4" />
            </Button>
          </div>
        );
      })}
      <datalist id={listId}>
        {COMMON_COOKIES.map((n) => (
          <option key={n} value={n} />
        ))}
      </datalist>
      <div>
        <Button variant="outline" size="sm" onClick={add}>
          <Plus className="size-3" /> Tambah cookie
        </Button>
      </div>
      {required.length > 0 && (
        <p className="text-muted-foreground text-xs">Wajib: {required.join(", ")}. Cookie lain opsional tapi membantu stabilitas session.</p>
      )}
    </div>
  );
}
