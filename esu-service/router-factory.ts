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
  roleType,
  UserSchema,
  JwtSchema,
} from 'esu-types';

import {
  users,
  hotels,
  roomTypes,
  promotions,
  bookings,
  relations
} from './schema.js';

// =============================================================================
// 类型定义
// =============================================================================

/** 数据库实例类型 */
const fakeDb = drizzle({client:{} as any, relations});
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

  /** 权限检查 */
  const checkPermission = (
    jwt: unknown,
    permissions: (typeof roleType)[number][] | null,
  ) => {
    const parsed = v.parse(JwtSchema, jwt);
    if (!permissions) return parsed;
    if (!permissions.includes(parsed.role)) {
      throw new Error('无权限：您的角色无权访问此接口');
    }
    return parsed;
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
      case 'percentage': return originalPrice * value;
      case 'direct': return originalPrice - value;
      case 'spend_and_save': return originalPrice - value;
      default: return originalPrice;
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
      const [newUser] = await db.insert(users).values({
        ...body,
        password: hashedPassword,
      }).returning();

      if (!newUser) throw new Error('用户创建失败');
      return { status: 201, body: omitPassword(newUser) };
    },

    login: async ({ body, request }) => {
      const app = request.server;
      const user = await db.query.users.findFirst({
        where: { username: { eq: body.username } },
      });

      if (!user || !(await bcrypt.compare(body.password, user.password))) {
        throw new Error('用户名或密码错误');
      }
      if (user.deletedAt) throw new Error('该账号已被禁用');

      const token = app.jwt.sign({ id: user.id, role: user.role });
      return { status: 200, body: { token, user: omitPassword(user) } };
    },

    me: async ({ request }) => {
      const jwt = checkPermission(request.user, ['customer', 'merchant', 'admin']);
      const user = await db.query.users.findFirst({
        where: { id: { eq: jwt.id } },
      });

      if (!user) throw new Error('用户不存在');
      if (user.deletedAt) throw new Error('该账号已被禁用');

      return { status: 200, body: omitPassword(user) };
    },
  });

  // ==================== 酒店路由 ====================

  const hotelsRouter = s.router(hotelsContract, {
    create: async ({ body, request }) => {
      const jwt = checkPermission(request.user, ['merchant', 'admin']);

      if (jwt.role === 'merchant') body.ownerId = jwt.id;

      const owner = await db.query.users.findFirst({
        where: { id: { eq: body.ownerId } },
      });

      if (!owner || owner.role !== 'merchant') {
        throw new Error('无效的所有者');
      }

      const [newHotel] = await db.insert(hotels).values({
        ...body,
        status: 'pending',
      }).returning();

      if (!newHotel) throw new Error('酒店创建失败');
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

      if (!hotel) throw new Error('酒店不存在');

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
      const jwt = checkPermission(request.user, ['merchant', 'admin']);

      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: params.id } },
      });

      if (!hotel) throw new Error('酒店不存在');
      if (jwt.role === 'merchant' && hotel.ownerId !== jwt.id) {
        throw new Error('无权限修改此酒店');
      }

      const [updated] = await db.update(hotels)
        .set({ ...body, updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();

    if (!updated)
      throw new Error('更新错误')

      return { status: 200, body: updated };
    },

    approve: async ({ params, request }) => {
      checkPermission(request.user, ['admin']);

      const [updated] = await db.update(hotels)
        .set({ status: 'approved', updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();

      if (!updated) throw new Error('酒店不存在');
      return { status: 200, body: updated };
    },

    reject: async ({ params, body, request }) => {
      checkPermission(request.user, ['admin']);

      const [updated] = await db.update(hotels)
        .set({ status: 'rejected', statusDescription: body.rejectReason, updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();

      if (!updated) throw new Error('酒店不存在');
      return { status: 200, body: updated };
    },

    offline: async ({ params, request }) => {
      checkPermission(request.user, ['admin']);

      const [updated] = await db.update(hotels)
        .set({ status: 'offline', updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();

      if (!updated) throw new Error('酒店不存在');
      return { status: 200, body: updated };
    },

    online: async ({ params, request }) => {
      checkPermission(request.user, ['admin']);

      const [updated] = await db.update(hotels)
        .set({ status: 'approved', updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();

      if (!updated) throw new Error('酒店不存在');
      return { status: 200, body: updated };
    },

    adminList: async ({ query, request }) => {
      checkPermission(request.user, ['admin']);

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
      const jwt = checkPermission(request.user, ['merchant']);

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
      checkPermission(request.user, ['admin']);

      await db.update(hotels)
        .set({ deletedAt: new Date() })
        .where(sql`${hotels.id} = ${Number(params.id)}`);

      return { status: 200, body: { message: 'Deleted' } };
    },
  });

  // ==================== 房型路由 ====================

  const roomTypesRouter = s.router(roomTypesContract, {
    create: async ({ body, request }) => {
      checkPermission(request.user, ['merchant', 'admin']);

      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: body.hotelId }, deletedAt: { isNull: true } },
      });

      if (!hotel) throw new Error('酒店不存在');

      const [newRoomType] = await db.insert(roomTypes).values(body).returning();
    if (!newRoomType)
      throw new Error('创建错误')
      return { status: 201, body: newRoomType };
    },

    get: async ({ params }) => {
      const roomType = await db.query.roomTypes.findFirst({
        where: { id: { eq: params.id }, deletedAt: { isNull: true } },
        with: { hotel: { columns: { id: true, nameZh: true } } },
      });

      if (!roomType) throw new Error('房型不存在');
      return { status: 200, body: roomType };
    },

    update: async ({ params, body, request }) => {
      const jwt = checkPermission(request.user, ['merchant', 'admin']);

      const rt = await db.query.roomTypes.findFirst({ where: { id: { eq: params.id } } });
      if (!rt) throw new Error('房型不存在');

      const hotel = await db.query.hotels.findFirst({ where: { id: { eq: rt.hotelId } } });
      if (jwt.role === 'merchant' && hotel?.ownerId !== jwt.id) {
        throw new Error('无权限修改此房型');
      }

      const [updated] = await db.update(roomTypes)
        .set({ ...body, updatedAt: new Date() })
        .where(sql`${roomTypes.id} = ${params.id}`)
        .returning();

    if (!updated)
      throw new Error('更新错误')
      return { status: 200, body: updated };
    },

    delete: async ({ params, request }) => {
      const jwt = checkPermission(request.user, ['merchant', 'admin']);

      const rt = await db.query.roomTypes.findFirst({ where: { id: { eq: params.id } } });
      if (!rt) throw new Error('房型不存在');

      const hotel = await db.query.hotels.findFirst({ where: { id: { eq: rt.hotelId } } });
      if (jwt.role === 'merchant' && hotel?.ownerId !== jwt.id) {
        throw new Error('无权限删除此房型');
      }

      await db.update(roomTypes)
        .set({ deletedAt: new Date() })
        .where(sql`${roomTypes.id} = ${params.id}`);

      return { status: 200, body: { message: 'Deleted' } };
    },
  });

  // ==================== 优惠路由 ====================

  const promotionsRouter = s.router(promotionsContract, {
    create: async ({ body, request }) => {
      const jwt = checkPermission(request.user, ['merchant', 'admin']);

      const [newPromo] = await db.insert(promotions)
        .values({ ...body, ownerId: jwt.id })
        .returning();

    if (!newPromo)
      throw new Error('创建错误')
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
        with: { hotel: true, roomType: true, owner: { columns: { id: true, username: true } } },
      });

      if (!promo) throw new Error('优惠不存在');
      return { status: 200, body: promo };
    },

    update: async ({ params, body, request }) => {
      const jwt = checkPermission(request.user, ['merchant', 'admin']);

      const promo = await db.query.promotions.findFirst({ where: { id: { eq: params.id } } });
      if (!promo) throw new Error('优惠不存在');
      if (jwt.role === 'merchant' && promo.ownerId !== jwt.id) {
        throw new Error('无权限修改此优惠');
      }

      const [updated] = await db.update(promotions)
        .set({ ...body, updatedAt: new Date() })
        .where(sql`${promotions.id} = ${params.id}`)
        .returning();

    if (!updated)
      throw new Error('更新错误')
      return { status: 200, body: updated };
    },

    delete: async ({ params, request }) => {
      const jwt = checkPermission(request.user, ['merchant', 'admin']);

      const promo = await db.query.promotions.findFirst({ where: { id: { eq: params.id } } });
      if (!promo) throw new Error('优惠不存在');
      if (jwt.role === 'merchant' && promo.ownerId !== jwt.id) {
        throw new Error('无权限删除此优惠');
      }

      await db.update(promotions)
        .set({ deletedAt: new Date() })
        .where(sql`${promotions.id} = ${params.id}`);

      return { status: 200, body: { message: 'Deleted' } };
    },
  });

  // ==================== 预订路由 ====================

  const bookingsRouter = s.router(bookingsContract, {
    create: async ({ body, request }) => {
      const jwt = checkPermission(request.user, ['customer']);

      const rt = await db.query.roomTypes.findFirst({
        where: { id: { eq: body.roomTypeId }, deletedAt: { isNull: true } },
      });

      if (!rt) throw new Error('房型不存在');
      if (rt.stock <= 0) throw new Error('库存不足');

      const hotel = await db.query.hotels.findFirst({ where: { id: { eq: body.hotelId } } });
      if (!hotel || hotel.status !== 'approved') throw new Error('无效的酒店');

      const checkIn = new Date(body.checkIn);
      const checkOut = new Date(body.checkOut);
      const days = Math.ceil((checkOut.getTime() - checkIn.getTime()) / (1000 * 60 * 60 * 24));
      if (days <= 0) throw new Error('入住日期必须早于离店日期');

      let totalPrice = Number(rt.price) * days;

      let newBooking: any;
      await db.transaction(async (tx) => {
        await tx.update(roomTypes)
          .set({ stock: sql`${roomTypes.stock} - 1`, updatedAt: new Date() })
          .where(sql`${roomTypes.id} = ${body.roomTypeId}`);

        const [created] = await tx.insert(bookings).values({
          userId: jwt.id,
          hotelId: body.hotelId,
          roomTypeId: body.roomTypeId,
          checkIn: body.checkIn,
          checkOut: body.checkOut,
          totalPrice: totalPrice,
          status: 'pending',
        }).returning();

        newBooking = created;
      });

      return { status: 201, body: newBooking };
    },

    list: async ({ query, request }) => {
      const jwt = checkPermission(request.user, ['customer']);

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
      checkPermission(request.user, ['admin']);

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
      const jwt = checkPermission(request.user, ['merchant']);

      const page = query.page || 1;
      const limit = query.limit || 10;

      const merchantHotels = await db.query.hotels.findMany({
        where: { ownerId: { eq: jwt.id } },
        columns: { id: true },
      });

      const hotelIds = merchantHotels.map(h => h.id);
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
      const jwt = checkPermission(request.user, ['customer', 'merchant', 'admin']);

      const booking = await db.query.bookings.findFirst({
        where: { id: { eq: params.id }, deletedAt: { isNull: true } },
        with: {
          user: { columns: { id: true, username: true, phone: true, email: true } },
          hotel: true,
          roomType: true,
          promotion: true,
        },
      });

      if (!booking) throw new Error('预订不存在');

      if (jwt.role === 'customer' && booking.userId !== jwt.id) {
        throw new Error('无权限查看此预订');
      }

      if (jwt.role === 'merchant') {
        const hotel = await db.query.hotels.findFirst({ where: { id: { eq: booking.hotelId } } });
        if (hotel?.ownerId !== jwt.id) throw new Error('无权限查看此预订');
      }

      return { status: 200, body: booking };
    },

    confirm: async ({ params, request }) => {
      const jwt = checkPermission(request.user, ['merchant', 'admin']);

      const booking = await db.query.bookings.findFirst({ where: { id: { eq: Number(params.id) } } });
      if (!booking) throw new Error('预订不存在');

      if (jwt.role === 'merchant') {
        const hotel = await db.query.hotels.findFirst({ where: { id: { eq: booking.hotelId } } });
        if (hotel?.ownerId !== jwt.id) throw new Error('无权限确认此预订');
      }

      if (booking.status !== 'pending') throw new Error('只能确认待确认状态的预订');

      const [updated] = await db.update(bookings)
        .set({ status: 'confirmed', updatedAt: new Date() })
        .where(sql`${bookings.id} = ${Number(params.id)}`)
        .returning();

    if (!updated)
      throw new Error('创建错误')
      return { status: 200, body: updated };
    },

    cancel: async ({ params, request }) => {
      const jwt = checkPermission(request.user, ['customer', 'merchant', 'admin']);

      const booking = await db.query.bookings.findFirst({ where: { id: { eq: Number(params.id) } } });
      if (!booking) throw new Error('预订不存在');

      if (jwt.role === 'customer' && booking.userId !== jwt.id) {
        throw new Error('无权限取消此预订');
      }

      if (jwt.role === 'merchant') {
        const hotel = await db.query.hotels.findFirst({ where: { id: { eq: booking.hotelId } } });
        if (hotel?.ownerId !== jwt.id) throw new Error('无权限取消此预订');
      }

      if (booking.status === 'cancelled') throw new Error('预订已取消');
      if (booking.status === 'completed') throw new Error('已完成的预订无法取消');

      let updated: any;
      await db.transaction(async (tx) => {
        await tx.update(roomTypes)
          .set({ stock: sql`${roomTypes.stock} + 1`, updatedAt: new Date() })
          .where(sql`${roomTypes.id} = ${booking.roomTypeId}`);

        const [result] = await tx.update(bookings)
          .set({ status: 'cancelled', updatedAt: new Date() })
          .where(sql`${bookings.id} = ${Number(params.id)}`)
          .returning();

        updated = result;
      });

      return { status: 200, body: updated };
    },

    delete: async ({ params, request }) => {
      checkPermission(request.user, ['admin']);

      await db.update(bookings)
        .set({ deletedAt: new Date() })
        .where(sql`${bookings.id} = ${Number(params.id)}`);

      return { status: 200, body: { message: 'Deleted' } };
    },
  });

  // ==================== 汇总路由 ====================

  const router = s.router(contract, {
    users: usersRouter,
    hotels: hotelsRouter,
    roomTypes: roomTypesRouter,
    promotions: promotionsRouter,
    bookings: bookingsRouter,
  });

  return s.plugin(router);
};
