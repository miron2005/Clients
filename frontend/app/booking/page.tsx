import Link from "next/link";

export default function BookingRootPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8">
          <h1 className="text-2xl font-semibold">Онлайн-запись</h1>
          <p className="mt-3 text-zinc-300">
            Выберите компанию (tenant) по slug. Демо: <b>lime</b>.
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
