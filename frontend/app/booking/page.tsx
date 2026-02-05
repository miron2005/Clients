"use client";

import { useEffect, useMemo, useState } from "react";
import { apiGet, apiPost } from "@/lib/api";

type Service = { id: string; name: string; durationMinutes: number; priceCents: number; currency: string };
type Staff = { id: string; displayName: string };
type Slot = { startAt: string; endAt: string };

function fmtPrice(cents: number) {
  return `${(cents / 100).toFixed(2).replace(".", ",")} €`;
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

export default function BookingPage({ params }: { params: { tenant: string } }) {
  const tenantSlug = params.tenant;

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

  useEffect(() => {
    (async () => {
      try {
        setError("");
        const resp = await apiGet<{ services: Service[] }>(`/public/${tenantSlug}/services`);
        setServices(resp.services);
      } catch (e: any) {
        setError("Не удалось загрузить услуги. Проверьте, что backend запущен.");
      }
    })();
  }, [tenantSlug]);

  useEffect(() => {
    if (!serviceId) return;
    (async () => {
      try {
        setError("");
        const resp = await apiGet<{ staff: Staff[] }>(`/public/${tenantSlug}/staff?serviceId=${serviceId}`);
        setStaff(resp.staff);
      } catch (e: any) {
        setError("Не удалось загрузить мастеров.");
      }
    })();
  }, [tenantSlug, serviceId]);

  useEffect(() => {
    if (!serviceId || !staffId || !date) return;
    (async () => {
      try {
        setError("");
        setSlots([]);
        const resp = await apiGet<{ slots: Slot[] }>(
          `/public/${tenantSlug}/slots?serviceId=${serviceId}&staffId=${staffId}&date=${date}`
        );
        setSlots(resp.slots);
      } catch (e: any) {
        setError("Не удалось загрузить свободное время.");
      }
    })();
  }, [tenantSlug, serviceId, staffId, date]);

  async function createHold(startAt: string) {
    try {
      setError("");
      const resp = await apiPost<{ holdId: string; expiresAt: string }>(`/public/${tenantSlug}/holds`, {
        serviceId,
        staffId,
        startAt,
        clientPhone: clientPhone || undefined
      });
      setHoldId(resp.holdId);
      setHoldExpiresAt(resp.expiresAt);
      setSlotStartAt(startAt);
      setStep(4);
    } catch (e: any) {
      setError("Не удалось зафиксировать время. Возможно, слот уже заняли. Обновите список.");
    }
  }

  async function confirmBooking() {
    try {
      setError("");
      const resp = await apiPost(`/public/${tenantSlug}/bookings`, {
        holdId,
        clientName,
        clientPhone,
        notes: notes || undefined,
        consentMarketing: consent
      });
      setSuccess(resp);
    } catch (e: any) {
      setError("Не удалось подтвердить запись. Попробуйте заново выбрать время.");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-5xl px-4 py-10">
        <div className="mb-6">
          <div className="text-2xl font-semibold">Онлайн-запись</div>
          <div className="text-sm text-zinc-400">Компания: {tenantSlug}</div>
        </div>

        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {success ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6">
            <div className="text-xl font-semibold">Запись подтверждена ✅</div>
            <div className="mt-2 text-sm text-zinc-200">
              <div>Услуга: <b>{success.booking.serviceName}</b></div>
              <div>Мастер: <b>{success.booking.staffName}</b></div>
              <div>Время: <b>{new Date(success.booking.startAt).toLocaleString("ru-RU")}</b></div>
              <div>Стоимость: <b>{fmtPrice(success.booking.priceCents)}</b></div>
            </div>
            <div className="mt-4 text-sm text-zinc-300">
              Напоминания отправятся только при наличии согласия на рассылку.
              (В dev WhatsApp печатается в логах, Telegram — в тестовый чат при настройке.)
            </div>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {/* Левая колонка — шаги */}
            <div className="md:col-span-2 space-y-4">
              {/* Step 1: услуга */}
              <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 ${step === 1 ? "" : "opacity-80"}`}>
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-lg font-semibold">1) Выберите услугу</div>
                  {serviceId && (
                    <button
                      className="text-sm text-zinc-300 hover:text-zinc-100"
                      onClick={() => { setServiceId(""); setStaffId(""); setStep(1); }}
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
                      onClick={() => { setServiceId(s.id); setStep(2); }}
                    >
                      <div className="font-medium">{s.name}</div>
                      <div className="text-sm text-zinc-400">
                        {s.durationMinutes} мин • {fmtPrice(s.priceCents)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 2: мастер */}
              <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 ${step >= 2 ? "" : "opacity-60"}`}>
                <div className="mb-3 text-lg font-semibold">2) Выберите мастера</div>
                {!serviceId ? (
                  <div className="text-sm text-zinc-400">Сначала выберите услугу.</div>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    {staff.map((m) => (
                      <button
                        key={m.id}
                        className={`rounded-xl border px-4 py-3 text-left transition ${
                          staffId === m.id ? "border-emerald-400/60 bg-emerald-500/10" : "border-zinc-800 hover:border-zinc-700"
                        }`}
                        onClick={() => { setStaffId(m.id); setStep(3); }}
                      >
                        <div className="font-medium">{m.displayName}</div>
                        <div className="text-sm text-zinc-400">Доступен по расписанию</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Step 3: время */}
              <div className={`rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5 ${step >= 3 ? "" : "opacity-60"}`}>
                <div className="mb-3 flex items-center justify-between">
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

            {/* Правая колонка — подтверждение */}
            <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-5">
              <div className="text-lg font-semibold">Подтверждение</div>
              <div className="mt-2 text-sm text-zinc-400">
                {selectedService ? (
                  <>
                    <div>Услуга: <b className="text-zinc-200">{selectedService.name}</b></div>
                    <div>Цена: <b className="text-zinc-200">{fmtPrice(selectedService.priceCents)}</b></div>
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
                    Время зафиксировано до:{" "}
                    <b>{new Date(holdExpiresAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}</b>
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
                        placeholder="+49 000 000001"
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
                      disabled={!clientName || !clientPhone || !holdId}
                      onClick={confirmBooking}
                    >
                      Подтвердить запись
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

