"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { useAuth } from "../_auth/AuthProvider";

const nav = [
  { href: "/admin", label: "Дашборд" },
  { href: "/admin/calendar", label: "Календарь" },
  { href: "/admin/services", label: "Услуги" },
  { href: "/admin/staff", label: "Сотрудники" },
  { href: "/admin/clients", label: "Клиенты" },
  { href: "/admin/finance", label: "Финансы" },
  { href: "/admin/payroll", label: "Зарплаты" },
  { href: "/admin/settings", label: "Настройки" }
];

function cn(a: string, b?: string) {
  return b ? `${a} ${b}` : a;
}

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { session, ensureMe, logout } = useAuth();

  // Защита: если нет токена — на логин
  useEffect(() => {
    if (!session?.accessToken) {
      router.replace("/admin/login");
      return;
    }
    ensureMe().catch(() => router.replace("/admin/login"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  const userLabel = useMemo(() => {
    if (!session?.user) return "Гость";
    const role =
      session.user.role === "owner"
        ? "Владелец"
        : session.user.role === "admin"
        ? "Админ"
        : session.user.role === "staff"
        ? "Сотрудник"
        : "Клиент";
    return `${session.user.name} • ${role}`;
  }, [session?.user]);

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          <aside className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-4">
            <div className="mb-4">
              <div className="text-lg font-semibold">Админ-панель</div>
              <div className="text-xs text-zinc-400">YC-like (demo)</div>
            </div>

            <nav className="space-y-1">
              {nav.map((i) => {
                const active = pathname === i.href;
                return (
                  <Link
                    key={i.href}
                    href={i.href}
                    className={cn(
                      "block rounded-xl px-3 py-2 text-sm transition border",
                      active
                        ? "border-emerald-400/40 bg-emerald-500/10"
                        : "border-transparent hover:border-zinc-800 hover:bg-zinc-900/50"
                    )}
                  >
                    {i.label}
                  </Link>
                );
              })}
            </nav>

            <div className="mt-6 rounded-xl border border-zinc-800 bg-zinc-950/40 p-3">
              <div className="text-xs text-zinc-400">Вы вошли как</div>
              <div className="text-sm font-medium">{userLabel}</div>

              <button
                onClick={() => logout()}
                className="mt-3 w-full rounded-xl bg-zinc-100 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-white"
              >
                Выйти
              </button>
            </div>
          </aside>

          <main className="rounded-2xl border border-zinc-800 bg-zinc-900/40 p-5">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
