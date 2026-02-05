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
        <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
          {error}
        </div>
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
  );
}
