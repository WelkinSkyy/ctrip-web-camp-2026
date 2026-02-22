/**
 * 路由处理器工厂
 *
 * 接受数据库实例作为参数，返回路由处理器
 * 这种依赖注入模式便于测试和生产环境使用不同的数据库
 */

import { initServer } from '@ts-rest/fastify';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import bcrypt from 'bcryptjs';
import * as v from 'valibot';

import {
  contract,
  usersContract,
  hotelsContract,
  roomTypesContract,
  promotionsContract,
  bookingsContract,
  ratingsContract,
  carouselContract,
  roleType,
  UserSchema,
  JwtSchema,
} from 'esu-types';

import { users, hotels, roomTypes, promotions, bookings, ratings, relations } from './schema.js';
import type { FastifyRequest } from 'fastify';

// =============================================================================
// 类型定义
// =============================================================================

/** 数据库实例类型 */
const fakeDb = drizzle({ client: {} as any, relations });
type DbInstance = typeof fakeDb;

// =============================================================================
// 工厂函数
// =============================================================================

/**
 * 创建路由处理器
 *
 * @param db - Drizzle ORM 数据库实例
 * @returns ts-rest 路由插件
 */
export const createRouter = (db: DbInstance) => {
  const s = initServer();

  // ==================== 辅助函数 ====================

  /**
   * 创建错误响应
   * 由于契约中已定义 commonResponses (400, 401, 403, 404, 500)，
   * ts-rest 可以正确推断这些状态码的响应类型
   */
  const errorResponse = (status: 400 | 401 | 403 | 404 | 500, message: string) => ({
    status,
    body: { message } as const,
  });

  /** 权限检查 - 返回错误对象或用户信息 */
  const checkPermission = async (
    request: FastifyRequest,
    permissions: readonly (typeof roleType)[number][] | null | string[],
  ) => {
    if (permissions === null) return null;
    await request.jwtVerify();
    const parsed = v.parse(JwtSchema, request.user);
    // 类型断言：permissions 可能是 string[]，需要转换为角色数组
    const perms = permissions as readonly (typeof roleType)[number][];
    if (!perms.includes(parsed.role)) {
      return { error: true, status: 403, message: '无权限：您的角色无权访问此接口' } as const;
    }
    return { ...parsed, error: false } as const;
  };

  /** 移除密码字段 */
  const omitPassword = (user: v.InferInput<typeof UserSchema>) => {
    const { password, ...rest } = user;
    return rest;
  };

  /** 计算折扣价格 */
  const calculateDiscountedPrice = (
    originalPrice: number,
    promotion: { type: string; value: string | number },
  ): number => {
    const value = Number(promotion.value);
    switch (promotion.type) {
      case 'percentage':
        return originalPrice * value;
      case 'direct':
        return originalPrice - value;
      case 'spend_and_save':
        return originalPrice - value;
      default:
        return originalPrice;
    }
  };

  /** 获取有效优惠 */
  const getActivePromotions = async (hotelId: number, roomTypeId?: number) => {
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    return db.query.promotions.findMany({
      where: {
        startDate: { lte: today },
        endDate: { gte: today },
        deletedAt: { isNull: true },
        OR: [
          { hotelId: { eq: hotelId } },
          ...(roomTypeId ? [{ roomTypeId: { eq: roomTypeId } }] : []),
          { hotelId: { isNull: true } },
        ],
      },
    });
  };

  // ==================== 用户路由 ====================

  const usersRouter = s.router(usersContract, {
    register: async ({ body }) => {
      const hashedPassword = await bcrypt.hash(body.password, 10);
      const [newUser] = await db
        .insert(users)
        .values({
          ...body,
          password: hashedPassword,
        })
        .returning();
      if (!newUser) return errorResponse(500, '用户创建失败');
      return { status: 201, body: omitPassword(newUser) };
    },

    login: async ({ body, request }) => {
      const app = request.server;
      const user = await db.query.users.findFirst({
        where: { username: { eq: body.username } },
      });
      if (!user || !(await bcrypt.compare(body.password, user.password))) {
        return errorResponse(401, '用户名或密码错误');
      }
      if (user.deletedAt) return errorResponse(403, '该账号已被禁用');
      const token = app.jwt.sign({ id: user.id, role: user.role });
      return { status: 200, body: { token, user: omitPassword(user) } };
    },

    me: async ({ request }) => {
      const jwt = await checkPermission(request, usersContract.me.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const user = await db.query.users.findFirst({
        where: { id: { eq: jwt.id } },
      });
      if (!user) return errorResponse(404, '用户不存在');
      if (user.deletedAt) return errorResponse(403, '该账号已被禁用');
      return { status: 200, body: omitPassword(user) };
    },
  });

  // ==================== 酒店路由 ====================

  const hotelsRouter = s.router(hotelsContract, {
    create: async ({ body, request }) => {
      const jwt = await checkPermission(request, hotelsContract.create.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      if (jwt.role === 'merchant') body.ownerId = jwt.id;
      const owner = await db.query.users.findFirst({
        where: { id: { eq: body.ownerId } },
      });
      if (!owner || owner.role !== 'merchant') return errorResponse(400, '无效的所有者');
      const [newHotel] = await db
        .insert(hotels)
        .values({
          ...body,
          status: 'pending',
        })
        .returning();
      if (!newHotel) return errorResponse(500, '酒店创建失败');
      return { status: 201, body: newHotel };
    },

    list: async ({ query }) => {
      const page = query.page || 1;
      const limit = query.limit || 10;
      const offset = (page - 1) * limit;
      const whereCondition: any = {
        deletedAt: { isNull: true },
        status: { eq: 'approved' },
      };
      if (query.keyword) whereCondition.nameZh = { ilike: `%${query.keyword}%` };
      if (query.starRating) whereCondition.starRating = { eq: query.starRating };

      const hotelList = await db.query.hotels.findMany({
        where: whereCondition,
        with: {
          roomTypes: { where: { deletedAt: { isNull: true } } },
          promotions: { where: { deletedAt: { isNull: true } } },
        },
        limit,
        offset,
        orderBy: { createdAt: 'desc' },
      });

      for (const hotel of hotelList) {
        if (hotel.roomTypes?.length) {
          for (const rt of hotel.roomTypes) {
            const activePromos = await getActivePromotions(hotel.id, rt.id);
            let discountedPrice = Number(rt.price);
            for (const promo of activePromos) {
              discountedPrice = calculateDiscountedPrice(discountedPrice, promo);
            }
            (rt as any).discountedPrice = Math.max(0, discountedPrice);
          }
        }
      }

      const totalCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(hotels)
        .where(sql`${hotels.deletedAt} IS NULL AND ${hotels.status} = 'approved'`);
      return { status: 200, body: { hotels: hotelList, total: Number(totalCount[0]?.count) || 0, page } };
    },

    get: async ({ params }) => {
      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: params.id }, deletedAt: { isNull: true } },
        with: {
          roomTypes: { where: { deletedAt: { isNull: true } } },
          promotions: { where: { deletedAt: { isNull: true } } },
          owner: { columns: { id: true, username: true, role: true } },
        },
      });
      if (!hotel) return errorResponse(404, '酒店不存在');

      if (hotel.roomTypes?.length) {
        for (const rt of hotel.roomTypes) {
          const activePromos = await getActivePromotions(hotel.id, rt.id);
          let discountedPrice = Number(rt.price);
          for (const promo of activePromos) {
            discountedPrice = calculateDiscountedPrice(discountedPrice, promo);
          }
          (rt as any).discountedPrice = Math.max(0, discountedPrice);
        }
      }
      return { status: 200, body: hotel };
    },

    update: async ({ params, body, request }) => {
      const jwt = await checkPermission(request, hotelsContract.update.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const hotel = await db.query.hotels.findFirst({ where: { id: { eq: params.id } } });
      if (!hotel) return errorResponse(404, '酒店不存在');
      if (jwt.role === 'merchant' && hotel.ownerId !== jwt.id) return errorResponse(403, '无权限修改此酒店');
      const [updated] = await db
        .update(hotels)
        .set({ ...body, updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();
      if (!updated) return errorResponse(500, '更新错误');
      return { status: 200, body: updated };
    },

    approve: async ({ params, request }) => {
      const jwt = await checkPermission(request, hotelsContract.approve.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const [updated] = await db
        .update(hotels)
        .set({ status: 'approved', updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();
      if (!updated) return errorResponse(404, '酒店不存在');
      return { status: 200, body: updated };
    },

    reject: async ({ params, body, request }) => {
      const jwt = await checkPermission(request, hotelsContract.reject.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const [updated] = await db
        .update(hotels)
        .set({
          status: 'rejected',
          statusDescription: body.rejectReason,
          updatedAt: new Date(),
        })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();
      if (!updated) return errorResponse(404, '酒店不存在');
      return { status: 200, body: updated };
    },

    offline: async ({ params, request }) => {
      const jwt = await checkPermission(request, hotelsContract.offline.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const [updated] = await db
        .update(hotels)
        .set({ status: 'offline', updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();
      if (!updated) return errorResponse(404, '酒店不存在');
      return { status: 200, body: updated };
    },

    online: async ({ params, request }) => {
      const jwt = await checkPermission(request, hotelsContract.online.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const [updated] = await db
        .update(hotels)
        .set({ status: 'approved', updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();
      if (!updated) return errorResponse(404, '酒店不存在');
      return { status: 200, body: updated };
    },

    adminList: async ({ query, request }) => {
      const jwt = await checkPermission(request, hotelsContract.adminList.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const page = query.page || 1;
      const limit = query.limit || 10;
      const whereCondition: any = { deletedAt: { isNull: true } };
      if (query.status) whereCondition.status = { eq: query.status };
      const hotelList = await db.query.hotels.findMany({
        where: whereCondition,
        with: { owner: { columns: { id: true, username: true } } },
        limit,
        offset: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
      });
      return { status: 200, body: { hotels: hotelList, total: hotelList.length, page } };
    },

    merchantList: async ({ query, request }) => {
      const jwt = await checkPermission(request, hotelsContract.merchantList.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const page = query.page || 1;
      const limit = query.limit || 10;
      const hotelList = await db.query.hotels.findMany({
        where: { ownerId: { eq: jwt.id }, deletedAt: { isNull: true } },
        limit,
        offset: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
      });
      return { status: 200, body: { hotels: hotelList, total: hotelList.length, page } };
    },

    delete: async ({ params, request }) => {
      const jwt = await checkPermission(request, hotelsContract.delete.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      await db
        .update(hotels)
        .set({ deletedAt: new Date() })
        .where(sql`${hotels.id} = ${Number(params.id)}`);
      return { status: 200, body: { message: 'Deleted' as const } };
    },
  });

  // ==================== 房型路由 ====================

  const roomTypesRouter = s.router(roomTypesContract, {
    create: async ({ body, request }) => {
      const jwt = await checkPermission(request, roomTypesContract.create.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: body.hotelId }, deletedAt: { isNull: true } },
      });
      if (!hotel) return errorResponse(404, '酒店不存在');
      const [newRoomType] = await db.insert(roomTypes).values(body).returning();
      if (!newRoomType) return errorResponse(500, '创建错误');
      return { status: 201, body: newRoomType };
    },

    get: async ({ params }) => {
      const roomType = await db.query.roomTypes.findFirst({
        where: { id: { eq: params.id }, deletedAt: { isNull: true } },
        with: { hotel: { columns: { id: true, nameZh: true } } },
      });
      if (!roomType) return errorResponse(404, '房型不存在');
      return { status: 200, body: roomType };
    },

    update: async ({ params, body, request }) => {
      const jwt = await checkPermission(request, roomTypesContract.update.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const rt = await db.query.roomTypes.findFirst({ where: { id: { eq: params.id } } });
      if (!rt) return errorResponse(404, '房型不存在');
      const hotel = await db.query.hotels.findFirst({ where: { id: { eq: rt.hotelId } } });
      if (jwt.role === 'merchant' && hotel?.ownerId !== jwt.id) return errorResponse(403, '无权限修改此房型');
      const [updated] = await db
        .update(roomTypes)
        .set({ ...body, updatedAt: new Date() })
        .where(sql`${roomTypes.id} = ${params.id}`)
        .returning();
      if (!updated) return errorResponse(500, '更新错误');
      return { status: 200, body: updated };
    },

    delete: async ({ params, request }) => {
      const jwt = await checkPermission(request, roomTypesContract.delete.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const rt = await db.query.roomTypes.findFirst({ where: { id: { eq: params.id } } });
      if (!rt) return errorResponse(404, '房型不存在');
      const hotel = await db.query.hotels.findFirst({ where: { id: { eq: rt.hotelId } } });
      if (jwt.role === 'merchant' && hotel?.ownerId !== jwt.id) return errorResponse(403, '无权限删除此房型');
      await db
        .update(roomTypes)
        .set({ deletedAt: new Date() })
        .where(sql`${roomTypes.id} = ${params.id}`);
      return { status: 200, body: { message: 'Deleted' as const } };
    },
  });

  // ==================== 优惠路由 ====================

  const promotionsRouter = s.router(promotionsContract, {
    create: async ({ body, request }) => {
      const jwt = await checkPermission(request, promotionsContract.create.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const [newPromo] = await db
        .insert(promotions)
        .values({ ...body, ownerId: jwt.id })
        .returning();
      if (!newPromo) return errorResponse(500, '创建错误');
      return { status: 201, body: newPromo };
    },

    list: async ({ query }) => {
      const whereCondition: any = { deletedAt: { isNull: true } };
      if (query.hotelId) whereCondition.hotelId = { eq: Number(query.hotelId) };
      if (query.roomTypeId) whereCondition.roomTypeId = { eq: Number(query.roomTypeId) };
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
      if (!promo) return errorResponse(404, '优惠不存在');
      return { status: 200, body: promo };
    },

    update: async ({ params, body, request }) => {
      const jwt = await checkPermission(request, promotionsContract.update.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const promo = await db.query.promotions.findFirst({ where: { id: { eq: params.id } } });
      if (!promo) return errorResponse(404, '优惠不存在');
      if (jwt.role === 'merchant' && promo.ownerId !== jwt.id) return errorResponse(403, '无权限修改此优惠');
      const [updated] = await db
        .update(promotions)
        .set({ ...body, updatedAt: new Date() })
        .where(sql`${promotions.id} = ${params.id}`)
        .returning();
      if (!updated) return errorResponse(500, '更新错误');
      return { status: 200, body: updated };
    },

    delete: async ({ params, request }) => {
      const jwt = await checkPermission(request, promotionsContract.delete.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const promo = await db.query.promotions.findFirst({ where: { id: { eq: params.id } } });
      if (!promo) return errorResponse(404, '优惠不存在');
      if (jwt.role === 'merchant' && promo.ownerId !== jwt.id) return errorResponse(403, '无权限删除此优惠');
      await db
        .update(promotions)
        .set({ deletedAt: new Date() })
        .where(sql`${promotions.id} = ${params.id}`);
      return { status: 200, body: { message: 'Deleted' as const } };
    },
  });

  // ==================== 预订路由 ====================

  const bookingsRouter = s.router(bookingsContract, {
    create: async ({ body, request }) => {
      const jwt = await checkPermission(request, bookingsContract.create.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const rt = await db.query.roomTypes.findFirst({
        where: { id: { eq: body.roomTypeId }, deletedAt: { isNull: true } },
      });
      if (!rt) return errorResponse(404, '房型不存在');
      if (rt.stock <= 0) return errorResponse(400, '库存不足');
      const hotel = await db.query.hotels.findFirst({ where: { id: { eq: body.hotelId } } });
      if (!hotel || hotel.status !== 'approved') return errorResponse(400, '无效的酒店');
      const checkIn = new Date(body.checkIn);
      const checkOut = new Date(body.checkOut);
      const days = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      if (days <= 0) return errorResponse(400, '入住日期必须早于离店日期');
      const totalPrice = Number(rt.price) * days;

      let newBooking: any;
      await db.transaction(async (tx) => {
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
        newBooking = created;
      });
      return { status: 201, body: newBooking };
    },

    list: async ({ query, request }) => {
      const jwt = await checkPermission(request, bookingsContract.list.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const page = query.page || 1;
      const limit = query.limit || 10;
      const whereCondition: any = { userId: { eq: jwt.id }, deletedAt: { isNull: true } };
      if (query.status) whereCondition.status = { eq: query.status };
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
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const page = query.page || 1;
      const limit = query.limit || 10;
      const whereCondition: any = { deletedAt: { isNull: true } };
      if (query.hotelId) whereCondition.hotelId = { eq: Number(query.hotelId) };
      if (query.status) whereCondition.status = { eq: query.status };
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
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const page = query.page || 1;
      const limit = query.limit || 10;
      const merchantHotels = await db.query.hotels.findMany({
        where: { ownerId: { eq: jwt.id } },
        columns: { id: true },
      });
      const hotelIds = merchantHotels.map((h) => h.id);
      if (!hotelIds.length) return { status: 200, body: { bookings: [], total: 0, page } };
      const whereCondition: any = { hotelId: { in: hotelIds }, deletedAt: { isNull: true } };
      if (query.hotelId) whereCondition.hotelId = { eq: Number(query.hotelId) };
      if (query.status) whereCondition.status = { eq: query.status };
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
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const booking = await db.query.bookings.findFirst({
        where: { id: { eq: params.id }, deletedAt: { isNull: true } },
        with: {
          user: { columns: { id: true, username: true, phone: true, email: true } },
          hotel: true,
          roomType: true,
          promotion: true,
        },
      });
      if (!booking) return errorResponse(404, '预订不存在');
      if (jwt.role === 'customer' && booking.userId !== jwt.id) return errorResponse(403, '无权限查看此预订');
      if (jwt.role === 'merchant') {
        const hotel = await db.query.hotels.findFirst({ where: { id: { eq: booking.hotelId } } });
        if (hotel?.ownerId !== jwt.id) return errorResponse(403, '无权限查看此预订');
      }
      return { status: 200, body: booking };
    },

    confirm: async ({ params, request }) => {
      const jwt = await checkPermission(request, bookingsContract.confirm.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const booking = await db.query.bookings.findFirst({ where: { id: { eq: Number(params.id) } } });
      if (!booking) return errorResponse(404, '预订不存在');
      if (jwt.role === 'merchant') {
        const hotel = await db.query.hotels.findFirst({ where: { id: { eq: booking.hotelId } } });
        if (hotel?.ownerId !== jwt.id) return errorResponse(403, '无权限确认此预订');
      }
      if (booking.status !== 'pending') return errorResponse(400, '只能确认待确认状态的预订');
      const [updated] = await db
        .update(bookings)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(sql`${bookings.id} = ${Number(params.id)}`)
        .returning();
      if (!updated) return errorResponse(500, '创建错误');
      return { status: 200, body: updated };
    },

    cancel: async ({ params, request }) => {
      const jwt = await checkPermission(request, bookingsContract.cancel.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      const booking = await db.query.bookings.findFirst({ where: { id: { eq: Number(params.id) } } });
      if (!booking) return errorResponse(404, '预订不存在');
      if (jwt.role === 'customer' && booking.userId !== jwt.id) return errorResponse(403, '无权限取消此预订');
      if (jwt.role === 'merchant') {
        const hotel = await db.query.hotels.findFirst({ where: { id: { eq: booking.hotelId } } });
        if (hotel?.ownerId !== jwt.id) return errorResponse(403, '无权限取消此预订');
      }
      if (booking.status === 'cancelled') return errorResponse(400, '预订已取消');
      if (booking.status === 'completed') return errorResponse(400, '已完成的预订无法取消');

      let updated: any;
      await db.transaction(async (tx) => {
        await tx
          .update(roomTypes)
          .set({
            stock: sql`${roomTypes.stock} + 1`,
            updatedAt: new Date(),
          })
          .where(sql`${roomTypes.id} = ${booking.roomTypeId}`);
        const [result] = await tx
          .update(bookings)
          .set({
            status: 'cancelled',
            updatedAt: new Date(),
          })
          .where(sql`${bookings.id} = ${Number(params.id)}`)
          .returning();
        updated = result;
      });
      return { status: 200, body: updated };
    },

    delete: async ({ params, request }) => {
      const jwt = await checkPermission(request, bookingsContract.delete.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);
      await db
        .update(bookings)
        .set({ deletedAt: new Date() })
        .where(sql`${bookings.id} = ${Number(params.id)}`);
      return { status: 200, body: { message: 'Deleted' as const } };
    },
  });

  // ==================== 评分路由 ====================

  const ratingsRouter = s.router(ratingsContract, {
    create: async ({ body, request }) => {
      const jwt = await checkPermission(request, ratingsContract.create.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);

      // 检查酒店是否存在
      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: body.hotelId }, deletedAt: { isNull: true } },
      });
      if (!hotel) return errorResponse(404, '酒店不存在');

      // 检查是否已评分
      const existingRating = await db.query.ratings.findFirst({
        where: { userId: { eq: jwt.id }, hotelId: { eq: body.hotelId } },
      });
      if (existingRating) return errorResponse(400, '您已评价过此酒店');

      // 创建评分并更新酒店平均评分
      let newRating: any;
      await db.transaction(async (tx) => {
        const [created] = await tx
          .insert(ratings)
          .values({
            userId: jwt.id,
            hotelId: body.hotelId,
            score: body.score,
            comment: body.comment ?? null,
          })
          .returning();
        newRating = created;

        // 更新酒店平均评分
        const allRatings = await tx.query.ratings.findMany({
          where: { hotelId: { eq: body.hotelId } },
        });
        const totalScore = allRatings.reduce((sum, r) => sum + r.score, 0);
        const avgRating = allRatings.length > 0 ? totalScore / allRatings.length : 0;

        await tx
          .update(hotels)
          .set({
            averageRating: Math.round(avgRating * 100) / 100,
            ratingCount: allRatings.length,
            updatedAt: new Date(),
          })
          .where(sql`${hotels.id} = ${body.hotelId}`);
      });

      return { status: 201, body: newRating };
    },

    list: async ({ query }) => {
      const page = query.page || 1;
      const limit = query.limit || 10;
      const whereCondition: any = { deletedAt: { isNull: true } };
      if (query.hotelId) whereCondition.hotelId = { eq: query.hotelId };

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
      if (!rating) return errorResponse(404, '评分不存在');
      return { status: 200, body: rating };
    },

    update: async ({ params, body, request }) => {
      const jwt = await checkPermission(request, ratingsContract.update.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);

      const rating = await db.query.ratings.findFirst({ where: { id: { eq: params.id } } });
      if (!rating) return errorResponse(404, '评分不存在');
      if (rating.userId !== jwt.id && jwt.role !== 'admin') {
        return errorResponse(403, '无权限修改此评分');
      }

      let updated: any;
      await db.transaction(async (tx) => {
        const [result] = await tx
          .update(ratings)
          .set({
            ...body,
            updatedAt: new Date(),
          })
          .where(sql`${ratings.id} = ${params.id}`)
          .returning();
        updated = result;

        // 如果修改了分数，更新酒店平均评分
        if (body.score !== undefined) {
          const allRatings = await tx.query.ratings.findMany({
            where: { hotelId: { eq: rating.hotelId } },
          });
          const totalScore = allRatings.reduce((sum, r) => sum + r.score, 0);
          const avgRating = allRatings.length > 0 ? totalScore / allRatings.length : 0;

          await tx
            .update(hotels)
            .set({
              averageRating: Math.round(avgRating * 100) / 100,
              updatedAt: new Date(),
            })
            .where(sql`${hotels.id} = ${rating.hotelId}`);
        }
      });

      return { status: 200, body: updated };
    },

    delete: async ({ params, request }) => {
      const jwt = await checkPermission(request, ratingsContract.delete.metadata.permission);
      if (jwt === null) return errorResponse(500, '内部权限错误');
      if ('error' in jwt && jwt.error) return errorResponse(jwt.status, jwt.message);

      const rating = await db.query.ratings.findFirst({ where: { id: { eq: params.id } } });
      if (!rating) return errorResponse(404, '评分不存在');
      if (rating.userId !== jwt.id && jwt.role !== 'admin') {
        return errorResponse(403, '无权限删除此评分');
      }

      await db.transaction(async (tx) => {
        await tx
          .update(ratings)
          .set({ deletedAt: new Date() })
          .where(sql`${ratings.id} = ${params.id}`);

        // 更新酒店平均评分
        const allRatings = await tx.query.ratings.findMany({
          where: { hotelId: { eq: rating.hotelId }, deletedAt: { isNull: true } },
        });
        const totalScore = allRatings.reduce((sum, r) => sum + r.score, 0);
        const avgRating = allRatings.length > 0 ? totalScore / allRatings.length : 0;

        await tx
          .update(hotels)
          .set({
            averageRating: allRatings.length > 0 ? Math.round(avgRating * 100) / 100 : null,
            ratingCount: allRatings.length,
            updatedAt: new Date(),
          })
          .where(sql`${hotels.id} = ${rating.hotelId}`);
      });

      return { status: 200, body: { message: 'Deleted' as const } };
    },
  });

  // ==================== 轮播图路由 ====================

  const carouselRouter = s.router(carouselContract, {
    list: async ({ query }) => {
      const limit = query.limit || 10;

      // 获取有图片且已审核通过的酒店
      const hotelList = await db.query.hotels.findMany({
        where: {
          deletedAt: { isNull: true },
          status: { eq: 'approved' },
          images: { isNotNull: true },
        },
        columns: { id: true, images: true },
        limit,
        orderBy: { createdAt: 'desc' },
      });

      // 转换为轮播图格式：每个酒店取第一张图片
      const carouselItems = hotelList
        .filter((h) => h.images && h.images.length > 0 && h.images[0])
        .map((h) => ({
          hotelId: h.id,
          image: h.images![0]!,
        }));

      return { status: 200, body: carouselItems };
    },
  });

  // ==================== 汇总路由 ====================

  const router = s.router(contract, {
    users: usersRouter,
    hotels: hotelsRouter,
    roomTypes: roomTypesRouter,
    promotions: promotionsRouter,
    bookings: bookingsRouter,
    ratings: ratingsRouter,
    carousel: carouselRouter,
  });

  return s.plugin(router);
};
