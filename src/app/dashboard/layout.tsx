"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import BusinessSelector from "@/components/BusinessSelector";
import { BRANDING } from "@/config/branding";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const navItems = [
    { href: "/dashboard", label: "Dashboard" },
    { href: "/add-product", label: "Add Product" },
    { href: "/import-products", label: "Import" },
    { href: "/categories", label: "Categories" },
    { href: "/team", label: "Team" },
    { href: "/business-settings", label: "Business Settings" },
  ];

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3">
          <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <div className="flex flex-wrap items-center gap-3">
              <Link href="/dashboard" className="text-lg font-semibold tracking-wide text-slate-900">
                {BRANDING.name}
              </Link>
              <BusinessSelector />
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/import-products"
                className="hidden rounded-md border border-blue-200 px-3 py-2 text-sm font-semibold text-blue-600 transition hover:border-blue-400 hover:text-blue-700 sm:inline-flex"
              >
                Import CSV
              </Link>
              <Link
                href="/add-product"
                className="rounded-md bg-blue-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
              >
                New Product
              </Link>
            </div>
          </div>
          <nav className="hidden items-center gap-2 text-sm font-medium text-slate-600 md:flex">
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-md px-3 py-2 transition hover:bg-slate-100 hover:text-slate-900",
                  pathname === item.href && "bg-slate-900 text-white hover:bg-slate-900"
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
