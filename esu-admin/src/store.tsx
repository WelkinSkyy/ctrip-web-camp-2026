import { signal } from "@preact/signals";

export type Role = 'merchant' | 'admin';
export type HotelStatus = '审核中' | '通过' | '不通过' | '已下线';

export interface Hotel {
  id: string;
  name: string;
  address: string;
  price: number;
  tags: string[]; // 体验维度：如“智能家居”“免费接送”
  status: HotelStatus;
  rejectReason?: string; // 审核不通过原因
  merchantId: string;
}

// 全局响应式状态（与后端同步时由各页面拉取后写入 hotels）
export const currentUser = signal<{ id: string; name: string; role: Role } | null>(null);
export const hotels = signal<Hotel[]>([]);

// 页面内居中提示（替代 alert）
export const toastMessage = signal<string | null>(null);
export function showToast(msg: string) {
  toastMessage.value = msg;
}
