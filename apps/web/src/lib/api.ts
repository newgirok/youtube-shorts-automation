const API_BASE = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

export class ApiError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

function authHeaders(): Record<string, string> {
  const secret = process.env.NEXT_PUBLIC_API_SECRET;
  return secret ? { Authorization: `Bearer ${secret}` } : {};
}

async function throwIfError(res: Response, label: string): Promise<void> {
  if (res.ok) return;
  let message = `${label} failed: ${res.status}`;
  try {
    const body = await res.json() as { message?: string };
    if (body.message) message = body.message;
  } catch {}
  throw new ApiError(res.status, message);
}

export async function apiGet<T>(path: string, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    cache: 'no-store',
    headers: { ...authHeaders(), ...extraHeaders },
  });
  await throwIfError(res, `GET ${path}`);
  return res.json() as Promise<T>;
}

export async function apiPost<T>(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...extraHeaders },
    body: JSON.stringify(body),
  });
  await throwIfError(res, `POST ${path}`);
  return res.json() as Promise<T>;
}

export async function apiPatch<T>(path: string, body: unknown, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...extraHeaders },
    body: JSON.stringify(body),
  });
  await throwIfError(res, `PATCH ${path}`);
  return res.json() as Promise<T>;
}

export async function apiDelete<T>(path: string, extraHeaders?: Record<string, string>): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'DELETE',
    headers: { ...authHeaders(), ...extraHeaders },
  });
  await throwIfError(res, `DELETE ${path}`);
  return res.json() as Promise<T>;
}
