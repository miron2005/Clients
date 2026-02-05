"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../_auth/AuthProvider";

export default function AdminLoginPage() {
  const router = useRouter();
  const { login, session } = useAuth();

  const [email, setEmail] = useState("admin@lime.local");
  const [password, setPassword] = useState("Admin123!");
  const [error, setError] = useState("");

  useEffect(() => {
    if (session?.accessToken) router.replace("/admin/calendar");
  }, [session?.accessToken, router]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    try {
      await login(email.trim(), password);
      router.replace("/admin/calendar");
    } catch {
      setError("Не удалось войти. Проверьте email/пароль и tenant (lime).");
    }
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-md px-4 py-20">
        <div className="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
          <div className="text-xl font-semibold">Вход в админ-панель</div>
          <div className="mt-1 text-sm text-zinc-400">
            Демо: <b>admin@lime.local</b> / <b>Admin123!</b>
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={onSubmit} className="mt-5 space-y-3">
            <div>
              <div className="mb-1 text-sm text-zinc-300">Email</div>
              <input
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <div className="mb-1 text-sm text-zinc-300">Пароль</div>
              <input
                type="password"
                className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-zinc-950 hover:bg-emerald-400"
            >
              Войти
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
