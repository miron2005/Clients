import AdminShell from "../_ui/AdminShell";

export default function AdminServices() {
  return (
    <AdminShell>
      <div>
        <div className="text-2xl font-semibold">Услуги</div>
        <div className="mt-2 text-sm text-zinc-400">
          В Части 5 добавим CRUD услуг (создать/изменить/архивировать), цены и длительность.
        </div>
      </div>
    </AdminShell>
  );
}
