"use client";

import { useRouter } from "next/navigation";

import styles from "./bottom-nav.module.css";

const navItems = [
  { key: "dashboard", label: "Home", href: "/dashboard" },
  { key: "accounts", label: "Money", href: "/accounts" },
  { key: "lifestyle", label: "Life", href: "/lifestyle" },
  { key: "analytics", label: "Review", href: "/analytics" },
  { key: "settings", label: "Settings", href: "/settings" },
];

export default function BottomNav({ active }) {
  const router = useRouter();

  return (
    <nav className={styles.bottomNav}>
      {navItems.map((item) => (
        <button
          key={item.key}
          type="button"
          className={`${styles.navItem} ${active === item.key ? styles.active : ""}`}
          onClick={() => router.push(item.href)}
        >
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
