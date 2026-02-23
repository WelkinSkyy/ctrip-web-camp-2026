import { request } from './request';

/** 后端房型（与 esu-types RoomTypeSchema 一致） */
export interface BackendRoomType {
  id: number;
  hotelId: number;
  name: string;
  price: number;
  stock: number;
  capacity?: number | null;
  description?: string | null;
}

export interface RoomTypeCreateBody {
  hotelId: number;
  name: string;
  price: number;
  stock: number;
  capacity?: number | null;
  description?: string | null;
}

export interface RoomTypeUpdateBody {
  name?: string;
  price?: number;
  stock?: number;
  capacity?: number | null;
  description?: string | null;
}

export function createRoomType(body: RoomTypeCreateBody): Promise<BackendRoomType> {
  return request<BackendRoomType>('/room-types', { method: 'POST', body });
}

export function updateRoomType(id: string | number, body: RoomTypeUpdateBody): Promise<BackendRoomType> {
  return request<BackendRoomType>(`/room-types/${id}`, { method: 'PUT', body });
}

export function deleteRoomType(id: string | number): Promise<{ message: 'Deleted' }> {
  return request<{ message: 'Deleted' }>(`/room-types/${id}`, { method: 'DELETE' });
}
