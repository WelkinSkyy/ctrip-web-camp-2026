import { API_BASE } from '../config';

const TOKEN_KEY = 'admin_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

export interface ApiError {
  message: string;
  status: number;
}

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return (data as { message?: string }).message || res.statusText || '请求失败';
  } catch {
    return res.statusText || '请求失败';
  }
}

export async function request<T>(
  path: string,
  options: RequestInit & { method?: string; body?: unknown } = {}
): Promise<T> {
  const { body, ...init } = options;
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...((init.headers as Record<string, string>) || {}),
  };
  const token = getToken();
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('fetch') || msg.includes('NetworkError') || msg.includes('Failed')) {
      throw new Error(
        '无法连接后端，请检查：① 后端服务是否已启动（如 http://8.145.34.161:3000）② 浏览器控制台是否有 CORS 跨域报错 ③ 网络/防火墙是否拦截'
      );
    }
    throw e;
  }
  if (res.status === 401) {
    clearToken();
    window.location.href = '/login';
    throw new Error('请先登录');
  }
  if (!res.ok) {
    const message = await parseError(res);
    throw new Error(message);
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
