#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

mkdir -p "frontend/app/_public"
mkdir -p "frontend/app/[tenant]/booking"
mkdir -p "frontend/app/booking"
mkdir -p "frontend/app/lime/booking"

# 1) Общий компонент флоу (client)
cat > "frontend/app/_public/BookingFlow.tsx" <<'FILE'
"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

type TenantInfo = { slug: string; name?: string; timezone?: string; currency?: string };
type Service = { id: string; name: string; durationMinutes: number; priceCents: number; currency: string };
type Staff = { id: string; displayName: string };
type Slot = { startAt: string; endAt: string };

function fmtPrice(cents: number, currency?: string) {
  const v = (cents / 100).toFixed(2).replace(".", ",");
  const cur = currency ?? "EUR";
  const sym = cur === "PLN" ? "zł" : cur === "EUR" ? "€" : cur;
  return `${v} ${sym}`;
}

function toLocalTimeLabel(iso: string) {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

function todayPlus(days: number) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function BookingFlow({ tenantSlug }: { tenantSlug: string }) {
  const [tenant, setTenant] = useState<TenantInfo>({ slug: tenantSlug });

  const [services, setServices] = useState<Service[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [slots, setSlots] = useState<Slot[]>([]);

  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const [serviceId, setServiceId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");

  const [date, setDate] = useState<string>(todayPlus(1));

  const [slotStartAt, setSlotStartAt] = useState<string>("");
  const [holdId, setHoldId] = useState<string>("");
  const [holdExpiresAt, setHoldExpiresAt] = useState<string>("");
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);

  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [consent, setConsent] = useState(false);

  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<any>(null);

  const selectedService = useMemo(
    () => services.find((s) => s.id === serviceId),
    [services, serviceId]
  );

  // 1) Услуги + инфо о tenant
  useEffect(() => {
    (async () => {
      try {
        setError("");
        const resp = await apiGet<{ tenant: TenantInfo; services: Service[] }>(`/public/${tenantSlug}/services`, {
          tenantSlug
        });
        setTenant(resp.tenant ?? { slug: tenantSlug });
        setServices(resp.services ?? []);
      } catch {
        setError("Не удалось загрузить услуги. Проверьте, что backend запущен и tenant существует.");
      }
    })();
  }, [tenantSlug]);

  // 2) Мастера
  useEffect(() => {
    if (!serviceId) return;
    (async () => {
      try {
        setError("");
        const resp = await apiGet<{ staff: Staff[] }>(`/public/${tenantSlug}/staff?serviceId=${serviceId}`, {
          tenantSlug
        });
        setStaff(resp.staff ?? []);
      } catch {
        setError("Не удалось загрузить мастеров.");
      }
    })();
  }, [tenantSlug, serviceId]);

  // 3) Слоты
  useEffect(() => {
    if (!serviceId || !staffId || !date) return;
    (async () => {
      try {
        setError("");
        setSlots([]);
        const resp = await apiGet<{ slots: Slot[] }>(
          `/public/${tenantSlug}/slots?serviceId=${serviceId}&staffId=${staffId}&date=${date}`,
          { tenantSlug }
        );
        setSlots(resp.slots ?? []);
      } catch {
        setError("Не удалось загрузить свободное время.");
      }
    })();
  }, [tenantSlug, serviceId, staffId, date]);

  // TTL hold: считаем секунды и авто-возврат на шаг 3 при истечении
  useEffect(() => {
    if (!holdExpiresAt) {
      setSecondsLeft(null);
      return;
    }
    const tick = () => {
      const left = Math.max(0, Math.floor((new Date(holdExpiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(left);
      if (left <= 0) {
        setError("Время фиксации слота истекло. Выберите время заново.");
        setHoldId("");
        setHoldExpiresAt("");
        setSlotStartAt("");
        setStep(3);
      }
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [holdExpiresAt]);

  function resetToStep1() {
    setServiceId("");
    setStaffId("");
    setSlots([]);
    setStep(1);
    setHoldId("");
    setHoldExpiresAt("");
    setSlotStartAt("");
    setSuccess(null);
  }

  function resetAfterService() {
    setStaffId("");
    setSlots([]);
    setStep(2);
    setHoldId("");
    setHoldExpiresAt("");
    setSlotStartAt("");
    setSuccess(null);
  }

  async function createHold(startAt: string) {
    try {
      setError("");
      const resp = await apiPost<{ holdId: string; expiresAt: string }>(
        `/public/${tenantSlug}/holds`,
        {
          serviceId,
          staffId,
          startAt,
          clientPhone: clientPhone || undefined
        },
        { tenantSlug }
      );
      setHoldId(resp.holdId);
      setHoldExpiresAt(resp.expiresAt);
      setSlotStartAt(startAt);
      setStep(4);
    } catch {
      setError("Не удалось зафиксировать время. Возможно, слот уже заняли. Обновите список.");
    }
  }

  async function confirmBooking() {
    try {
      setError("");
      if (!holdId) {
        setError("Слот не зафиксирован. Выберите время заново.");
        setStep(3);
        return;
      }
      const resp = await apiPost(
        `/public/${tenantSlug}/bookings`,
        {
          holdId,
          clientName: clientName.trim(),
          clientPhone: clientPhone.trim(),
          notes: notes.trim() || undefined,
          consentMarketing: consent
        },
        { tenantSlug }
      );
      setSuccess(resp);
    } catch {
      setError("Не удалось подтвердить запись. Попробуйте заново выбрать время.");
      setStep(3);
      setHoldId("");
      setHoldExpiresAt("");
      setSlotStartAt("");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6">
          <div className="text-2xl font-semibold">Онлайн-запись</div>
          <div className="text-sm text-zinc-400">
            Компания: <b className="text-zinc-200">{tenant.name ?? tenantSlug}</b>{" "}
            <span className="text-zinc-500">({tenantSlug})</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">{error}</div>
        )}

        {success ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6">
            <div className="text-xl font-semibold">Запись подтверждена ✅</div>
            <div className="mt-2 text-sm text-zinc-200">
              <div>
                Услуга: <b>{success.booking.serviceName}</b>
              </div>
              <div>
                Мастер: <b>{success.booking.staffName}</b>
              </div>
              <div>
                Время: <b>{new Date(success.booking.startAt).toLocaleString("ru-RU")}</b>
              </div>
              <div>
                Стоимость: <b>{fmtPrice(success.booking.priceCents, success.booking.currency)}</b>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                className="rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-2 text-sm hover:border-zinc-600"
                onClick={resetToStep1}
              >
                Новая запись
              </button>
            </div>
            <div className="mt-4 text-sm text-zinc-300">
              Напоминания отправляются только при наличии согласия на рассылку.
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            <div className="md:col-span-2 space-y-4">
              {/* Шаг 1 */}
              <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 ${step === 1 ? "" : "opacity-85"}`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-lg font-semibold">1) Выберите услугу</div>
                  {serviceId && (
                    <button
                      className="text-sm text-zinc-300 hover:text-zinc-100"
                      onClick={resetToStep1}
                    >
                      Сбросить
                    </button>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  {services.map((s) => (
                    <button
                      key={s.id}
                      className={`rounded-xl border px-4 py-3 text-left transition ${
                        serviceId === s.id ? "border-emerald-400/60 bg-emerald-500/10" : "border-zinc-800 hover:border-zinc-700"
                      }`}
                      onClick={() => {
                        setServiceId(s.id);
                        resetAfterService();
                      }}
                    >
                      <div className="font-medium">{s.name}</div>
                      <div className="text-sm text-zinc-400">
                        {s.durationMinutes} мин • {fmtPrice(s.priceCents, s.currency)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Шаг 2 */}
              <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 ${step >= 2 ? "" : "opacity-60"}`}>
                <div className="mb-3 text-lg font-semibold">2) Выберите мастера</div>
                {!serviceId ? (
                  <div className="text-sm text-zinc-400">Сначала выберите услугу.</div>
                ) : staff.length === 0 ? (
                  <div className="text-sm text-zinc-400">Нет активных сотрудников (или список ещё загружается).</div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {staff.map((m) => (
                      <button
                        key={m.id}
                        className={`rounded-xl border px-4 py-3 text-left transition ${
                          staffId === m.id ? "border-emerald-400/60 bg-emerald-500/10" : "border-zinc-800 hover:border-zinc-700"
                        }`}
                        onClick={() => {
                          setStaffId(m.id);
                          setStep(3);
                        }}
                      >
                        <div className="font-medium">{m.displayName}</div>
                        <div className="text-sm text-zinc-400">Доступен по расписанию</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Шаг 3 */}
              <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 ${step >= 3 ? "" : "opacity-60"}`}>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="text-lg font-semibold">3) Выберите дату и время</div>
                  <input
                    type="date"
                    className="rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={!serviceId || !staffId}
                  />
                </div>

                {!serviceId || !staffId ? (
                  <div className="text-sm text-zinc-400">Выберите услугу и мастера.</div>
                ) : slots.length === 0 ? (
                  <div className="text-sm text-zinc-400">Свободных слотов нет (или они ещё не загрузились).</div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {slots.map((s) => (
                      <button
                        key={s.startAt}
                        className="rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-2 text-sm hover:border-zinc-700"
                        onClick={() => createHold(s.startAt)}
                      >
                        {toLocalTimeLabel(s.startAt)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Правая колонка */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="text-lg font-semibold">Подтверждение</div>

              <div className="mt-2 text-sm text-zinc-400">
                {selectedService ? (
                  <>
                    <div>
                      Услуга: <b className="text-zinc-200">{selectedService.name}</b>
                    </div>
                    <div>
                      Цена: <b className="text-zinc-200">{fmtPrice(selectedService.priceCents, selectedService.currency)}</b>
                    </div>
                  </>
                ) : (
                  "Выберите услугу, мастера и время."
                )}
              </div>

              {step < 4 ? (
                <div className="mt-4 text-sm text-zinc-400">
                  Чтобы перейти к подтверждению — выберите слот времени (он будет зафиксирован на несколько минут).
                </div>
              ) : (
                <>
                  <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 p-3 text-sm">
                    <div>
                      Время зафиксировано до:{" "}
                      <b>{new Date(holdExpiresAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</b>
                      {typeof secondsLeft === "number" && (
                        <span className="text-zinc-300"> • осталось: <b>{secondsLeft}</b> сек</span>
                      )}
                    </div>
                    <div className="mt-1 text-zinc-300">
                      Выбрано: <b>{new Date(slotStartAt).toLocaleString("ru-RU")}</b>
                    </div>
                  </div>

                  <div className="mt-4 space-y-3">
                    <div>
                      <div className="mb-1 text-sm text-zinc-300">Имя</div>
                      <input
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                        value={clientName}
                        onChange={(e) => setClientName(e.target.value)}
                        placeholder="Например: Ирина Петрова"
                      />
                    </div>

                    <div>
                      <div className="mb-1 text-sm text-zinc-300">Телефон</div>
                      <input
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                        value={clientPhone}
                        onChange={(e) => setClientPhone(e.target.value)}
                        placeholder="+48 000 000 000"
                      />
                    </div>

                    <div>
                      <div className="mb-1 text-sm text-zinc-300">Комментарий</div>
                      <textarea
                        className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Пожелания (необязательно)"
                        rows={3}
                      />
                    </div>

                    <label className="flex items-start gap-2 text-sm text-zinc-300">
                      <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        className="mt-1"
                      />
                      <span>Согласен(на) на уведомления и рассылку (Telegram/WhatsApp)</span>
                    </label>

                    <button
                      className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400 disabled:opacity-50"
                      disabled={!clientName.trim() || !clientPhone.trim() || !holdId}
                      onClick={confirmBooking}
                    >
                      Подтвердить запись
                    </button>

                    <button
                      className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-4 py-3 text-sm hover:border-zinc-600"
                      onClick={() => {
                        setHoldId("");
                        setHoldExpiresAt("");
                        setSlotStartAt("");
                        setStep(3);
                      }}
                    >
                      Выбрать другое время
                    </button>

                    <div className="text-xs text-zinc-500">
                      Нажимая «Подтвердить», вы соглашаетесь с обработкой данных для записи.
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
FILE

# 2) Динамический маршрут /[tenant]/booking
cat > "frontend/app/[tenant]/booking/page.tsx" <<'FILE'
import BookingFlow from "@/app/_public/BookingFlow";

export default async function TenantBookingPage({ params }: { params: { tenant: string } }) {
  return <BookingFlow tenantSlug={params.tenant} />;
}
FILE

# 3) /lime/booking — теперь реально работает (обёртка)
cat > "frontend/app/lime/booking/page.tsx" <<'FILE'
import BookingFlow from "@/app/_public/BookingFlow";

export default function LimeBookingPage() {
  return <BookingFlow tenantSlug="lime" />;
}
FILE

# 4) /booking — простой лендинг со ссылкой на демо tenant
cat > "frontend/app/booking/page.tsx" <<'FILE'
import Link from "next/link";

export default function BookingRootPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8">
          <h1 className="text-2xl font-semibold">Онлайн-запись</h1>
          <p className="mt-3 text-zinc-300">
            Выберите компанию (tenant) по slug. Демо-данные: <b>lime</b>.
          </p>

          <div className="mt-6">
            <Link
              href="/lime/booking"
              className="inline-flex rounded-xl bg-emerald-500 px-5 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              Перейти к записи: lime
            </Link>
          </div>

          <div className="mt-6 text-sm text-zinc-400">
            Общий формат: <code className="text-zinc-200">/{'{tenantSlug}'}/booking</code>
          </div>
        </div>
      </div>
    </main>
  );
}
FILE

echo "[OK] Public booking flow enabled: /[tenant]/booking (demo: /lime/booking)"
