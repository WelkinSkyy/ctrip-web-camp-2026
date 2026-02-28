import { SQL, sql } from 'drizzle-orm';

import { bookingsContract } from 'esu-types';
import { bookings, roomTypes, hotels } from '../schema.js';
import type { DbInstance, DbTransaction } from '../utils/index.js';
import { checkPermission, errorResponse } from '../utils/permissions.js';

export const createBookingsRouter = (s: ReturnType<typeof import('@ts-rest/fastify').initServer>, db: DbInstance) => {
  return s.router(bookingsContract, {
    create: async ({ body, request }) => {
      const jwt = await checkPermission(request, bookingsContract.create.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const rt = await db.query.roomTypes.findFirst({
        where: { id: { eq: body.roomTypeId }, deletedAt: { isNull: true } },
      });

      if (!rt) {
        return errorResponse(404, '房型不存在');
      }

      if ((rt as { stock: number }).stock <= 0) {
        return errorResponse(400, '库存不足');
      }

      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: body.hotelId } },
      });

      if (!hotel || (hotel as { status: string }).status !== 'approved') {
        return errorResponse(400, '无效的酒店');
      }

      const checkIn = new Date(body.checkIn);
      const checkOut = new Date(body.checkOut);
      const days = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));

      if (days <= 0) {
        return errorResponse(400, '入住日期必须早于离店日期');
      }

      const totalPrice = Number((rt as { price: number }).price) * days;

      const result = await db.transaction(async (tx: DbTransaction) => {
        await tx
          .update(roomTypes)
          .set({
            stock: sql`${roomTypes.stock} - 1`,
            updatedAt: new Date(),
          })
          .where(sql`${roomTypes.id} = ${body.roomTypeId}`);

        const [created] = await tx
          .insert(bookings)
          .values({
            userId: jwt.id,
            hotelId: body.hotelId,
            roomTypeId: body.roomTypeId,
            checkIn: body.checkIn,
            checkOut: body.checkOut,
            totalPrice,
            status: 'pending',
          })
          .returning();

        if (!created) {
          throw new Error('创建预订失败');
        }

        return created;
      });

      return { status: 201, body: result };
    },

    list: async ({ query, request }) => {
      const jwt = await checkPermission(request, bookingsContract.list.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const page = query.page || 1;
      const limit = query.limit || 10;
      const whereCondition: Record<string, unknown> = {
        userId: { eq: jwt.id },
        deletedAt: { isNull: true },
      };

      if (query.status) {
        whereCondition.status = { eq: query.status };
      }

      const bookingList = await db.query.bookings.findMany({
        where: whereCondition,
        with: {
          hotel: { columns: { id: true, nameZh: true, address: true } },
          roomType: { columns: { id: true, name: true, price: true } },
        },
        limit,
        offset: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
      });

      return { status: 200, body: { bookings: bookingList, total: bookingList.length, page } };
    },

    adminList: async ({ query, request }) => {
      const jwt = await checkPermission(request, bookingsContract.adminList.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const page = query.page || 1;
      const limit = query.limit || 10;
      const whereCondition: Record<string, unknown> = { deletedAt: { isNull: true } };

      if (query.hotelId) {
        whereCondition.hotelId = { eq: Number(query.hotelId) };
      }

      if (query.status) {
        whereCondition.status = { eq: query.status };
      }

      const bookingList = await db.query.bookings.findMany({
        where: whereCondition,
        with: {
          user: { columns: { id: true, username: true } },
          hotel: { columns: { id: true, nameZh: true } },
          roomType: { columns: { id: true, name: true } },
        },
        limit,
        offset: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
      });

      return { status: 200, body: { bookings: bookingList, total: bookingList.length, page } };
    },

    merchantList: async ({ query, request }) => {
      const jwt = await checkPermission(request, bookingsContract.merchantList.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const page = query.page || 1;
      const limit = query.limit || 10;

      const merchantHotels = await db.query.hotels.findMany({
        where: { ownerId: { eq: jwt.id } },
        columns: { id: true },
      });

      const hotelIds = merchantHotels.map((h: { id: number }) => h.id);

      if (!hotelIds.length) {
        return { status: 200, body: { bookings: [], total: 0, page } };
      }

      const whereCondition: Record<string, unknown> = {
        hotelId: { in: hotelIds },
        deletedAt: { isNull: true },
      };

      if (query.hotelId) {
        whereCondition.hotelId = { eq: Number(query.hotelId) };
      }

      if (query.status) {
        whereCondition.status = { eq: query.status };
      }

      const bookingList = await db.query.bookings.findMany({
        where: whereCondition,
        with: {
          user: { columns: { id: true, username: true } },
          hotel: { columns: { id: true, nameZh: true } },
          roomType: { columns: { id: true, name: true } },
        },
        limit,
        offset: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
      });

      return { status: 200, body: { bookings: bookingList, total: bookingList.length, page } };
    },

    get: async ({ params, request }) => {
      const jwt = await checkPermission(request, bookingsContract.get.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const booking = await db.query.bookings.findFirst({
        where: { id: { eq: params.id }, deletedAt: { isNull: true } },
        with: {
          user: { columns: { id: true, username: true, phone: true, email: true } },
          hotel: true,
          roomType: true,
          promotion: true,
        },
      });

      if (!booking) {
        return errorResponse(404, '预订不存在');
      }

      const bookingAny = booking as { userId: number; hotelId: number; role?: string; ownerId?: number };

      if (jwt.role === 'customer' && bookingAny.userId !== jwt.id) {
        return errorResponse(403, '无权限查看此预订');
      }

      if (jwt.role === 'merchant') {
        const hotel = await db.query.hotels.findFirst({
          where: { id: { eq: bookingAny.hotelId } },
        });

        if (hotel && (hotel as { ownerId: number }).ownerId !== jwt.id) {
          return errorResponse(403, '无权限查看此预订');
        }
      }

      return { status: 200, body: booking };
    },

    confirm: async ({ params, request }) => {
      const jwt = await checkPermission(request, bookingsContract.confirm.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const booking = await db.query.bookings.findFirst({
        where: { id: { eq: Number(params.id) } },
      });

      if (!booking) {
        return errorResponse(404, '预订不存在');
      }

      const bookingAny = booking as { hotelId: number; status: string; ownerId?: number };

      if (jwt.role === 'merchant') {
        const hotel = await db.query.hotels.findFirst({
          where: { id: { eq: bookingAny.hotelId } },
        });

        if (hotel && (hotel as { ownerId: number }).ownerId !== jwt.id) {
          return errorResponse(403, '无权限确认此预订');
        }
      }

      if (bookingAny.status !== 'pending') {
        return errorResponse(400, '只能确认待确认状态的预订');
      }

      const [updated] = await db
        .update(bookings)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(sql`${bookings.id} = ${Number(params.id)}`)
        .returning();

      if (!updated) {
        return errorResponse(500, '创建错误');
      }

      return { status: 200, body: updated };
    },

    cancel: async ({ params, request }) => {
      const jwt = await checkPermission(request, bookingsContract.cancel.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const booking = await db.query.bookings.findFirst({
        where: { id: { eq: Number(params.id) } },
      });

      if (!booking) {
        return errorResponse(404, '预订不存在');
      }

      const bookingAny = booking as {
        userId: number;
        hotelId: number;
        roomTypeId: number;
        status: string;
        ownerId?: number;
      };

      if (jwt.role === 'customer' && bookingAny.userId !== jwt.id) {
        return errorResponse(403, '无权限取消此预订');
      }

      if (jwt.role === 'merchant') {
        const hotel = await db.query.hotels.findFirst({
          where: { id: { eq: bookingAny.hotelId } },
        });

        if (hotel && (hotel as { ownerId: number }).ownerId !== jwt.id) {
          return errorResponse(403, '无权限取消此预订');
        }
      }

      if (bookingAny.status === 'cancelled') {
        return errorResponse(400, '预订已取消');
      }

      if (bookingAny.status === 'completed') {
        return errorResponse(400, '已完成的预订无法取消');
      }

      const result = await db.transaction(async (tx: DbTransaction) => {
        await tx
          .update(roomTypes)
          .set({
            stock: sql`${roomTypes.stock} + 1`,
            updatedAt: new Date(),
          })
          .where(sql`${roomTypes.id} = ${bookingAny.roomTypeId}`);

        const [updatedResult] = await tx
          .update(bookings)
          .set({
            status: 'cancelled',
            updatedAt: new Date(),
          })
          .where(sql`${bookings.id} = ${Number(params.id)}`)
          .returning();

        if (!updatedResult) {
          throw new Error('取消预订失败');
        }

        return updatedResult;
      });

      return { status: 200, body: result };
    },

    delete: async ({ params, request }) => {
      const jwt = await checkPermission(request, bookingsContract.delete.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      await db
        .update(bookings)
        .set({ deletedAt: new Date() })
        .where(sql`${bookings.id} = ${Number(params.id)}`);

      return { status: 200, body: { message: 'Deleted' as const } };
    },
  });
};
