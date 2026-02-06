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
