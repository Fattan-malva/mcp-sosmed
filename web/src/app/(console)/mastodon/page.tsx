"use client";

import * as React from "react";
import { SocialScrapePanel, type ModuleInfo } from "@/components/social-scrape";
import { api } from "@/lib/api";

export default function MastodonPage() {
  const [modules, setModules] = React.useState<ModuleInfo[]>([]);
  React.useEffect(() => {
    api<{ data: ModuleInfo[] }>("/api/social/modules").then((r) => setModules(r.data.filter((m) => m.platform === "mastodon")));
  }, []);
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mastodon</h1>
        <p className="text-muted-foreground text-sm">Toot publik profil dan thread Mastodon lewat snscrape. Gunakan @akun@instance atau URL.</p>
      </div>
      <SocialScrapePanel modules={modules} />
    </div>
  );
}
