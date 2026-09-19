"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { Home, Search, Library } from "lucide-react";
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
          className="inline-flex items-center group transition-opacity hover:opacity-90"
          aria-label="Cloudio home"
        >
          <Image
            src="/logo-horizontal.png"
            alt="Cloudio"
            width={136}
            height={30}
            className="h-7 w-auto object-contain"
            priority
          />
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
