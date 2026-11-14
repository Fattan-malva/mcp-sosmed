"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BriefcaseBusiness, Gauge, Camera, BookOpen, Menu, X } from "lucide-react";
import * as React from "react";
import { Button } from "@/components/ui/button";
import { ThemeSwitch } from "@/components/theme-switch";
import { cn } from "@/lib/utils";

const items = [
  { title: "Dashboard", url: "/dashboard/", icon: Gauge },
  { title: "LinkedIn Jobs", url: "/jobs/", icon: BriefcaseBusiness },
  { title: "Instagram", url: "/instagram/", icon: Camera },
  { title: "API Docs", url: "/docs/", icon: BookOpen },
];

export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = React.useState(false);
  return (
    <div className="bg-background min-h-svh">
      {open && <button aria-label="Close menu" className="fixed inset-0 z-20 bg-black/60 md:hidden" onClick={() => setOpen(false)} />}
      <aside className={cn("bg-sidebar fixed inset-y-0 left-0 z-30 flex w-64 -translate-x-full flex-col border-r transition-transform md:translate-x-0", open && "translate-x-0")}>
        <div className="flex h-14 items-center gap-3 border-b px-4">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground flex size-8 items-center justify-center rounded-lg font-bold">S</div>
          <div className="min-w-0"><p className="truncate text-sm font-semibold">mcp-sosmed</p><p className="text-muted-foreground truncate text-xs">Public Social API</p></div>
          <button className="ml-auto md:hidden" onClick={() => setOpen(false)}><X className="size-4" /></button>
        </div>
        <nav className="flex-1 space-y-6 p-3">
          <div><p className="text-muted-foreground mb-2 px-2 text-[10px] font-semibold uppercase tracking-widest">Console</p>
            {items.map((item) => { const active = pathname === item.url || pathname.startsWith(`${item.url}/`); return <Link key={item.url} href={item.url} onClick={() => setOpen(false)} className={cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors", active ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium" : "text-sidebar-foreground hover:bg-sidebar-accent/60")}><item.icon className="size-4" />{item.title}</Link>; })}
          </div>
        </nav>
        <div className="text-muted-foreground border-t p-4 text-xs">Read-only public data tools</div>
      </aside>
      <div className="md:pl-64">
        <header className="bg-background sticky top-0 z-10 flex h-14 items-center gap-3 border-b px-4">
          <Button variant="ghost" size="icon" className="md:hidden" onClick={() => setOpen(true)}><Menu className="size-5" /></Button>
          <div className="bg-border h-5 w-px shrink-0 md:hidden" />
          <div className="flex-1" /><ThemeSwitch />
          <span className="text-muted-foreground hidden text-xs sm:block">Public API</span>
        </header>
        <main className="p-4 md:p-6">{children}</main>
      </div>
    </div>
  );
}
