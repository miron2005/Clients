"use client";

import AdminShell from "../_ui/AdminShell";
import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPatch, apiPost } from "@/lib/api";
import { useAuth } from "../_auth/AuthProvider";

type Role = "owner" | "admin" | "staff" | "client";
type BookingStatus = "planned" | "arrived" | "no_show" | "cancelled";
type ViewMode = "day" | "week" | "list";

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
  service: { id?: string; name: string };
  staff: { id?: string; displayName: string };
  client: { fullName: string; phone: string };
};

type Staff = { id: string; displayName: string };
type Service = { id: string; name: string; durationMinutes: number; priceCents: number; currency: string };

function money(cents: number, currency?: string) {
  const cur = currency || "RUB";
  const value = (cents || 0) / 100;
  try {
    return new Intl.NumberFormat("ru-RU", { style: "currency", currency: cur }).format(value);
  } catch {
    return `${value.toFixed(2).replace(".", ",")} ${cur}`;
  }
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function startOfWeekMon(d: Date) {
  const x = new Date(d);
  const js = x.getDay();
  const diff = js === 0 ? -6 : 1 - js;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function dayKeyLocal(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function dateShort(d: Date) {
  return d.toLocaleDateString("ru-RU", { weekday: "short", day: "2-digit", month: "2-digit" });
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

async function copyText(t: string) {
  try {
    await navigator.clipboard.writeText(t);
    return true;
  } catch {
    return false;
  }
}

// --- overlaps layout for timeline blocks ---
type LayoutItem = Booking & {
  _startMin: number;
  _endMin: number;
  _lane: number;
  _lanes: number;
};

function minutesOfDay(d: Date) {
  return d.getHours() * 60 + d.getMinutes();
}

function layoutOverlaps(list: Booking[]): LayoutItem[] {
  const items: LayoutItem[] = list
    .map((b) => {
      const s = new Date(b.startAt);
      const e = new Date(b.endAt);
      const sm = minutesOfDay(s);
      const em = Math.max(minutesOfDay(e), sm + 5);
      return { ...b, _startMin: sm, _endMin: em, _lane: 0, _lanes: 1 };
    })
    .sort((a, b) => a._startMin - b._startMin || a._endMin - b._endMin);

  const active: { endMin: number; lane: number }[] = [];
  for (const it of items) {
    for (let i = active.length - 1; i >= 0; i--) if (active[i].endMin <= it._startMin) active.splice(i, 1);
    const used = new Set(active.map((x) => x.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    it._lane = lane;
    active.push({ endMin: it._endMin, lane });
  }

  let cluster: LayoutItem[] = [];
  let clusterEnd = -1;
  const flush = () => {
    if (cluster.length === 0) return;
    const lanes = Math.max(...cluster.map((x) => x._lane)) + 1;
    for (const x of cluster) x._lanes = lanes;
    cluster = [];
    clusterEnd = -1;
  };

  for (const it of items) {
    if (cluster.length === 0) {
      cluster = [it];
      clusterEnd = it._endMin;
      continue;
    }
    if (it._startMin < clusterEnd) {
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it._endMin);
    } else {
      flush();
      cluster = [it];
      clusterEnd = it._endMin;
    }
  }
  flush();

  return items;
}

function roundTo15(min: number) {
  const step = 15;
  return Math.max(0, Math.min(24 * 60 - 1, Math.round(min / step) * step));
}
function hhmmFromMinutes(min: number) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function isoFromDateAndTime(dateISO: string, hhmm: string) {
  const [y, mo, d] = dateISO.split("-").map((x) => Number(x));
  const [hh, mm] = hhmm.split(":").map((x) => Number(x));
  const dt = new Date(y, mo - 1, d, hh, mm, 0, 0);
  return dt.toISOString();
}

function todayISO(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function AdminCalendarPage() {
  const { token, tenantSlug, session } = useAuth();
  const role: Role | null = session?.user?.role ?? null;

  const [view, setView] = useState<ViewMode>(() => {
    try {
      const v = localStorage.getItem("admin.calendar.view");
      if (v === "day" || v === "week" || v === "list") return v;
      return "day";
    } catch {
      return "day";
    }
  });

  const [anchor, setAnchor] = useState<Date>(() => new Date());
  const [items, setItems] = useState<Booking[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<Service[]>([]);

  const [staffId, setStaffId] = useState<string>("all");
  const [status, setStatus] = useState<string>("all");
  const [q, setQ] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(() => items.find((b) => b.id === selectedId) ?? null, [items, selectedId]);

  const [editStatus, setEditStatus] = useState<BookingStatus>("planned");
  const [editReason, setEditReason] = useState("");
  const [editInternal, setEditInternal] = useState("");
  const [copied, setCopied] = useState(false);

  // --- Create modal state ---
  const [createOpen, setCreateOpen] = useState(false);
  const [createErr, setCreateErr] = useState("");
  const [cDate, setCDate] = useState<string>(() => todayISO(new Date()));
  const [cTime, setCTime] = useState<string>("13:00");
  const [cStaffId, setCStaffId] = useState<string>("all");
  const [cServiceId, setCServiceId] = useState<string>("");
  const [cName, setCName] = useState<string>("");
  const [cPhone, setCPhone] = useState<string>("+7");
  const [cConsent, setCConsent] = useState<boolean>(false);
  const [cNotes, setCNotes] = useState<string>("");
  const [cInternal, setCInternal] = useState<string>("");

  const weekStart = useMemo(() => startOfWeekMon(anchor), [anchor]);
  const weekEnd = useMemo(() => addDays(weekStart, 7), [weekStart]);
  const days = useMemo(() => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)), [weekStart]);

  const dayStart = useMemo(() => {
    const d = new Date(anchor);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [anchor]);
  const dayEnd = useMemo(() => addDays(dayStart, 1), [dayStart]);

  const rangeFrom = useMemo(() => (view === "day" ? dayStart : weekStart), [view, dayStart, weekStart]);
  const rangeTo = useMemo(() => (view === "day" ? dayEnd : weekEnd), [view, dayEnd, weekEnd]);

  useEffect(() => {
    try {
      localStorage.setItem("admin.calendar.view", view);
    } catch {
      // ignore
    }
  }, [view]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setSelectedId(null);
        setCreateOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // staff/services for selects + columns
  useEffect(() => {
    (async () => {
      try {
        const r1 = await apiGet<{ staff: Staff[] }>(`/public/${tenantSlug}/staff`, { tenantSlug });
        setStaff(r1.staff ?? []);
      } catch {
        setStaff([]);
      }
      try {
        const r2 = await apiGet<{ services: Service[] }>(`/public/${tenantSlug}/services`, { tenantSlug });
        const list = r2.services ?? [];
        setServices(list);
        if (!cServiceId && list[0]?.id) setCServiceId(list[0].id);
      } catch {
        setServices([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantSlug]);

  async function loadBookings() {
    if (!token) return;
    setLoading(true);
    setError("");
    try {
      const from = rangeFrom.toISOString();
      const to = rangeTo.toISOString();

      const canFilterStaff = role !== "staff";
      const staffParam = canFilterStaff && staffId !== "all" ? `&staffId=${encodeURIComponent(staffId)}` : "";

      const resp = await apiGet<Booking[]>(
        `/admin/bookings?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}${staffParam}`,
        { token, tenantSlug }
      );
      setItems(resp);
    } catch {
      setError("Не удалось загрузить записи. Проверь backend и токен.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadBookings();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, tenantSlug, view, staffId, role, rangeFrom.toISOString(), rangeTo.toISOString()]);

  useEffect(() => {
    if (!selected) return;
    setEditStatus(selected.status);
    setEditReason(selected.cancelledReason ?? "");
    setEditInternal(selected.internalNote ?? "");
    setCopied(false);
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

  const stats = useMemo(() => {
    const total = filtered.length;
    const planned = filtered.filter((b) => b.status === "planned").length;
    const arrived = filtered.filter((b) => b.status === "arrived").length;
    const cancelled = filtered.filter((b) => b.status === "cancelled").length;
    const revenueCents = filtered.filter((b) => b.status !== "cancelled").reduce((s, b) => s + (b.priceCents || 0), 0);
    const currency = filtered.find((b) => b.currency)?.currency || "RUB";
    return { total, planned, arrived, cancelled, revenueCents, currency };
  }, [filtered]);

  const byDay = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of filtered) {
      const key = dayKeyLocal(new Date(b.startAt));
      m.set(key, [...(m.get(key) ?? []), b]);
    }
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      m.set(k, arr);
    }
    return m;
  }, [filtered]);

  const listGrouped = useMemo(() => {
    const m = new Map<string, Booking[]>();
    for (const b of filtered) {
      const key = dayKeyLocal(new Date(b.startAt));
      m.set(key, [...(m.get(key) ?? []), b]);
    }
    for (const [k, arr] of m.entries()) {
      arr.sort((a, b) => new Date(a.startAt).getTime() - new Date(b.startAt).getTime());
      m.set(k, arr);
    }
    const keys = Array.from(m.keys()).sort();
    return { map: m, keys };
  }, [filtered]);

  // Day view data
  const dayKey = useMemo(() => dayKeyLocal(dayStart), [dayStart]);
  const dayBookings = useMemo(() => byDay.get(dayKey) ?? [], [byDay, dayKey]);

  const columns = useMemo(() => {
    if (role === "staff") {
      const uniq = Array.from(new Map(dayBookings.map((b) => [b.staff.id ?? b.staff.displayName, b.staff.displayName])).entries());
      if (uniq.length >= 1) return uniq.map(([id, name]) => ({ id, displayName: name }));
      return [{ id: "me", displayName: "Мой календарь" }];
    }

    if (staffId !== "all") {
      const s = staff.find((x) => x.id === staffId);
      if (s) return [s];
    }

    if (staff.length > 0) return staff;

    const uniq = Array.from(new Map(dayBookings.map((b) => [b.staff.id ?? b.staff.displayName, b.staff.displayName])).entries());
    return uniq.map(([id, name]) => ({ id, displayName: name }));
  }, [role, staffId, staff, dayBookings]);

  async function saveSelected() {
    if (!token || !selected) return;
    setSaving(true);
    setError("");

    const payload: any = { status: editStatus, internalNote: editInternal.trim() || undefined };
    if (editStatus === "cancelled") payload.reason = editReason.trim() || "Отменено";

    try {
      await apiPatch(`/admin/bookings/${selected.id}/status`, payload, { token, tenantSlug });
      setItems((prev) =>
        prev.map((b) =>
          b.id === selected.id
            ? { ...b, status: editStatus, internalNote: payload.internalNote ?? null, cancelledReason: editStatus === "cancelled" ? payload.reason : null }
            : b
        )
      );
      setSelectedId(null);
    } catch {
      setError("Не удалось сохранить (PATCH /admin/bookings/:id/status).");
    } finally {
      setSaving(false);
    }
  }

  function jumpToDate(dateISO: string) {
    const d = new Date(`${dateISO}T12:00:00`);
    if (!Number.isNaN(d.getTime())) setAnchor(d);
  }

  function navPrev() {
    setAnchor((d) => addDays(d, view === "day" ? -1 : -7));
  }
  function navNext() {
    setAnchor((d) => addDays(d, view === "day" ? 1 : 7));
  }

  // Timeline constants
  const startHour = 10;
  const endHour = 19;
  const hourH = 64;
  const totalH = (endHour - startHour) * hourH;

  const nowLineTop = useMemo(() => {
    const now = new Date();
    if (dayKeyLocal(now) !== dayKey) return null;
    const m = now.getHours() * 60 + now.getMinutes();
    const top = ((m - startHour * 60) / 60) * hourH;
    return top >= 0 && top <= totalH ? top : null;
  }, [dayKey, startHour, hourH, totalH]);

  function openCreate(opts?: { staffId?: string; startMin?: number }) {
    setCreateErr("");
    setCDate(todayISO(anchor));
    const baseMin = opts?.startMin ?? (13 * 60);
    const t = hhmmFromMinutes(roundTo15(baseMin));
    setCTime(t);

    if (role !== "staff") {
      const sid = opts?.staffId ?? (staffId !== "all" ? staffId : staff[0]?.id ?? "all");
      setCStaffId(sid);
    } else {
      setCStaffId("all");
    }

    if (!cServiceId && services[0]?.id) setCServiceId(services[0].id);
    if (services.length > 0 && !cServiceId) setCServiceId(services[0].id);

    setCName("");
    setCPhone("+7");
    setCConsent(false);
    setCNotes("");
    setCInternal("");
    setCreateOpen(true);
  }

  async function submitCreate() {
    if (!token) return;
    setSaving(true);
    setCreateErr("");

    const svc = services.find((s) => s.id === cServiceId);
    if (!svc) {
      setCreateErr("Выберите услугу.");
      setSaving(false);
      return;
    }

    // staffId required only for admin/owner; for staff backend сам подставит
    const payload: any = {
      serviceId: cServiceId,
      startAt: isoFromDateAndTime(cDate, cTime),
      clientName: cName.trim(),
      clientPhone: cPhone.trim(),
      consentMarketing: cConsent,
      notes: cNotes.trim() || undefined,
      internalNote: cInternal.trim() || undefined
    };
    if (role !== "staff") {
      if (!cStaffId || cStaffId === "all") {
        setCreateErr("Выберите мастера.");
        setSaving(false);
        return;
      }
      payload.staffId = cStaffId;
    }

    if (!payload.clientName) {
      setCreateErr("Введите имя клиента.");
      setSaving(false);
      return;
    }
    if (!payload.clientPhone) {
      setCreateErr("Введите телефон клиента.");
      setSaving(false);
      return;
    }

    try {
      await apiPost("/admin/bookings", payload, { token, tenantSlug });
      setCreateOpen(false);
      await loadBookings();
    } catch (e: any) {
      setCreateErr(String(e?.message ?? "Не удалось создать запись."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminShell>
      {/* Header */}
      <div className="mb-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold">Календарь</h1>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/40 px-3 py-1 text-xs text-zinc-300">
                {view === "day"
                  ? dayStart.toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "2-digit", year: "numeric" })
                  : `${weekStart.toLocaleDateString("ru-RU")} — ${addDays(weekEnd, -1).toLocaleDateString("ru-RU")}`}
              </span>
              {role === "staff" && (
                <span className="rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-xs text-emerald-200">
                  Вы вошли как сотрудник — видите только свои записи
                </span>
              )}
            </div>

            <div className="mt-2 flex flex-wrap gap-2 text-xs text-zinc-400">
              <span className="rounded-full border border-zinc-800 bg-zinc-950/30 px-2 py-1">
                Всего: <b className="text-zinc-200">{stats.total}</b>
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/30 px-2 py-1">
                Запланировано: <b className="text-zinc-200">{stats.planned}</b>
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/30 px-2 py-1">
                Пришли: <b className="text-zinc-200">{stats.arrived}</b>
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/30 px-2 py-1">
                Отмены: <b className="text-zinc-200">{stats.cancelled}</b>
              </span>
              <span className="rounded-full border border-zinc-800 bg-zinc-950/30 px-2 py-1">
                Сумма: <b className="text-zinc-200">{money(stats.revenueCents, stats.currency)}</b>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="rounded-xl bg-emerald-500 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
              onClick={() => openCreate()}
              disabled={loading || saving}
            >
              + Запись
            </button>

            <div className="inline-flex overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950">
              <button
                type="button"
                className={`px-3 py-2 text-sm ${view === "day" ? "bg-zinc-900/60 text-zinc-100" : "text-zinc-300 hover:text-zinc-100"}`}
                onClick={() => setView("day")}
              >
                День (сетка)
              </button>
              <button
                type="button"
                className={`px-3 py-2 text-sm ${view === "week" ? "bg-zinc-900/60 text-zinc-100" : "text-zinc-300 hover:text-zinc-100"}`}
                onClick={() => setView("week")}
              >
                Неделя
              </button>
              <button
                type="button"
                className={`px-3 py-2 text-sm ${view === "list" ? "bg-zinc-900/60 text-zinc-100" : "text-zinc-300 hover:text-zinc-100"}`}
                onClick={() => setView("list")}
              >
                Список
              </button>
            </div>

            <button type="button" className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700" onClick={navPrev}>
              ←
            </button>
            <button type="button" className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700" onClick={() => setAnchor(new Date())}>
              Сегодня
            </button>
            <button type="button" className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700" onClick={navNext}>
              →
            </button>

            <button type="button" className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700" onClick={loadBookings} disabled={loading || saving}>
              Обновить
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="mt-4 flex flex-wrap gap-2">
          {role !== "staff" && (
            <select className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
              <option value="all">Все мастера</option>
              {staff.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.displayName}
                </option>
              ))}
            </select>
          )}

          <select className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Все статусы</option>
            <option value="planned">Запланирован</option>
            <option value="arrived">Пришёл</option>
            <option value="no_show">Не пришёл</option>
            <option value="cancelled">Отменён</option>
          </select>

          <input
            className="h-10 w-[340px] max-w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Поиск: клиент, телефон, услуга, мастер…"
          />

          <input type="date" className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm" onChange={(e) => jumpToDate(e.target.value)} />
        </div>

        {error && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">{error}</div>}
      </div>

      {/* BODY */}
      {view === "day" ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/20 p-3">
          <div className="overflow-x-auto pb-2">
            <div className="min-w-[900px]">
              <div className="grid grid-cols-[72px_1fr] gap-3">
                {/* Time axis */}
                <div className="relative">
                  <div className="h-10" />
                  <div className="relative" style={{ height: totalH }}>
                    {Array.from({ length: endHour - startHour + 1 }).map((_, i) => {
                      const h = startHour + i;
                      const top = i * hourH;
                      return (
                        <div key={h} className="absolute left-0 right-0" style={{ top }}>
                          <div className="text-xs text-zinc-500">{String(h).padStart(2, "0")}:00</div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Staff columns */}
                <div className="min-w-0">
                  <div className="grid" style={{ gridTemplateColumns: `repeat(${Math.max(1, columns.length)}, minmax(260px, 1fr))`, gap: 12 }}>
                    {columns.map((col) => (
                      <div key={col.id} className="min-w-[260px]">
                        <div className="mb-2 flex items-center justify-between rounded-xl border border-zinc-800 bg-zinc-950/40 px-3 py-2">
                          <div className="text-sm font-semibold">{col.displayName}</div>
                          <div className="text-xs text-zinc-500">
                            {dayBookings.filter((b) => (b.staff.id ?? b.staff.displayName) === col.id).length}
                          </div>
                        </div>

                        <div
                          className="relative rounded-2xl border border-zinc-800 bg-zinc-950/10"
                          style={{ height: totalH }}
                          onDoubleClick={(e) => {
                            // dblclick по пустому месту → открыть создание на время клика
                            const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                            const y = e.clientY - rect.top;
                            const min = startHour * 60 + (y / hourH) * 60;
                            openCreate({
                              staffId: role === "staff" ? undefined : col.id,
                              startMin: roundTo15(min)
                            });
                          }}
                          title="Двойной клик по пустому месту — создать запись"
                        >
                          {Array.from({ length: endHour - startHour }).map((_, i) => (
                            <div key={i} className="absolute left-0 right-0 border-t border-zinc-800/70" style={{ top: i * hourH }} />
                          ))}

                          {nowLineTop !== null && (
                            <div className="absolute left-0 right-0" style={{ top: nowLineTop }}>
                              <div className="border-t border-rose-400/70" />
                            </div>
                          )}

                          {layoutOverlaps(dayBookings.filter((b) => (b.staff.id ?? b.staff.displayName) === col.id)).map((b) => {
                            const sm = statusMeta(b.status);
                            const startMin = b._startMin;
                            const endMin = b._endMin;

                            const clStart = Math.max(startMin, startHour * 60);
                            const clEnd = Math.min(endMin, endHour * 60);
                            const dur = Math.max(10, clEnd - clStart);

                            const top = ((clStart - startHour * 60) / 60) * hourH;
                            const height = Math.max(32, (dur / 60) * hourH);

                            const w = 100 / b._lanes;
                            const left = w * b._lane;

                            return (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => setSelectedId(b.id)}
                                className="absolute rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-left shadow-xl shadow-black/30 overflow-hidden hover:border-zinc-700"
                                style={{
                                  top,
                                  height,
                                  left: `calc(${left}% + 6px)`,
                                  width: `calc(${w}% - 12px)`
                                }}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-[11px] tabular-nums text-zinc-400">
                                      {timeLabel(b.startAt)}–{timeLabel(b.endAt)}
                                    </div>
                                    <div className="mt-1 truncate text-sm font-semibold leading-tight text-zinc-100">{b.service.name}</div>
                                    <div className="mt-1 truncate text-sm font-medium leading-snug text-zinc-200">{b.client.fullName}</div>
                                  </div>
                                  <div className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${sm.chip}`}>{sm.label}</div>
                                </div>
                              </button>
                            );
                          })}

                          {!loading && dayBookings.filter((b) => (b.staff.id ?? b.staff.displayName) === col.id).length === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center text-sm text-zinc-500">Нет записей</div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {loading && <div className="mt-3 text-sm text-zinc-500">Загрузка…</div>}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-2 text-xs text-zinc-500">Клик по блоку — детали справа. Esc — закрыть. Двойной клик по сетке — создать запись.</div>
        </div>
      ) : view === "week" ? (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/20 p-3">
          <div className="overflow-x-auto pb-2">
            <div className="grid grid-flow-col auto-cols-[240px] gap-3">
              {days.map((d) => {
                const key = dayKeyLocal(d);
                const list = byDay.get(key) ?? [];
                const isToday = dayKeyLocal(new Date()) === key;

                return (
                  <div key={key} className={`rounded-2xl border p-3 ${isToday ? "border-emerald-400/40 bg-emerald-500/5" : "border-zinc-800 bg-zinc-950/20"}`}>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-sm font-semibold">{dateShort(d)}</div>
                      <div className="text-xs text-zinc-500">{list.length}</div>
                    </div>

                    {loading ? (
                      <div className="space-y-2">
                        <div className="h-14 rounded-xl border border-zinc-800 bg-zinc-900/30" />
                        <div className="h-14 rounded-xl border border-zinc-800 bg-zinc-900/30" />
                        <div className="h-14 rounded-xl border border-zinc-800 bg-zinc-900/30" />
                      </div>
                    ) : list.length === 0 ? (
                      <div className="text-xs text-zinc-500">Нет записей</div>
                    ) : (
                      <div className="space-y-2">
                        {list.map((b) => {
                          const sm = statusMeta(b.status);
                          return (
                            <button
                              key={b.id}
                              type="button"
                              onClick={() => setSelectedId(b.id)}
                              className="w-full overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/25 p-3 text-left transition hover:border-zinc-700 hover:bg-zinc-900/35"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-xs text-zinc-400">
                                    {timeLabel(b.startAt)}–{timeLabel(b.endAt)}
                                  </div>
                                  <div className="mt-1 truncate text-base font-semibold leading-snug text-zinc-100">{b.service.name}</div>
                                  <div className="mt-1 truncate text-sm font-medium leading-snug text-zinc-200">{b.client.fullName}</div>
                                  <div className="mt-0.5 truncate text-xs text-zinc-500">{b.staff.displayName}</div>
                                </div>
                                <div className="shrink-0 text-right">
                                  <div className="text-xs text-zinc-400">{money(b.priceCents, b.currency)}</div>
                                  <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] ${sm.chip}`}>{sm.label}</div>
                                </div>
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
          </div>
        </div>
      ) : (
        <div className="rounded-2xl border border-zinc-800 bg-zinc-950/20 p-3">
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl border border-zinc-800 bg-zinc-900/30" />
              ))}
            </div>
          ) : listGrouped.keys.length === 0 ? (
            <div className="p-6 text-sm text-zinc-400">Нет записей по выбранным фильтрам.</div>
          ) : (
            <div className="space-y-4">
              {listGrouped.keys.map((k) => {
                const arr = listGrouped.map.get(k) ?? [];
                const d = new Date(`${k}T12:00:00`);
                return (
                  <div key={k} className="rounded-2xl border border-zinc-800 bg-zinc-950/10">
                    <div className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
                      <div className="text-sm font-semibold">{d.toLocaleDateString("ru-RU", { weekday: "long", day: "2-digit", month: "long" })}</div>
                      <div className="text-xs text-zinc-500">{arr.length}</div>
                    </div>

                    <div className="divide-y divide-zinc-800">
                      {arr.map((b) => {
                        const sm = statusMeta(b.status);
                        return (
                          <button key={b.id} type="button" onClick={() => setSelectedId(b.id)} className="w-full px-4 py-3 text-left transition hover:bg-zinc-900/20">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-sm font-semibold">
                                  {timeLabel(b.startAt)}–{timeLabel(b.endAt)} • {b.service.name}
                                </div>
                                <div className="mt-1 truncate text-xs text-zinc-400">
                                  {b.client.fullName} • {b.client.phone} • {b.staff.displayName}
                                </div>
                              </div>
                              <div className="shrink-0 text-right">
                                <div className="text-xs text-zinc-400">{money(b.priceCents, b.currency)}</div>
                                <div className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-[11px] ${sm.chip}`}>{sm.label}</div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Create Modal */}
      {createOpen && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setCreateOpen(false)} />
          <div className="absolute left-1/2 top-1/2 w-[92vw] max-w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-zinc-800 bg-zinc-950 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-semibold">Новая запись</div>
                <div className="mt-1 text-sm text-zinc-400">Создание записи из админ-календаря</div>
              </div>
              <button type="button" className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700" onClick={() => setCreateOpen(false)}>
                ✕
              </button>
            </div>

            {createErr && <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">{createErr}</div>}

            <div className="mt-4 grid gap-3">
              {role !== "staff" ? (
                <select className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm" value={cStaffId} onChange={(e) => setCStaffId(e.target.value)}>
                  <option value="all">Выберите мастера…</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.displayName}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm text-zinc-400">
                  Мастер: <b className="text-zinc-200">Вы</b>
                </div>
              )}

              <select className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm" value={cServiceId} onChange={(e) => setCServiceId(e.target.value)}>
                {services.length === 0 ? (
                  <option value="">Нет услуг</option>
                ) : (
                  services.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} • {s.durationMinutes} мин • {money(s.priceCents, s.currency)}
                    </option>
                  ))
                )}
              </select>

              <div className="grid grid-cols-2 gap-2">
                <input type="date" className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm" value={cDate} onChange={(e) => setCDate(e.target.value)} />
                <input type="time" className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm" value={cTime} onChange={(e) => setCTime(e.target.value)} />
              </div>

              <input
                className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm"
                value={cName}
                onChange={(e) => setCName(e.target.value)}
                placeholder="Имя клиента"
              />

              <input
                className="h-10 rounded-xl border border-zinc-800 bg-zinc-950 px-3 text-sm"
                value={cPhone}
                onChange={(e) => setCPhone(e.target.value)}
                placeholder="+7XXXXXXXXXX"
              />

              <label className="flex items-center gap-2 text-sm text-zinc-300">
                <input type="checkbox" checked={cConsent} onChange={(e) => setCConsent(e.target.checked)} />
                Можно отправлять напоминания (consent)
              </label>

              <textarea
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                value={cNotes}
                onChange={(e) => setCNotes(e.target.value)}
                placeholder="Комментарий клиента (необязательно)"
                rows={3}
              />

              <textarea
                className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                value={cInternal}
                onChange={(e) => setCInternal(e.target.value)}
                placeholder="Внутренняя заметка (не видно клиенту)"
                rows={3}
              />
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
                onClick={submitCreate}
                disabled={saving}
              >
                {saving ? "Создание…" : "Создать"}
              </button>
              <button type="button" className="flex-1 rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm hover:border-zinc-700" onClick={() => setCreateOpen(false)}>
                Отмена
              </button>
            </div>

            <div className="mt-3 text-xs text-zinc-500">
              Если получишь ошибку про hold/пересечение — это защита от двойных броней (и от активной онлайн-фиксации слота).
            </div>
          </div>
        </div>
      )}

      {/* Slide-over details */}
      {selected && (
        <div className="fixed inset-0 z-50">
          <div className="absolute inset-0 bg-black/60" onClick={() => setSelectedId(null)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-[460px] border-l border-zinc-800 bg-zinc-950">
            <div className="flex h-full flex-col">
              <div className="border-b border-zinc-800 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-lg font-semibold">{selected.service.name}</div>
                    <div className="mt-1 text-sm text-zinc-400">
                      {new Date(selected.startAt).toLocaleString("ru-RU")} — {timeLabel(selected.endAt)} • {selected.staff.displayName}
                    </div>
                  </div>

                  <button type="button" className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm hover:border-zinc-700" onClick={() => setSelectedId(null)}>
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
                        type="button"
                        className={`rounded-full border px-3 py-1 text-xs transition ${active ? sm.chip : "border-zinc-800 bg-zinc-900/30 text-zinc-300 hover:border-zinc-700"}`}
                        onClick={() => setEditStatus(s)}
                        disabled={saving}
                      >
                        {sm.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto p-4">
                <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 p-4">
                  <div className="text-xs text-zinc-400">Клиент</div>
                  <div className="mt-1 text-sm font-semibold">{selected.client.fullName}</div>

                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs text-zinc-400">Телефон</div>
                      <div className="truncate text-sm">{selected.client.phone}</div>
                    </div>

                    <button
                      type="button"
                      className="rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-xs hover:border-zinc-700"
                      onClick={async () => {
                        const ok = await copyText(selected.client.phone);
                        setCopied(ok);
                        setTimeout(() => setCopied(false), 1200);
                      }}
                    >
                      {copied ? "Скопировано" : "Копировать"}
                    </button>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-3">
                      <div className="text-xs text-zinc-400">Стоимость</div>
                      <div className="mt-1 text-sm font-semibold">{money(selected.priceCents, selected.currency)}</div>
                    </div>
                    <div className="rounded-xl border border-zinc-800 bg-zinc-950/30 p-3">
                      <div className="text-xs text-zinc-400">Статус</div>
                      <div className="mt-1 text-sm font-semibold">{statusMeta(editStatus).label}</div>
                    </div>
                  </div>
                </div>

                {editStatus === "cancelled" && (
                  <div>
                    <div className="mb-1 text-sm text-zinc-300">Причина отмены</div>
                    <input
                      className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                      value={editReason}
                      onChange={(e) => setEditReason(e.target.value)}
                      placeholder="Например: клиент перенёс / не отвечает"
                      disabled={saving}
                    />
                  </div>
                )}

                <div>
                  <div className="mb-1 text-sm text-zinc-300">Внутренняя заметка</div>
                  <textarea
                    className="w-full rounded-xl border border-zinc-800 bg-zinc-950 px-3 py-2 text-sm"
                    value={editInternal}
                    onChange={(e) => setEditInternal(e.target.value)}
                    placeholder="Только для сотрудников (не видно клиенту)"
                    rows={5}
                    disabled={saving}
                  />
                </div>

                {selected.notes && (
                  <div className="rounded-2xl border border-zinc-800 bg-zinc-900/20 p-4">
                    <div className="text-xs text-zinc-400">Комментарий клиента</div>
                    <div className="mt-1 text-sm text-zinc-200">{selected.notes}</div>
                  </div>
                )}
              </div>

              <div className="border-t border-zinc-800 p-4">
                <button
                  type="button"
                  className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-60"
                  onClick={saveSelected}
                  disabled={saving}
                >
                  {saving ? "Сохранение…" : "Сохранить"}
                </button>
                <button type="button" className="mt-2 w-full rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm hover:border-zinc-700" onClick={() => setSelectedId(null)}>
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
