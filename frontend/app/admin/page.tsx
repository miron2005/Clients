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
