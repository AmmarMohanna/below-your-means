"use client";

import { useRouter } from "next/navigation";

import styles from "./bottom-nav.module.css";

const navItems = [
  { key: "dashboard", label: "Home", icon: "🏠", href: "/dashboard" },
  { key: "accounts", label: "Money", icon: "💰", href: "/accounts" },
  { key: "lifestyle", label: "Life", icon: "🌙", href: "/lifestyle" },
  { key: "settings", label: "Settings", icon: "⚙️", href: "/settings" },
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
          <span className={styles.navIcon}>{item.icon}</span>
          <span>{item.label}</span>
        </button>
      ))}
    </nav>
  );
}
