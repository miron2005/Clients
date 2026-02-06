import AdminShell from "../_ui/AdminShell";

export default function AdminStaff() {
  return (
    <AdminShell>
      <div>
        <div className="text-2xl font-semibold">Сотрудники</div>
        <div className="mt-2 text-sm text-zinc-400">
          В Части 5 добавим CRUD сотрудников + расписание (availability) и привязку к пользователю.
        </div>
      </div>
    </AdminShell>
  );
}
