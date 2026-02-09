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

// 全局响应式状态
export const currentUser = signal<{id: string, name: string, role: Role} | null>(null);
export const hotels = signal<Hotel[]>([
  { id: '1', name: '全季酒店-外滩店', address: '上海市黄浦区', price: 599, tags: ['含早', '免费停车'], status: '通过', merchantId: 'm1' }
]);
