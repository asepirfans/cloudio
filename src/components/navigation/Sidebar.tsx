"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Search, Library, Music2 } from "lucide-react";
import { clsx } from "clsx";

const NAV_ITEMS = [
  { href: "/", label: "Home", icon: Home },
  { href: "/search", label: "Search", icon: Search },
  { href: "/library", label: "Library", icon: Library },
] as const;

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="hidden md:flex flex-col w-56 shrink-0 h-full border-r"
      style={{
        borderColor: "var(--color-border)",
        backgroundColor: "var(--color-surface)",
      }}
    >
      {/* Logo */}
      <div className="px-5 pt-6 pb-4">
        <Link
          href="/"
          className="flex items-center gap-2 group"
          aria-label="CloudBeats home"
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ backgroundColor: "var(--color-accent)" }}
          >
            <Music2 size={16} className="text-black" aria-hidden="true" />
          </div>
          <span
            className="font-semibold text-[15px] tracking-tight"
            style={{ color: "var(--color-text-primary)" }}
          >
            CloudBeats
          </span>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-2 pb-4" aria-label="Main navigation">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={clsx(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-fast",
                    isActive
                      ? "text-accent bg-accent/10"
                      : "text-secondary hover:text-primary hover:bg-elevated"
                  )}
                  aria-current={isActive ? "page" : undefined}
                >
                  <Icon
                    size={18}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    aria-hidden="true"
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
