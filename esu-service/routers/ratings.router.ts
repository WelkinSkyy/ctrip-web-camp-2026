import { SQL, sql } from 'drizzle-orm';

import { ratingsContract } from 'esu-types';
import { ratings, hotels } from '../schema.js';
import type { DbInstance, DbTransaction } from '../utils/index.js';
import { checkPermission, errorResponse } from '../utils/permissions.js';

export const createRatingsRouter = (s: ReturnType<typeof import('@ts-rest/fastify').initServer>, db: DbInstance) => {
  return s.router(ratingsContract, {
    create: async ({ body, request }) => {
      const jwt = await checkPermission(request, ratingsContract.create.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: body.hotelId }, deletedAt: { isNull: true } },
      });

      if (!hotel) {
        return errorResponse(404, '酒店不存在');
      }

      const existingRating = await db.query.ratings.findFirst({
        where: { userId: { eq: jwt.id }, hotelId: { eq: body.hotelId } },
      });

      if (existingRating) {
        return errorResponse(400, '您已评价过此酒店');
      }

      const result = await db.transaction(async (tx: DbTransaction) => {
        const [created] = await tx
          .insert(ratings)
          .values({
            userId: jwt.id,
            hotelId: body.hotelId,
            score: body.score,
            comment: body.comment ?? null,
          })
          .returning();

        if (!created) {
          throw new Error('创建评分失败');
        }

        const allRatings = await tx.query.ratings!.findMany({
          where: { hotelId: { eq: body.hotelId } },
        });

        const totalScore = allRatings.reduce((sum: number, r: any) => sum + r.score, 0);
        const avgRating = allRatings.length > 0 ? totalScore / allRatings.length : 0;

        await tx
          .update(hotels)
          .set({
            averageRating: Math.round(avgRating * 100) / 100,
            ratingCount: allRatings.length,
            updatedAt: new Date(),
          })
          .where(sql`${hotels.id} = ${body.hotelId}`);

        return created;
      });

      return { status: 201, body: result };
    },

    list: async ({ query }) => {
      const page = query.page || 1;
      const limit = query.limit || 10;
      const whereCondition: Record<string, unknown> = { deletedAt: { isNull: true } };

      if (query.hotelId) {
        whereCondition.hotelId = { eq: query.hotelId };
      }

      const ratingList = await db.query.ratings.findMany({
        where: whereCondition,
        with: {
          user: { columns: { id: true, username: true } },
          hotel: { columns: { id: true, nameZh: true } },
        },
        limit,
        offset: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
      });

      const total = await db
        .select({ count: sql<number>`count(*)` })
        .from(ratings)
        .where(
          sql`${ratings.deletedAt} IS NULL${query.hotelId ? sql` AND ${ratings.hotelId} = ${query.hotelId}` : sql``}`,
        );

      return { status: 200, body: { ratings: ratingList, total: Number(total[0]?.count) || 0 } };
    },

    get: async ({ params }) => {
      const rating = await db.query.ratings.findFirst({
        where: { id: { eq: params.id }, deletedAt: { isNull: true } },
        with: {
          user: { columns: { id: true, username: true } },
          hotel: { columns: { id: true, nameZh: true } },
        },
      });

      if (!rating) {
        return errorResponse(404, '评分不存在');
      }

      return { status: 200, body: rating };
    },

    update: async ({ params, body, request }) => {
      const jwt = await checkPermission(request, ratingsContract.update.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const rating = await db.query.ratings.findFirst({
        where: { id: { eq: params.id } },
      });

      if (!rating) {
        return errorResponse(404, '评分不存在');
      }

      const ratingAny = rating as { userId: number; hotelId: number };

      if (ratingAny.userId !== jwt.id && jwt.role !== 'admin') {
        return errorResponse(403, '无权限修改此评分');
      }

      const result = await db.transaction(async (tx: DbTransaction) => {
        const [resultUpdate] = await tx
          .update(ratings)
          .set({
            ...body,
            updatedAt: new Date(),
          })
          .where(sql`${ratings.id} = ${params.id}`)
          .returning();

        if (!resultUpdate) {
          throw new Error('更新评分失败');
        }

        if (body.score !== undefined) {
          const allRatings = await tx.query.ratings!.findMany({
            where: { hotelId: { eq: ratingAny.hotelId } },
          });

          const totalScore = allRatings.reduce((sum: number, r: any) => sum + r.score, 0);
          const avgRating = allRatings.length > 0 ? totalScore / allRatings.length : 0;

          await tx
            .update(hotels)
            .set({
              averageRating: Math.round(avgRating * 100) / 100,
              updatedAt: new Date(),
            })
            .where(sql`${hotels.id} = ${ratingAny.hotelId}`);
        }

        return resultUpdate;
      });

      return { status: 200, body: result };
    },

    delete: async ({ params, request }) => {
      const jwt = await checkPermission(request, ratingsContract.delete.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const rating = await db.query.ratings.findFirst({
        where: { id: { eq: params.id } },
      });

      if (!rating) {
        return errorResponse(404, '评分不存在');
      }

      const ratingAny = rating as { userId: number; hotelId: number };

      if (ratingAny.userId !== jwt.id && jwt.role !== 'admin') {
        return errorResponse(403, '无权限删除此评分');
      }

      await db.transaction(async (tx: DbTransaction) => {
        await tx
          .update(ratings)
          .set({ deletedAt: new Date() })
          .where(sql`${ratings.id} = ${params.id}`);

        const allRatings = await tx.query.ratings!.findMany({
          where: { hotelId: { eq: ratingAny.hotelId }, deletedAt: { isNull: true } },
        });

        const totalScore = allRatings.reduce((sum: number, r: any) => sum + r.score, 0);
        const avgRating = allRatings.length > 0 ? totalScore / allRatings.length : 0;

        await tx
          .update(hotels)
          .set({
            averageRating: allRatings.length > 0 ? Math.round(avgRating * 100) / 100 : null,
            ratingCount: allRatings.length,
            updatedAt: new Date(),
          })
          .where(sql`${hotels.id} = ${ratingAny.hotelId}`);
      });

      return { status: 200, body: { message: 'Deleted' as const } };
    },
  });
};
