"use client";

import * as React from "react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeSwitch } from "@/components/theme-switch";

export function SiteHeader() {
  return (
    <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4">
      <SidebarTrigger className="-ml-1" />
      <div className="bg-border h-5 w-px shrink-0" aria-hidden />
      <div className="flex-1" />
      <ThemeSwitch />
      <span className="text-muted-foreground hidden text-xs sm:block">Public API</span>
    </header>
  );
}
