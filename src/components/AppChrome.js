"use client";

import { usePathname } from "next/navigation";

export default function AppChrome({ children }) {
  const pathname = usePathname();
  const page = pathname?.startsWith("/accounts") ? "money"
    : pathname?.startsWith("/lifestyle") ? "life"
      : pathname?.startsWith("/analytics") ? "analytics"
        : pathname?.startsWith("/settings") ? "settings" : "today";

  return <div className="appChrome" data-page={page}>{children}</div>;
}
