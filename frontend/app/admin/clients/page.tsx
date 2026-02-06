import AdminShell from "../_ui/AdminShell";

export default function AdminClients() {
  return (
    <AdminShell>
      <div>
        <div className="text-2xl font-semibold">Клиенты</div>
        <div className="mt-2 text-sm text-zinc-400">
          В Части 5 добавим CRM: карточка клиента, теги, заметки, согласия, сегменты.
        </div>
      </div>
    </AdminShell>
  );
}
