export default function BookingPage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8 shadow-xl">
        <h1 className="text-2xl font-semibold tracking-tight">Онлайн-запись — Демо-салон «Лайм»</h1>
        <p className="mt-3 text-zinc-300">
          Публичный поток записи будет: <span className="text-zinc-100">услуга → сотрудник → время → подтверждение</span>.
        </p>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
            <div className="text-sm text-zinc-400">Шаг 1</div>
            <div className="mt-1 font-medium">Выбор услуги</div>
            <div className="mt-2 text-sm text-zinc-300">Здесь появится список услуг с ценой и длительностью.</div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
            <div className="text-sm text-zinc-400">Шаг 2</div>
            <div className="mt-1 font-medium">Выбор мастера</div>
            <div className="mt-2 text-sm text-zinc-300">Здесь будет фильтр по сотрудникам и их загрузке.</div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
            <div className="text-sm text-zinc-400">Шаг 3</div>
            <div className="mt-1 font-medium">Выбор времени</div>
            <div className="mt-2 text-sm text-zinc-300">Слоты будут подгружаться с backend и блокироваться (slot-locking).</div>
          </div>

          <div className="rounded-2xl border border-zinc-800 bg-zinc-950/40 p-5">
            <div className="text-sm text-zinc-400">Шаг 4</div>
            <div className="mt-1 font-medium">Подтверждение</div>
            <div className="mt-2 text-sm text-zinc-300">Контакты клиента + согласие на рассылку + подтверждение записи.</div>
          </div>
        </div>
      </div>
    </main>
  );
}

