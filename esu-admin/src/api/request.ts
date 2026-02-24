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
    const data = (await res.json()) as Record<string, unknown>;
    if (typeof data.message === 'string') return data.message;
    if (typeof data.error === 'string') return data.error;
    if (Array.isArray(data.errors) && data.errors.length > 0) {
      const parts = data.errors.map((e: unknown) => (typeof e === 'string' ? e : (e as { message?: string }).message || String(e)));
      return parts.join('；');
    }
    if (Array.isArray(data.issues) && data.issues.length > 0) {
      const parts = data.issues.map((i: unknown) => {
        const item = i as { message?: string; path?: unknown };
        return item.message || JSON.stringify(item.path ?? i);
      });
      return parts.join('；');
    }
    return res.statusText || '请求失败';
  } catch {
    if (res.status === 400) {
      return '请求参数有误：请检查用户名（至少3字符）、密码（至少6位）及格式';
    }
    return res.statusText || '请求失败';
  }
}

export type RequestOptions = Omit<RequestInit, 'body'> & { body?: unknown };

export async function request<T>(
  path: string,
  options: RequestOptions = {}
): Promise<T> {
  const { body, ...init } = options;
  const url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  const hasBody = body !== undefined && body !== null;
  const headers: HeadersInit = {
    ...((init.headers as Record<string, string>) || {}),
  };
  if (hasBody) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }
  const token = getToken();
  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers,
      body: hasBody ? JSON.stringify(body) : undefined,
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
    const isLoginOrRegister = path.includes('/users/login') || path.includes('/users/register');
    if (!isLoginOrRegister) {
      clearToken();
      window.location.href = '/login';
      throw new Error('请先登录');
    }
    const message = await parseError(res);
    const err = new Error(message) as Error & { status?: number };
    err.status = 401;
    throw err;
  }
  if (!res.ok) {
    const message = await parseError(res);
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  if (res.status === 204 || res.headers.get('content-length') === '0') {
    return undefined as T;
  }
  return res.json() as Promise<T>;
}
