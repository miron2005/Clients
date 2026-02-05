export const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:3001";
export const DEFAULT_TENANT = process.env.NEXT_PUBLIC_DEFAULT_TENANT_SLUG || "lime";

type ApiOptions = {
  token?: string | null;
  tenantSlug?: string;
};

function headersBase(opts?: ApiOptions) {
  const h: Record<string, string> = {
    "content-type": "application/json",
    "x-tenant": opts?.tenantSlug || DEFAULT_TENANT
  };
  if (opts?.token) h["authorization"] = `Bearer ${opts.token}`;
  return h;
}

export async function apiGet<T>(path: string, opts?: ApiOptions): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers: headersBase(opts),
    cache: "no-store"
  });
  if (!res.ok) throw new Error(`Ошибка API: ${res.status}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: any, opts?: ApiOptions): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: headersBase(opts),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ошибка API: ${res.status} ${t}`);
  }
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: any, opts?: ApiOptions): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: "PATCH",
    headers: headersBase(opts),
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Ошибка API: ${res.status} ${t}`);
  }
  return res.json() as Promise<T>;
}

