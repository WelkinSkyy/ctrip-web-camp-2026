import { request, setToken } from './request';

export type BackendRole = 'customer' | 'merchant' | 'admin';

export interface UserResponse {
  id: number;
  username: string;
  role: BackendRole;
  phone?: string | null;
  email?: string | null;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
}

export interface LoginResponse {
  token: string;
  user: UserResponse;
}

export function login(username: string, password: string): Promise<LoginResponse> {
  return request<LoginResponse>('/users/login', {
    method: 'POST',
    body: { username, password },
  });
}

export interface RegisterBody {
  username: string;
  password: string;
  role: 'merchant' | 'admin' | 'customer';
  phone?: string | null;
  email?: string | null;
}

export function register(body: RegisterBody): Promise<UserResponse> {
  return request<UserResponse>('/users/register', {
    method: 'POST',
    body,
  });
}

export function me(): Promise<UserResponse> {
  return request<UserResponse>('/users/me', { method: 'GET' });
}
