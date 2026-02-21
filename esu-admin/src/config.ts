/**
 * 后端 API 根地址（无末尾斜杠）
 * 来自环境变量 VITE_API_BASE，打包时由 Vite 注入
 */
export const API_BASE =
  (import.meta.env.VITE_API_BASE as string)?.replace(/\/$/, '') || '';
