import { SQL, sql } from 'drizzle-orm';

import { roomTypesContract } from 'esu-types';
import { roomTypes, hotels } from '../schema.js';
import type { DbInstance } from '../utils/index.js';
import { checkPermission, errorResponse } from '../utils/permissions.js';

export const createRoomTypesRouter = (s: ReturnType<typeof import('@ts-rest/fastify').initServer>, db: DbInstance) => {
  return s.router(roomTypesContract, {
    create: async ({ body, request }) => {
      const jwt = await checkPermission(request, roomTypesContract.create.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: body.hotelId }, deletedAt: { isNull: true } },
      });

      if (!hotel) {
        return errorResponse(404, '酒店不存在');
      }

      const [newRoomType] = await db.insert(roomTypes).values(body).returning();

      if (!newRoomType) {
        return errorResponse(500, '创建错误');
      }

      return { status: 201, body: newRoomType };
    },

    get: async ({ params }) => {
      const roomType = await db.query.roomTypes.findFirst({
        where: { id: { eq: params.id }, deletedAt: { isNull: true } },
        with: { hotel: { columns: { id: true, nameZh: true } } },
      });

      if (!roomType) {
        return errorResponse(404, '房型不存在');
      }

      return { status: 200, body: roomType };
    },

    update: async ({ params, body, request }) => {
      const jwt = await checkPermission(request, roomTypesContract.update.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const rt = await db.query.roomTypes.findFirst({
        where: { id: { eq: params.id } },
      });

      if (!rt) {
        return errorResponse(404, '房型不存在');
      }

      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: rt.hotelId } },
      });

      if (jwt.role === 'merchant' && hotel?.ownerId !== jwt.id) {
        return errorResponse(403, '无权限修改此房型');
      }

      const [updated] = await db
        .update(roomTypes)
        .set({ ...body, updatedAt: new Date() })
        .where(sql`${roomTypes.id} = ${params.id}`)
        .returning();

      if (!updated) {
        return errorResponse(500, '更新错误');
      }

      return { status: 200, body: updated };
    },

    delete: async ({ params, request }) => {
      const jwt = await checkPermission(request, roomTypesContract.delete.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const rt = await db.query.roomTypes.findFirst({
        where: { id: { eq: params.id } },
      });

      if (!rt) {
        return errorResponse(404, '房型不存在');
      }

      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: rt.hotelId } },
      });

      if (jwt.role === 'merchant' && hotel?.ownerId !== jwt.id) {
        return errorResponse(403, '无权限删除此房型');
      }

      await db
        .update(roomTypes)
        .set({ deletedAt: new Date() })
        .where(sql`${roomTypes.id} = ${params.id}`);

      return { status: 200, body: { message: 'Deleted' as const } };
    },
  });
};
