"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AtSign, BookOpen, BriefcaseBusiness, Bot, Camera, Gauge, KeyRound, Newspaper, Users } from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";

const NAV_GROUPS = [
  {
    label: "Console",
    items: [
      { title: "Dashboard", url: "/dashboard", icon: Gauge },
      { title: "LinkedIn Jobs", url: "/jobs", icon: BriefcaseBusiness },
      { title: "Instagram", url: "/instagram", icon: Camera },
      { title: "Instagram Publik", url: "/instagram-public", icon: Camera },
      { title: "Facebook", url: "/facebook", icon: Users },
      { title: "Mastodon", url: "/mastodon", icon: AtSign },
      { title: "Loker", url: "/loker", icon: Newspaper },
    ],
  },
  {
    label: "Settings",
    items: [
      { title: "API Keys", url: "/keys", icon: KeyRound },
      { title: "AI Test", url: "/ai-test", icon: Bot },
    ],
  },
  {
    label: "Docs",
    items: [{ title: "API Docs", url: "/docs", icon: BookOpen }],
  },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const { setOpenMobile } = useSidebar();

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton size="lg" asChild>
              <Link href="/dashboard" onClick={() => setOpenMobile(false)}>
                <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-8 items-center justify-center rounded-lg font-bold">
                  S
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">mcp-sosmed</span>
                  <span className="text-muted-foreground truncate text-xs">
                    Public Social API
                  </span>
                </div>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>
      <SidebarContent>
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const active = pathname === item.url || pathname.startsWith(`${item.url}/`);
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
                        <Link href={item.url} onClick={() => setOpenMobile(false)}>
                          <item.icon />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter>
        <div className="text-muted-foreground px-4 py-2 text-xs group-data-[collapsible=icon]:hidden">
          <div className="flex items-center gap-2">
            <span>Endpoint</span>
            <Badge variant="secondary" className="font-mono text-[10px]">/mcp</Badge>
          </div>
          <p className="mt-1 truncate">Read-only public data tools</p>
        </div>
      </SidebarFooter>
    </Sidebar>
  );
}
