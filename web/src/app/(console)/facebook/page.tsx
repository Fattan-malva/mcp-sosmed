"use client";

import * as React from "react";
import { SocialScrapePanel, type ModuleInfo } from "@/components/social-scrape";
import { api } from "@/lib/api";

export default function FacebookPage() {
  const [modules, setModules] = React.useState<ModuleInfo[]>([]);
  React.useEffect(() => {
    api<{ data: ModuleInfo[] }>("/api/social/modules").then((r) => setModules(r.data.filter((m) => m.platform === "facebook")));
  }, []);
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Facebook</h1>
        <p className="text-muted-foreground text-sm">Postingan publik halaman, grup, dan komunitas lewat snscrape. Tanpa login.</p>
      </div>
      <SocialScrapePanel modules={modules} />
    </div>
  );
}
