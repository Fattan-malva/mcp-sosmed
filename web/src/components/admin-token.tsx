"use client";

import * as React from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";
import { getAdminToken, setAdminToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

/**
 * Tombol di header untuk mengisi token admin (ADMIN_TOKEN di .env server).
 * Token disimpan di browser ini saja. Dibutuhkan untuk menyimpan cookie,
 * membuat API key, dan memakai AI Test.
 */
export function AdminTokenButton() {
  const [open, setOpen] = React.useState(false);
  const [token, setToken] = React.useState("");
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setSaved(Boolean(getAdminToken()));
  }, [open]);

  const save = () => {
    setAdminToken(token.trim());
    setSaved(Boolean(token.trim()));
    setToken("");
    setOpen(false);
    toast.success(token.trim() ? "Token admin disimpan di browser ini" : "Token admin dihapus");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={saved ? "ghost" : "outline"} size="sm" className="gap-1.5">
          <KeyRound className="size-4" />
          <span className="hidden sm:inline">{saved ? "Token admin" : "Isi token admin"}</span>
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Token admin</DialogTitle>
          <DialogDescription>
            Sama dengan ADMIN_TOKEN di file .env server. Dibutuhkan untuk menyimpan cookie, membuat API key, dan AI Test.
            Token hanya disimpan di browser ini.
          </DialogDescription>
        </DialogHeader>
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor="admin-token">ADMIN_TOKEN</Label>
            <Input id="admin-token" type="password" autoComplete="off" value={token} onChange={(e) => setToken(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setAdminToken(""); setSaved(false); toast.success("Token admin dihapus"); setOpen(false); }}>
              Hapus token
            </Button>
            <Button type="submit" disabled={!token.trim()}>Simpan</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
