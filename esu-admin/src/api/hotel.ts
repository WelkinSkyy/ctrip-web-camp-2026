import { request } from './request';
import type { Hotel, HotelStatus } from '../store';

const BACKEND_STATUS_MAP: Record<string, HotelStatus> = {
  pending: '审核中',
  approved: '通过',
  rejected: '不通过',
  offline: '已下线',
};

const FRONTEND_STATUS_MAP: Record<HotelStatus, string> = {
  '审核中': 'pending',
  '通过': 'approved',
  '不通过': 'rejected',
  '已下线': 'offline',
};

export interface BackendHotel {
  id: number;
  nameZh: string;
  nameEn?: string | null;
  ownerId: number;
  address: string;
  starRating: number;
  openingDate: string;
  nearbyAttractions?: string[] | null;
  images?: string[] | null;
  facilities?: string[] | null;
  status: 'pending' | 'approved' | 'rejected' | 'offline';
  statusDescription?: string | null;
  roomTypes?: { price?: number }[];
}

function mapBackendToFrontend(h: BackendHotel): Hotel {
  const prices = (h.roomTypes ?? []).map((r) => r.price ?? 0).filter((p) => p > 0);
  const price = prices.length ? Math.min(...prices) : 0;
  return {
    id: String(h.id),
    name: h.nameZh,
    address: h.address,
    price: price || 0,
    tags: h.facilities ?? [],
    status: BACKEND_STATUS_MAP[h.status] ?? '审核中',
    rejectReason: h.statusDescription ?? undefined,
    merchantId: String(h.ownerId),
  };
}

export interface HotelListResponse {
  hotels: BackendHotel[];
  total: number;
  page?: number;
}

export function listMerchant(): Promise<HotelListResponse> {
  return request<HotelListResponse>('/hotels/merchant', { method: 'GET' });
}

export function listAdmin(params?: { status?: string; page?: number; limit?: number }): Promise<HotelListResponse> {
  const q = new URLSearchParams();
  if (params?.status) q.set('status', params.status);
  if (params?.page != null) q.set('page', String(params.page));
  if (params?.limit != null) q.set('limit', String(params.limit));
  const query = q.toString();
  return request<HotelListResponse>(`/hotels/admin${query ? `?${query}` : ''}`, { method: 'GET' });
}

export function getHotel(id: string): Promise<BackendHotel> {
  return request<BackendHotel>(`/hotels/${id}`, { method: 'GET' });
}

export interface HotelCreateBody {
  nameZh: string;
  nameEn?: string | null;
  ownerId?: number;
  address: string;
  starRating: number;
  openingDate: string;
  nearbyAttractions?: string[] | null;
  images?: string[] | null;
  facilities?: string[] | null;
}

export function createHotel(body: HotelCreateBody): Promise<BackendHotel> {
  return request<BackendHotel>('/hotels', { method: 'POST', body });
}

export function updateHotel(id: string, body: Partial<HotelCreateBody> & { status?: string; statusDescription?: string | null }): Promise<BackendHotel> {
  return request<BackendHotel>(`/hotels/${id}`, { method: 'PUT', body });
}

export function approveHotel(id: string): Promise<BackendHotel> {
  return request<BackendHotel>(`/hotels/${id}/approve`, { method: 'POST', body: {} });
}

export function rejectHotel(id: string, rejectReason: string): Promise<BackendHotel> {
  return request<BackendHotel>(`/hotels/${id}/reject`, { method: 'PUT', body: { rejectReason } });
}

export function offlineHotel(id: string): Promise<BackendHotel> {
  return request<BackendHotel>(`/hotels/${id}/offline`, { method: 'PUT', body: {} });
}

export function onlineHotel(id: string): Promise<BackendHotel> {
  return request<BackendHotel>(`/hotels/${id}/online`, { method: 'PUT', body: {} });
}

export function deleteHotel(id: string): Promise<{ message: 'Deleted' }> {
  return request<{ message: 'Deleted' }>(`/hotels/${id}`, { method: 'DELETE' });
}

export { mapBackendToFrontend, FRONTEND_STATUS_MAP };
