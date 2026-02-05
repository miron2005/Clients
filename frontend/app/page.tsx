import Link from "next/link";

export default function HomePage() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <div className="rounded-3xl border border-zinc-800 bg-zinc-900/40 p-8 shadow-xl">
        <h1 className="text-3xl font-semibold tracking-tight">Платформа онлайн-записи</h1>
        <p className="mt-3 text-zinc-300">
          Это стартовая страница. Дальше будут публичная запись и админ-панель.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            className="rounded-2xl bg-lime-400 px-4 py-2 text-zinc-950 font-medium hover:bg-lime-300"
            href="/lime/booking"
          >
            Записаться (Демо-салон «Лайм»)
          </Link>

          <Link
            className="rounded-2xl border border-zinc-700 px-4 py-2 text-zinc-100 hover:bg-zinc-800"
            href="/admin/login"
          >
            Войти в админ-панель
          </Link>
        </div>
      </div>
    </main>
  );
}

