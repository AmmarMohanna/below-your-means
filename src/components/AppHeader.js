"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import AppIcon from "./AppIcon";
import styles from "./app-header.module.css";

export default function AppHeader({ title, children }) {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.row}>
        <h1 className={styles.title}>{title}</h1>
        <Link href="/settings" className={styles.settings} aria-label="Settings" title="Settings" aria-current={pathname === "/settings" ? "page" : undefined}>
          <AppIcon name="settings" />
        </Link>
      </div>
      {children ? <div className={styles.content}>{children}</div> : null}
    </header>
  );
}
