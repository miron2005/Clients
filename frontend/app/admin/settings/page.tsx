import AdminShell from "../_ui/AdminShell";

export default function AdminSettings() {
  return (
    <AdminShell>
      <div>
        <div className="text-2xl font-semibold">Настройки</div>
        <div className="mt-2 text-sm text-zinc-400">
          Здесь будет брендирование, публичная страница компании и управление шаблонами сообщений.
        </div>
      </div>
    </AdminShell>
  );
}
