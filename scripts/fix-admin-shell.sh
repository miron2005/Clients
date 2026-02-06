#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# 1) admin/layout.tsx — Providers only
cat > frontend/app/admin/layout.tsx <<'FILE'
import Providers from "./_auth/Providers";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <Providers>{children}</Providers>;
}
FILE

# 2) AuthProvider — сразу читаем localStorage, чтобы не было лишнего редиректа на /admin/login
cat > frontend/app/admin/_auth/AuthProvider.tsx <<'FILE'
"use client";

import { createContext, useContext, useMemo, useState } from "react";
import type { AuthSession } from "@/lib/auth-store";
import { clearSession, loadSession, saveSession } from "@/lib/auth-store";
import { apiGet, apiPost, DEFAULT_TENANT } from "@/lib/api";

type AuthContextValue = {
  session: AuthSession | null;
  token: string | null;
  tenantSlug: string;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  ensureMe: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const v = useContext(AuthContext);
  if (!v) throw new Error("useAuth() должен использоваться внутри <AuthProvider/>");
  return v;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // Сразу читаем localStorage, чтобы защищённые страницы не редиректили на /admin/login
  // до того, как React успеет выполнить useEffect.
  const [session, setSession] = useState<AuthSession | null>(() => loadSession());
  const tenantSlug = DEFAULT_TENANT;

  const token = session?.accessToken ?? null;

  async function login(email: string, password: string) {
    const resp = await apiPost<AuthSession>("/auth/login", { email, password }, { tenantSlug });
    saveSession(resp);
    setSession(resp);
  }

  async function logout() {
    try {
      const s = loadSession();
      if (s?.refreshToken) {
        await apiPost("/auth/logout", { refreshToken: s.refreshToken }, { tenantSlug });
      }
    } catch {
      // ignore
    } finally {
      clearSession();
      setSession(null);
    }
  }

  async function refresh() {
    const s = loadSession();
    if (!s?.refreshToken) throw new Error("Нет refreshToken");
    const resp = await apiPost<AuthSession>("/auth/refresh", { refreshToken: s.refreshToken }, { tenantSlug });
    saveSession(resp);
    setSession(resp);
  }

  async function ensureMe() {
    const s = loadSession();
    if (!s?.accessToken) throw new Error("Нет accessToken");
    try {
      await apiGet("/me", { token: s.accessToken, tenantSlug });
    } catch {
      await refresh();
    }
  }

  const value = useMemo<AuthContextValue>(
    () => ({ session, token, tenantSlug, login, logout, refresh, ensureMe }),
    [session, token, tenantSlug]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
FILE

# 3) /admin (дашборд) — чтобы пункт в меню не вёл в 404
cat > frontend/app/admin/page.tsx <<'FILE'
import Link from "next/link";
import AdminShell from "./_ui/AdminShell";

const cards = [
  { href: "/admin/calendar", title: "Календарь", desc: "Записи по дням/неделям, статусы, заметки." },
  { href: "/admin/clients", title: "Клиенты", desc: "CRM: карточки, теги, заметки, согласия." },
  { href: "/admin/finance", title: "Финансы", desc: "Транзакции, категории, касса дня, экспорт." },
  { href: "/admin/payroll", title: "Зарплаты", desc: "Периоды, правила, начисления, отчёты." }
];

export default function AdminHomePage() {
  return (
    <AdminShell>
      <div>
        <div className="text-2xl font-semibold">Дашборд</div>
        <div className="mt-2 text-sm text-zinc-400">
          Быстрые переходы по разделам. В следующих итерациях добавим сводку по выручке, загрузке и показателям.
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {cards.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-4 hover:border-zinc-700"
            >
              <div className="text-base font-semibold">{c.title}</div>
              <div className="mt-1 text-sm text-zinc-400">{c.desc}</div>
            </Link>
          ))}
        </div>
      </div>
    </AdminShell>
  );
}
FILE

# 4) calendar — оборачиваем в AdminShell
cat > frontend/app/admin/calendar/page.tsx <<'FILE'
"use client";

import AdminShell from "../_ui/AdminShell";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch } from "@/lib/api";
import { useAuth } from "../_auth/AuthProvider";

type BookingStatus = "planned" | "arrived" | "no_show" | "cancelled";

type Booking = {
  id: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  priceCents: number;
  currency: string;
  service: { name: string };
  staff: { displayName: string };
  client: { fullName: string; phone: string };
};

function fmtPrice(cents: number) {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
}

function dayISO(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeekMon(d: Date) {
  const x = new Date(d);
  const js = x.getDay(); // 0..6 (Sun..Sat)
  const diff = js === 0 ? -6 : 1 - js; // Monday
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function statusLabel(s: BookingStatus) {
  switch (s) {
    case "planned":
      return "Запланирован";
    case "arrived":
      return "Пришёл";
    case "no_show":
      return "Не пришёл";
    case "cancelled":
      return "Отменён";
  }
}

export default function AdminCalendarPage() {
  const { token, tenantSlug } = useAuth();
  const [weekAnchor, setWeekAnchor] = useState<Date>(new Date());
  const [items, setItems] = useState<Booking[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const weekStart = useMemo(() => startOfWeekMon(weekAnchor), [weekAnchor]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)), [weekStart]);

  async function load() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const from = weekStart.toISOString();
      const to = weekEnd.toISOString();
      const resp = await apiGet<Booking[]>(
        `/admin/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
        { token, tenantSlug }
      );
      setItems(resp);
    } catch {
      setError("Не удалось загрузить календарь. Проверьте backend и токен.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, weekStart.toISOString()]);

  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of items) {
      const key = dayISO(new Date(b.startAt));
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(b);
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      m.set(k, arr);
    }
    return m;
  }, [items]);

  async function changeStatus(id: string, status: BookingStatus) {
    if (!token) return;
    try {
      await apiPatch(`/admin/bookings/${id}/status`, { status }, { token, tenantSlug });
      await load();
    } catch {
      setError("Не удалось изменить статус записи.");
    }
  }

  return (
    <AdminShell>
      <div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-2xl font-semibold">Календарь записей</div>
            <div className="mt-1 text-sm text-zinc-400">
              Неделя: {weekStart.toLocaleDateString("ru-RU")} — {addDays(weekEnd, -1).toLocaleDateString("ru-RU")}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
              onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
            >
              ← Пред. неделя
            </button>
            <button
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
              onClick={() => setWeekAnchor(new Date())}
            >
              Сегодня
            </button>
            <button
              className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
              onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
            >
              След. неделя →
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">{error}</div>
        )}

        <div className="mt-5 grid gap-3 lg:grid-cols-7">
          {days.map((d) => {
            const key = dayISO(d);
            const list = byDay.get(key) ?? [];
            return (
              <div key={key} className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold">
                    {d.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" })}
                  </div>
                  <div className="text-xs text-zinc-500">{list.length} шт.</div>
                </div>

                {loading ? (
                  <div className="mt-3 text-xs text-zinc-500">Загрузка…</div>
                ) : list.length === 0 ? (
                  <div className="mt-3 text-xs text-zinc-500">Нет записей</div>
                ) : (
                  <div className="mt-3 space-y-2">
                    {list.map((b) => (
                      <div key={b.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="text-sm font-medium">{b.service.name}</div>
                            <div className="text-xs text-zinc-400">
                              {new Date(b.startAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })} •{" "}
                              {b.staff.displayName}
                            </div>
                            <div className="mt-1 text-xs text-zinc-300">
                              {b.client.fullName} • {b.client.phone}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-zinc-400">{fmtPrice(b.priceCents)}</div>
                            <div className="mt-1 text-xs">{statusLabel(b.status)}</div>
                          </div>
                        </div>

                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <select
                            className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs"
                            value={b.status}
                            onChange={(e) => changeStatus(b.id, e.target.value as BookingStatus)}
                          >
                            <option value="planned">Запланирован</option>
                            <option value="arrived">Пришёл</option>
                            <option value="no_show">Не пришёл</option>
                            <option value="cancelled">Отменён</option>
                          </select>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </AdminShell>
  );
}
FILE

# 5) остальные разделы — оборачиваем в AdminShell (кроме login)
cat > frontend/app/admin/clients/page.tsx <<'FILE'
import AdminShell from "../_ui/AdminShell";

export default function AdminClients() {
  return (
    <AdminShell>
      <div>
        <div className="text-2xl font-semibold">Клиенты</div>
        <div className="mt-2 text-sm text-zinc-400">
          В Части 5 добавим CRM: карточка клиента, теги, заметки, согласия, сегменты.
        </div>
      </div>
    </AdminShell>
  );
}
FILE

cat > frontend/app/admin/finance/page.tsx <<'FILE'
import AdminShell from "../_ui/AdminShell";

export default function AdminFinance() {
  return (
    <AdminShell>
      <div>
        <div className="text-2xl font-semibold">Финансы</div>
        <div className="mt-2 text-sm text-zinc-400">
          В Части 6 добавим категории, доходы/расходы, кассу дня, возвраты и экспорт CSV.
        </div>
      </div>
    </AdminShell>
  );
}
FILE

cat > frontend/app/admin/payroll/page.tsx <<'FILE'
import AdminShell from "../_ui/AdminShell";

export default function AdminPayroll() {
  return (
    <AdminShell>
      <div>
        <div className="text-2xl font-semibold">Зарплаты</div>
        <div className="mt-2 text-sm text-zinc-400">
          В Части 7 добавим правила (фикс/процент/смешанный), расчёт периодов и закрытие.
        </div>
      </div>
    </AdminShell>
  );
}
FILE

cat > frontend/app/admin/services/page.tsx <<'FILE'
import AdminShell from "../_ui/AdminShell";

export default function AdminServices() {
  return (
    <AdminShell>
      <div>
        <div className="text-2xl font-semibold">Услуги</div>
        <div className="mt-2 text-sm text-zinc-400">
          В Части 5 добавим CRUD услуг (создать/изменить/архивировать), цены и длительность.
        </div>
      </div>
    </AdminShell>
  );
}
FILE

cat > frontend/app/admin/settings/page.tsx <<'FILE'
import AdminShell from "../_ui/AdminShell";

export default function AdminSettings() {
  return (
    <AdminShell>
      <div>
        <div className="text-2xl font-semibold">Настройки</div>
        <div className="mt-2 text-sm text-zinc-400">
          Здесь будет брендирование, публичная страница компании и управление шаблонами сообщений.
        </div>
      </div>
    </AdminShell>
  );
}
FILE

cat > frontend/app/admin/staff/page.tsx <<'FILE'
import AdminShell from "../_ui/AdminShell";

export default function AdminStaff() {
  return (
    <AdminShell>
      <div>
        <div className="text-2xl font-semibold">Сотрудники</div>
        <div className="mt-2 text-sm text-zinc-400">
          В Части 5 добавим CRUD сотрудников + расписание (availability) и привязку к пользователю.
        </div>
      </div>
    </AdminShell>
  );
}
FILE

echo "[OK] Admin pages wrapped with AdminShell (login excluded)."
