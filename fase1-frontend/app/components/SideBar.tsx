"use client";
import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@clerk/nextjs";
import { useState } from "react";
import Link from "next/link";

const NAV_ITEMS = [
  { label: "Hoy", path: "/", icon: "sun" },
  { label: "Calendario", path: "/calendario", icon: "calendar" },
  { label: "Objetivos", path: "/objetivos", icon: "target" },
  { label: "Agenda", path: "/agenda", icon: "list" },
];

const ICONS: Record<string, (color: string) => React.JSX.Element> = {
  sun: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  ),
  calendar: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  ),
  target: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="6" /><circle cx="12" cy="12" r="2" />
    </svg>
  ),
  list: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  ),
  settings: (c) => (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
};

export default function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useUser();

  if (pathname.startsWith("/sign-in") || pathname.startsWith("/sign-up")) return null;

  return (
    <aside style={{
      position: "fixed", top: 0, left: 0, bottom: 0,
      width: 240, background: "#FFFFFF",
      borderRight: "1px solid #E5E7EB",
      display: "flex", flexDirection: "column",
      fontFamily: "'Inter', system-ui, sans-serif",
      zIndex: 40,
    }}>
      {/* Logo */}
      <div style={{
        padding: "24px 20px 32px",
        display: "flex", alignItems: "center", gap: 10,
      }}>
        <span style={{
          width: 32, height: 32, borderRadius: 10,
          background: "#6366F1", display: "flex",
          alignItems: "center", justifyContent: "center",
          color: "#FFFFFF", fontWeight: 800, fontSize: 16,
        }}>C</span>
        <span style={{ fontWeight: 700, fontSize: 16, color: "#1A1A1A", letterSpacing: "-0.3px" }}>
          ChangeME
        </span>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "0 12px", display: "flex", flexDirection: "column", gap: 2 }}>
        {NAV_ITEMS.map(item => {
          const active = pathname === item.path;
          return (
            <NavItem
              key={item.path}
              label={item.label}
              icon={item.icon}
              active={active}
              href={item.path}
            />
          );
        })}
      </nav>

      {/* Bottom */}
      <div style={{ padding: "12px", borderTop: "1px solid #E5E7EB" }}>
        <NavItem
          label="Ajustes"
          icon="settings"
          active={pathname === "/ajustes"}
          href="/ajustes"
        />

        {/* User */}
        {user && (
          <div style={{
            display: "flex", alignItems: "center", gap: 10,
            padding: "12px 12px 8px", marginTop: 8,
          }}>
            {user.imageUrl && (
              <img src={user.imageUrl} alt="" style={{ width: 28, height: 28, borderRadius: "50%" }} />
            )}
            <div style={{ overflow: "hidden" }}>
              <p style={{ fontSize: 13, fontWeight: 600, color: "#1A1A1A", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user.firstName || "Usuario"}
              </p>
              <p style={{ fontSize: 11, color: "#9CA3AF", margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {user.primaryEmailAddress?.emailAddress || ""}
              </p>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function NavItem({ label, icon, active, href }: {
  label: string; icon: string; active: boolean; href: string;
}) {
  const [hover, setHover] = useState(false);

  return (
    <Link
      href={href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex", alignItems: "center", gap: 10,
        width: "100%", padding: "10px 12px",
        background: active ? "#EEF2FF" : hover ? "#F9FAFB" : "transparent",
        border: "none", borderRadius: 10,
        cursor: "pointer",
        transition: "background 0.12s",
        textDecoration: "none",
      }}
    >
      {ICONS[icon](active ? "#6366F1" : "#6B7280")}
      <span style={{
        fontSize: 14, fontWeight: active ? 600 : 500,
        color: active ? "#4F46E5" : "#1A1A1A",
      }}>
        {label}
      </span>
    </Link>
  );
}