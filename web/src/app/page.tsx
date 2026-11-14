"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function HomeRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/dashboard/");
  }, [router]);
  return (
    <div className="text-muted-foreground flex h-svh items-center justify-center text-sm">
      Redirecting to dashboard…
    </div>
  );
}
