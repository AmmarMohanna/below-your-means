"use client";

import Link from "next/link";

import AppIcon from "./AppIcon";

import styles from "./bottom-nav.module.css";

const navItems = [
  { key: "dashboard", label: "Today", icon: "today", href: "/dashboard" },
  { key: "accounts", label: "Money", icon: "money", href: "/accounts" },
  { key: "lifestyle", label: "Life", icon: "life", href: "/lifestyle" },
  { key: "analytics", label: "Dashboard", icon: "analytics", href: "/analytics" },
];

export default function BottomNav({ active }) {
  return (
    <nav className={styles.bottomNav} aria-label="Main navigation">
      {navItems.map((item) => (
        <Link
          key={item.key}
          href={item.href}
          aria-current={active === item.key ? "page" : undefined}
          className={`${styles.navItem} ${active === item.key ? styles.active : ""}`}
        >
          <AppIcon name={item.icon} />
          <span>{item.label}</span>
        </Link>
      ))}
    </nav>
  );
}
