import { SQL, sql } from 'drizzle-orm';

import { promotionsContract } from 'esu-types';
import { promotions } from '../schema.js';
import type { DbInstance } from '../utils/index.js';
import { checkPermission, errorResponse } from '../utils/permissions.js';

export const createPromotionsRouter = (s: ReturnType<typeof import('@ts-rest/fastify').initServer>, db: DbInstance) => {
  return s.router(promotionsContract, {
    create: async ({ body, request }) => {
      const jwt = await checkPermission(request, promotionsContract.create.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const [newPromo] = await db
        .insert(promotions)
        .values({ ...body, ownerId: jwt.id })
        .returning();

      if (!newPromo) {
        return errorResponse(500, '创建错误');
      }

      return { status: 201, body: newPromo };
    },

    list: async ({ query }) => {
      const whereCondition: Record<string, unknown> = { deletedAt: { isNull: true } };

      if (query.hotelId) {
        whereCondition.hotelId = { eq: Number(query.hotelId) };
      }

      if (query.roomTypeId) {
        whereCondition.roomTypeId = { eq: Number(query.roomTypeId) };
      }

      const promoList = await db.query.promotions.findMany({
        where: whereCondition,
        with: {
          hotel: { columns: { id: true, nameZh: true } },
          roomType: { columns: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      });

      return { status: 200, body: promoList };
    },

    get: async ({ params }) => {
      const promo = await db.query.promotions.findFirst({
        where: { id: { eq: params.id }, deletedAt: { isNull: true } },
        with: {
          hotel: true,
          roomType: true,
          owner: { columns: { id: true, username: true } },
        },
      });

      if (!promo) {
        return errorResponse(404, '优惠不存在');
      }

      return { status: 200, body: promo };
    },

    update: async ({ params, body, request }) => {
      const jwt = await checkPermission(request, promotionsContract.update.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const promo = await db.query.promotions.findFirst({
        where: { id: { eq: params.id } },
      });

      if (!promo) {
        return errorResponse(404, '优惠不存在');
      }

      if (jwt.role === 'merchant' && promo.ownerId !== jwt.id) {
        return errorResponse(403, '无权限修改此优惠');
      }

      const [updated] = await db
        .update(promotions)
        .set({ ...body, updatedAt: new Date() })
        .where(sql`${promotions.id} = ${params.id}`)
        .returning();

      if (!updated) {
        return errorResponse(500, '更新错误');
      }

      return { status: 200, body: updated };
    },

    delete: async ({ params, request }) => {
      const jwt = await checkPermission(request, promotionsContract.delete.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const promo = await db.query.promotions.findFirst({
        where: { id: { eq: params.id } },
      });

      if (!promo) {
        return errorResponse(404, '优惠不存在');
      }

      if (jwt.role === 'merchant' && promo.ownerId !== jwt.id) {
        return errorResponse(403, '无权限删除此优惠');
      }

      await db
        .update(promotions)
        .set({ deletedAt: new Date() })
        .where(sql`${promotions.id} = ${params.id}`);

      return { status: 200, body: { message: 'Deleted' as const } };
    },
  });
};
