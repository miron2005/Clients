#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

cat > frontend/app/admin/calendar/page.tsx <<'FILE'
"use client";

import AdminShell from "../_ui/AdminShell";
import { useEffect, useMemo, useRef, useState } from "react";
import { apiGet, apiPatch } from "@/lib/api";
import { useAuth } from "../_auth/AuthProvider";

type BookingStatus = "planned" | "arrived" | "no_show" | "cancelled";
type ViewMode = "week" | "agenda";

type Booking = {
  id: string;
  startAt: string;
  endAt: string;
  status: BookingStatus;
  priceCents: number;
  currency: string;
  notes?: string | null;
  internalNote?: string | null;
  cancelledReason?: string | null;
  createdAt?: string;
  updatedAt?: string;
  service: { name: string };
  staff: { id?: string; displayName: string };
  client: { fullName: string; phone: string };
};

type Staff = { id: string; displayName: string };

function money(cents: number, currency?: string) {
  const cur = currency || "RUB";
  const value = cents / 100;
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: cur }).format(value);
  } catch {
    return `${value.toFixed(2).replace(".", ",")} ${cur}`;
  }
}

function pad2(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dayKeyLocal(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
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

function statusMeta(s: BookingStatus) {
  switch (s) {
    case "planned":
      return { label: "Запланирован", chip: "border-sky-400/30 bg-sky-500/10 text-sky-200" };
    case "arrived":
      return { label: "Пришёл", chip: "border-emerald-400/30 bg-emerald-500/10 text-emerald-200" };
    case "no_show":
      return { label: "Не пришёл", chip: "border-amber-400/30 bg-amber-500/10 text-amber-200" };
    case "cancelled":
      return { label: "Отменён", chip: "border-rose-400/30 bg-rose-500/10 text-rose-200" };
  }
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function dateLabel(d: Date) {
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" });
}

function dateLong(iso: string) {
  return new Date(iso).toLocaleString("ru-RU");
}

async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}

export default function AdminCalendarPage() {
  const { token, tenantSlug } = useAuth();

  const [view, setView] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem("admin.calendar.view");
      return v === "agenda" ? "agenda" : "week";
    } catch {
      return "week";
    }
  });

  const [weekAnchor, setWeekAnchor] = useState<Date>(() => new Date());
  const [items, setItems] = useState<Booking[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);

  const [staffId, setStaffId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Drawer form state
  const [editStatus, setEditStatus] = useState<BookingStatus>("planned");
  const [editReason, setEditReason] = useState("");
  const [editInternal, setEditInternal] = useState("");
  const [copied, setCopied] = useState(false);

  const drawerRef = useRef<HTMLDivElement | null>(null);

  const weekStart = useMemo(() => startOfWeekMon(weekAnchor), [weekAnchor]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)), [weekStart]);

  // Persist view
  useEffect(() => {
    try {
      localStorage.setItem("admin.calendar.view", view);
    } catch {
      // ignore
    }
  }, [view]);

  // Keyboard shortcuts: ←/→ prev/next week, T today, Esc close drawer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        return;
      }
      // Не мешаем вводу в inputs
      const tag = (e.target as any)?.tagName?.toLowerCase?.();
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === "ArrowLeft") setWeekAnchor((d) => addDays(d, -7));
      if (e.key === "ArrowRight") setWeekAnchor((d) => addDays(d, 7));
      if (e.key.toLowerCase() === "t") setWeekAnchor(new Date());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const selected = useMemo(() => items.find((b) => b.id === selectedId) ?? null, [items, selectedId]);

  // Подгружаем список мастеров (для фильтра) — через public API (оно уже есть)
  useEffect(() => {
    (async () => {
      try {
        const resp = await apiGet<{ staff: Staff[] }>(`/public/${tenantSlug}/staff`, { tenantSlug });
        setStaff(resp.staff ?? []);
      } catch {
        // не критично — фильтр просто будет пустой
        setStaff([]);
      }
    })();
  }, [tenantSlug]);

  async function loadBookings() {
    if (!token) return;
    setLoading(true);
    setError("");

    try {
      const from = weekStart.toISOString();
      const to = weekEnd.toISOString();
      const staffParam = staffId !== "all" ? `&staffId=${encodeURIComponent(staffId)}` : "";
      const resp = await apiGet<Booking[]>(
        `/admin/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${staffParam}`,
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
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, weekStart.toISOString(), staffId]);

  // Если выбранная запись сменилась — синхронизируем поля формы
  useEffect(() => {
    if (!selected) return;
    setEditStatus(selected.status);
    setEditReason(selected.cancelledReason ?? "");
    setEditInternal(selected.internalNote ?? "");
    setCopied(false);

    // лёгкая авто-фокусировка drawer (для UX)
    setTimeout(() => drawerRef.current?.focus?.(), 0);
  }, [selected?.id]);

  const filtered = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return items.filter((b) => {
      if (status !== "all" && b.status !== status) return false;

      if (!qq) return true;
      const hay = `${b.client.fullName} ${b.client.phone} ${b.staff.displayName} ${b.service.name}`.toLowerCase();
      return hay.includes(qq);
    });
  }, [items, status, q]);

  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of filtered) {
      const key = dayKeyLocal(new Date(b.startAt));
      if (!m.has(key)) m.set(key, []);
      m.get(key)!.push(b);
    }
    for (const [k, arr] of m) {
      arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      m.set(k, arr);
    }
    return m;
  }, [filtered]);

  const agendaList = useMemo(() => {
    return [...filtered].sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
  }, [filtered]);

  const stats = useMemo(() => {
    const total = filtered.length;
    const cancelled = filtered.filter((b) => b.status === "cancelled").length;
    const arrived = filtered.filter((b) => b.status === "arrived").length;
    const planned = filtered.filter((b) => b.status === "planned").length;
    const revenueCents = filtered
      .filter((b) => b.status !== "cancelled")
      .reduce((sum, b) => sum + (b.priceCents || 0), 0);

    const cur = filtered.find((b) => !!b.currency)?.currency || "RUB";
    return { total, cancelled, arrived, planned, revenueCents, currency: cur };
  }, [filtered]);

  async function quickSetStatus(id: string, next: BookingStatus) {
    if (!token) return;
    setSaving(true);
    setError("");
    try {
      await apiPatch(`/admin/bookings/${id}/status`, { status: next }, { token, tenantSlug });
      // локально обновим
      setItems((prev) => prev.map((b) => (b.id === id ? { ...b, status: next } : b)));
    } catch {
      setError("Не удалось изменить статус записи.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDrawer() {
    if (!token || !selected) return;

    // UX: если отмена — reason желательно
    const payload: any = { status: editStatus, internalNote: editInternal?.trim() || undefined };
    if (editStatus === "cancelled") payload.reason = editReason?.trim() || "Отменено";

    setSaving(true);
    setError("");
    try {
      await apiPatch(`/admin/bookings/${selected.id}/status`, payload, { token, tenantSlug });
      // локально обновим запись
      setItems((prev) =>
        prev.map((b) =>
          b.id === selected.id
            ? {
                ...b,
                status: editStatus,
                internalNote: payload.internalNote ?? null,
                cancelledReason: editStatus === "cancelled" ? payload.reason : null
              }
            : b
        )
      );
    } catch {
      setError("Не удалось сохранить изменения. Проверьте backend.");
    } finally {
      setSaving(false);
    }
  }

  function jumpToDate(dateISO: string) {
    const d = new Date(`${dateISO}T12:00:00`); // полдень — меньше шансов на DST-косяки
    if (!Number.isNaN(d.getTime())) setWeekAnchor(d);
  }

  return (
    <AdminShell>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* LEFT: Calendar */}
        <div className="min-w-0">
          {/* Header */}
          <div className="sticky top-0 z-10 -mx-5 -mt-5 mb-4 border-b border-zinc-800 bg-zinc-950/60 px-5 py-4 backdrop-blur">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-3">
                  <div className="text-2xl font-semibold">Календарь</div>
                  <span className="rounded-full border border-zinc-700 bg-zinc-900/40 px-2 py-1 text-xs text-zinc-300">
                    Неделя {weekStart.toLocaleDateString("ru-RU")} — {addDays(weekEnd, -1).toLocaleDateString("ru-RU")}
                  </span>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-400">
                  <span className="rounded-full border border-zinc-800 bg-zinc-900/30 px-2 py-1">
                    Всего: <b className="text-zinc-200">{stats.total}</b>
                  </span>
                  <span className="rounded-full border border-zinc-800 bg-zinc-900/30 px-2 py-1">
                    Запланировано: <b className="text-zinc-200">{stats.planned}</b>
                  </span>
                  <span className="rounded-full border border-zinc-800 bg-zinc-900/30 px-2 py-1">
                    Пришли: <b className="text-zinc-200">{stats.arrived}</b>
                  </span>
                  <span className="rounded-full border border-zinc-800 bg-zinc-900/30 px-2 py-1">
                    Отмены: <b className="text-zinc-200">{stats.cancelled}</b>
                  </span>
                  <span className="rounded-full border border-zinc-800 bg-zinc-900/30 px-2 py-1">
                    Сумма: <b className="text-zinc-200">{money(stats.revenueCents, stats.currency)}</b>
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
                  <button
                    className={`px-3 py-2 text-sm ${view === "week" ? "bg-zinc-900/60 text-zinc-100" : "text-zinc-300 hover:text-zinc-100"}`}
                    onClick={() => setView("week")}
                    type="button"
                  >
                    Неделя
                  </button>
                  <button
                    className={`px-3 py-2 text-sm ${view === "agenda" ? "bg-zinc-900/60 text-zinc-100" : "text-zinc-300 hover:text-zinc-100"}`}
                    onClick={() => setView("agenda")}
                    type="button"
                  >
                    Список
                  </button>
                </div>

                <button
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                  onClick={() => setWeekAnchor(addDays(weekAnchor, -7))}
                  type="button"
                >
                  ←
                </button>
                <button
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                  onClick={() => setWeekAnchor(new Date())}
                  type="button"
                  title="Горячая клавиша: T"
                >
                  Сегодня
                </button>
                <button
                  className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                  onClick={() => setWeekAnchor(addDays(weekAnchor, 7))}
                  type="button"
                >
                  →
                </button>
              </div>
            </div>

            {/* Filters row */}
            <div className="mt-3 grid gap-2 md:grid-cols-[220px_200px_1fr_160px]">
              <select
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
              >
                <option value="all">Все мастера</option>
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.displayName}
                  </option>
                ))}
              </select>

              <select
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <option value="all">Все статусы</option>
                <option value="planned">Запланирован</option>
                <option value="arrived">Пришёл</option>
                <option value="no_show">Не пришёл</option>
                <option value="cancelled">Отменён</option>
              </select>

              <input
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Поиск: клиент, телефон, услуга, мастер…"
              />

              <input
                type="date"
                className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                onChange={(e) => jumpToDate(e.target.value)}
                title="Перейти к дате"
              />
            </div>

            {error && (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
                {error}
              </div>
            )}
          </div>

          {/* Content */}
          {view === "week" ? (
            <div className="grid gap-3 lg:grid-cols-7">
              {days.map((d) => {
                const key = dayKeyLocal(d);
                const list = byDay.get(key) ?? [];
                const isToday = dayKeyLocal(new Date()) === key;

                return (
                  <div
                    key={key}
                    className={`rounded-2xl border bg-zinc-950/30 p-3 ${
                      isToday ? "border-emerald-400/40" : "border-zinc-800"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold">
                        {dateLabel(d)} {isToday && <span className="text-emerald-300">• сегодня</span>}
                      </div>
                      <div className="text-xs text-zinc-500">{list.length}</div>
                    </div>

                    {loading ? (
                      <div className="mt-3 space-y-2">
                        <div className="h-14 rounded-xl border border-zinc-800 bg-zinc-900/30" />
                        <div className="h-14 rounded-xl border border-zinc-800 bg-zinc-900/30" />
                        <div className="h-14 rounded-xl border border-zinc-800 bg-zinc-900/30" />
                      </div>
                    ) : list.length === 0 ? (
                      <div className="mt-3 text-xs text-zinc-500">Нет записей</div>
                    ) : (
                      <div className="mt-3 space-y-2">
                        {list.map((b) => {
                          const sm = statusMeta(b.status);
                          return (
                            <button
                              key={b.id}
                              className={`w-full rounded-xl border p-3 text-left transition ${
                                selectedId === b.id
                                  ? "border-emerald-400/40 bg-emerald-500/10"
                                  : "border-zinc-800 bg-zinc-900/30 hover:border-zinc-700"
                              }`}
                              onClick={() => setSelectedId(b.id)}
                              type="button"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="truncate text-sm font-semibold">{b.service.name}</div>
                                  <div className="mt-0.5 text-xs text-zinc-400">
                                    {timeLabel(b.startAt)}–{timeLabel(b.endAt)} • {b.staff.displayName}
                                  </div>
                                  <div className="mt-1 truncate text-xs text-zinc-300">
                                    {b.client.fullName} • {b.client.phone}
                                  </div>
                                </div>

                                <div className="text-right">
                                  <div className="text-xs text-zinc-400">{money(b.priceCents, b.currency)}</div>
                                  <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] ${sm.chip}`}>
                                    {sm.label}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-2 flex flex-wrap items-center gap-2">
                                <button
                                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs hover:border-zinc-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    quickSetStatus(b.id, "arrived");
                                  }}
                                  type="button"
                                  disabled={saving}
                                >
                                  Пришёл
                                </button>
                                <button
                                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs hover:border-zinc-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    quickSetStatus(b.id, "no_show");
                                  }}
                                  type="button"
                                  disabled={saving}
                                >
                                  Не пришёл
                                </button>
                                <button
                                  className="rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1 text-xs hover:border-zinc-600"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedId(b.id);
                                  }}
                                  type="button"
                                >
                                  Детали
                                </button>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-2xl border border-zinc-800 bg-zinc-950/30 p-3">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 10 }).map((_, i) => (
                    <div key={i} className="h-16 rounded-xl border border-zinc-800 bg-zinc-900/30" />
                  ))}
                </div>
              ) : agendaList.length === 0 ? (
                <div className="p-6 text-sm text-zinc-400">Нет записей по выбранным фильтрам.</div>
              ) : (
                <div className="divide-y divide-zinc-800">
                  {agendaList.map((b) => {
                    const sm = statusMeta(b.status);
                    return (
                      <button
                        key={b.id}
                        className={`w-full px-3 py-3 text-left transition hover:bg-zinc-900/30 ${
                          selectedId === b.id ? "bg-emerald-500/10" : ""
                        }`}
                        onClick={() => setSelectedId(b.id)}
                        type="button"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="text-sm font-semibold">
                              {new Date(b.startAt).toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" })} •{" "}
                              {timeLabel(b.startAt)}–{timeLabel(b.endAt)}
                            </div>
                            <div className="mt-1 truncate text-sm">{b.service.name}</div>
                            <div className="mt-1 truncate text-xs text-zinc-400">
                              {b.client.fullName} • {b.client.phone} • {b.staff.displayName}
                            </div>
                          </div>

                          <div className="text-right">
                            <div className="text-xs text-zinc-400">{money(b.priceCents, b.currency)}</div>
                            <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] ${sm.chip}`}>
                              {sm.label}
                            </div>
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: Drawer */}
        <div className="relative">
          <div
            ref={drawerRef}
            tabIndex={-1}
            className={`sticky top-6 rounded-2xl border bg-zinc-950/30 p-4 outline-none transition ${
              selected ? "border-zinc-800" : "border-zinc-900"
            }`}
          >
            {!selected ? (
              <div className="p-3">
                <div className="text-lg font-semibold">Детали записи</div>
                <div className="mt-2 text-sm text-zinc-400">
                  Выберите запись слева, чтобы увидеть карточку и быстро менять статус.
                </div>
                <div className="mt-4 text-xs text-zinc-500">
                  Подсказки: <b>T</b> — сегодня, <b>←/→</b> — неделя, <b>Esc</b> — закрыть карточку.
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{selected.service.name}</div>
                    <div className="mt-1 text-sm text-zinc-400">
                      {dateLong(selected.startAt)} — {timeLabel(selected.endAt)} • {selected.staff.displayName}
                    </div>
                  </div>

                  <button
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700"
                    onClick={() => setSelectedId(null)}
                    type="button"
                    title="Esc"
                  >
                    ✕
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap gap-2">
                  {(["planned", "arrived", "no_show", "cancelled"] as BookingStatus[]).map((s) => {
                    const sm = statusMeta(s);
                    const active = editStatus === s;
                    return (
                      <button
                        key={s}
                        className={`rounded-full border px-3 py-1 text-xs transition ${
                          active ? sm.chip : "border-zinc-800 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700"
                        }`}
                        onClick={() => setEditStatus(s)}
                        type="button"
                        disabled={saving}
                      >
                        {sm.label}
                      </button>
                    );
                  })}
                </div>

                <div className="mt-4 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-3">
                  <div className="text-xs text-zinc-400">Клиент</div>
                  <div className="mt-1 text-sm font-medium">{selected.client.fullName}</div>

                  <div className="mt-2 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-zinc-400">Телефон</div>
                      <div className="truncate text-sm">{selected.client.phone}</div>
                    </div>

                    <button
                      className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs hover:border-zinc-700"
                      onClick={async () => {
                        const ok = await copyText(selected.client.phone);
                        setCopied(ok);
                        setTimeout(() => setCopied(false), 1200);
                      }}
                      type="button"
                    >
                      {copied ? "Скопировано" : "Копировать"}
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-2">
                      <div className="text-xs text-zinc-400">Стоимость</div>
                      <div className="mt-0.5 font-semibold">{money(selected.priceCents, selected.currency)}</div>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/40 p-2">
                      <div className="text-xs text-zinc-400">Статус</div>
                      <div className="mt-0.5 font-semibold">{statusMeta(editStatus).label}</div>
                    </div>
                  </div>
                </div>

                {editStatus === "cancelled" && (
                  <div className="mt-3">
                    <div className="mb-1 text-sm text-zinc-300">Причина отмены</div>
                    <input
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Например: Клиент перенёс / заболел / не отвечает"
                      disabled={saving}
                    />
                  </div>
                )}

                <div className="mt-3">
                  <div className="mb-1 text-sm text-zinc-300">Внутренняя заметка</div>
                  <textarea
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                    value={editInternal}
                    onChange={(e) => setEditInternal(e.target.value)}
                    placeholder="Только для сотрудников (не видно клиенту)"
                    rows={4}
                    disabled={saving}
                  />
                </div>

                {selected.notes && (
                  <div className="mt-3 rounded-2xl border border-zinc-800 bg-zinc-900/30 p-3">
                    <div className="text-xs text-zinc-400">Комментарий клиента</div>
                    <div className="mt-1 text-sm text-zinc-200">{selected.notes}</div>
                  </div>
                )}

                <div className="mt-4 flex flex-col gap-2">
                  <button
                    className="rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
                    onClick={saveDrawer}
                    disabled={saving}
                    type="button"
                  >
                    {saving ? "Сохранение…" : "Сохранить изменения"}
                  </button>

                  <button
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm hover:border-zinc-700"
                    onClick={() => {
                      setSelectedId(null);
                      setEditReason("");
                      setEditInternal("");
                    }}
                    type="button"
                  >
                    Закрыть карточку
                  </button>

                  <button
                    className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm hover:border-zinc-700"
                    onClick={loadBookings}
                    type="button"
                    disabled={loading || saving}
                    title="Обновить данные"
                  >
                    Обновить
                  </button>
                </div>

                <div className="mt-4 text-xs text-zinc-500">
                  Изменения статуса пишутся в историю на backend (audit). Причина отмены сохраняется отдельно.
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </AdminShell>
  );
}
FILE

echo "[OK] Updated: frontend/app/admin/calendar/page.tsx"
