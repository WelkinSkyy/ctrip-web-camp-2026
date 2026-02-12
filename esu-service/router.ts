import { initServer } from '@ts-rest/fastify';
import {
  eq,
  and,
  or,
  ilike,
  gte,
  lte,
  sql,
  isNull,
} from 'drizzle-orm';
import { Pool } from 'pg';
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
} from 'esu-types'; // 导入表定义和枚举
import {
  users,
  hotels,
  roomTypes,
  promotions,
} from './schema.js';

// 假设使用环境变量 DATABASE_URL 来连接 PostgreSQL
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});
const db = drizzle({ client: pool });

// 权限检查辅助函数（这里假设用户只有一个角色，如需数组角色可调整）
const checkPermission = (
  jwt: any,
  permissions: (typeof roleType)[number][] | null,
) => {
  const parsed = v.parse(JwtSchema, jwt);
  if (!permissions) return parsed;
  if (!permissions.includes(jwt.role)) {
    throw new Error('无权限');
  }
  return parsed;
};

// 去除敏感字段（密码）
const omitPassword = (
  user: v.InferInput<typeof UserSchema>,
) => {
  const { password, ...rest } = user;
  return rest;
};

const s = initServer();

const usersRouter = s.router(usersContract, {
  register: async ({ body, request }) => {
    // body 已由 ts-rest + valibot 自动验证
    const hashedPassword = await bcrypt.hash(
      body.password,
      10,
    );
    const [newUser] = await db
      .insert(users)
      .values({
        ...body,
        password: hashedPassword,
      })
      .returning();
    if (typeof newUser === 'undefined')
      throw Error('插入Users失败');
    return { status: 201, body: omitPassword(newUser) };
  },
  login: async ({ body, request }) => {
    const app = request.server;
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.username, body.username));
    if (
      !user ||
      !(await bcrypt.compare(body.password, user.password))
    ) {
      throw new Error('用户名或密码错误');
    }
    const token = app.jwt.sign({
      id: user.id,
      role: user.role,
    });
    return {
      status: 200,
      body: { token, user: omitPassword(user) },
    };
  },
  me: async ({ request }) => {
    const jwt = checkPermission(request.user, [
      'customer',
      'merchant',
      'admin',
    ]);
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.id, jwt.id));
    if (!user) throw new Error('用户不存在');
    return { status: 200, body: omitPassword(user) };
  },
});

const hotelsRouter = s.router(hotelsContract, {
  create: async ({ body, request }) => {
    const jwt = checkPermission(request.user, [
      'merchant',
      'admin',
    ]);
    // 如果是商户角色，自动设置 ownerId 为当前用户
    if (jwt.role === 'merchant') {
      body.ownerId = jwt.id;
    }
    // 验证 owner 是否为商户角色
    const [owner] = await db
      .select()
      .from(users)
      .where(eq(users.id, body.ownerId));
    if (!owner || owner.role !== 'merchant')
      throw new Error('无效的所有者');
    body.status = 'pending';
    const [newHotel] = await db
      .insert(hotels)
      .values(body)
      .returning();
    return { status: 201, body: newHotel };
  },
  list: async ({ query }) => {
    // 公开接口，无需权限
    let q = db
      .select()
      .from(hotels)
      .where(
        and(
          isNull(hotels.deletedAt),
          eq(hotels.status, 'approved'),
        ),
      );
    if (query.keyword)
      q = q.where(
        ilike(hotels.nameZh, `%${query.keyword}%`),
      );
    if (query.starRating)
      q = q.where(eq(hotels.starRating, query.starRating));
    if (query.priceMin)
      q = q
        .innerJoin(
          roomTypes,
          eq(roomTypes.hotelId, hotels.id),
        )
        .where(gte(roomTypes.price, query.priceMin));
    if (query.priceMax)
      q = q
        .innerJoin(
          roomTypes,
          eq(roomTypes.hotelId, hotels.id),
        )
        .where(lte(roomTypes.price, query.priceMax));
    // 可继续添加其他筛选条件（如 facilities 等）

    const totalQuery = await db
      .select({ count: sql<number>`count(*) over()` })
      .from(q.as('subq'))
      .limit(1);
    const total = totalQuery[0]?.count || 0;

    const hotelList = await q
      .limit(query.limit || 10)
      .offset(
        ((query.page || 1) - 1) * (query.limit || 10),
      );

    // 为每个酒店填充房型和优惠，并计算实时折扣价
    for (const hotel of hotelList) {
      hotel.roomTypes = await db
        .select()
        .from(roomTypes)
        .where(eq(roomTypes.hotelId, hotel.id));
      hotel.promotions = await db
        .select()
        .from(promotions)
        .where(
          or(
            eq(promotions.hotelId, hotel.id),
            isNull(promotions.hotelId),
          ),
        );

      for (const rt of hotel.roomTypes || []) {
        // 查找当前有效的优惠
        const activePromos = await db
          .select()
          .from(promotions)
          .where(
            and(
              or(
                eq(promotions.hotelId, hotel.id),
                eq(promotions.roomTypeId, rt.id),
              ),
              lte(promotions.startDate, new Date()),
              gte(promotions.endDate, new Date()),
            ),
          );
        let discounted = Number(rt.price);
        for (const promo of activePromos) {
          if (promo.type === 'percentage')
            discounted *= Number(promo.value);
          else if (promo.type === 'direct')
            discounted -= Number(promo.value);
          // 如有 'spend_and_save' 类型，可在此补充逻辑
        }
        rt.discountedPrice = discounted;
      }
      // 按折扣后价格从低到高排序房型
      hotel.roomTypes?.sort(
        (a, b) =>
          (a.discountedPrice || Number(a.price)) -
          (b.discountedPrice || Number(b.price)),
      );
    }

    return {
      status: 200,
      body: {
        hotels: hotelList,
        total,
        page: query.page || 1,
      },
    };
  },
  get: async ({ params }) => {
    const [hotel] = await db
      .select()
      .from(hotels)
      .where(
        and(
          eq(hotels.id, params.id),
          isNull(hotels.deletedAt),
        ),
      );
    if (!hotel) throw new Error('酒店不存在');

    // 填充房型和优惠，计算折扣价
    hotel.roomTypes = await db
      .select()
      .from(roomTypes)
      .where(eq(roomTypes.hotelId, hotel.id));
    hotel.promotions = await db
      .select()
      .from(promotions)
      .where(
        or(
          eq(promotions.hotelId, hotel.id),
          isNull(promotions.hotelId),
        ),
      );

    for (const rt of hotel.roomTypes || []) {
      const activePromos = await db
        .select()
        .from(promotions)
        .where(
          and(
            or(
              eq(promotions.hotelId, hotel.id),
              eq(promotions.roomTypeId, rt.id),
            ),
            lte(promotions.startDate, new Date()),
            gte(promotions.endDate, new Date()),
          ),
        );
      let discounted = Number(rt.price);
      for (const promo of activePromos) {
        if (promo.type === 'percentage')
          discounted *= Number(promo.value);
        else if (promo.type === 'direct')
          discounted -= Number(promo.value);
      }
      rt.discountedPrice = discounted;
    }
    hotel.roomTypes?.sort(
      (a, b) =>
        (a.discountedPrice || Number(a.price)) -
        (b.discountedPrice || Number(b.price)),
    );

    return { status: 200, body: hotel };
  },
  update: async ({ params, body, request }) => {
    checkPermission(request.user, ['merchant', 'admin']);
    const [hotel] = await db
      .select()
      .from(hotels)
      .where(eq(hotels.id, params.id));
    if (!hotel) throw new Error('酒店不存在');

    if (
      request.user.role === 'merchant' &&
      hotel.ownerId !== request.user.id
    ) {
      throw new Error('非本酒店所有者');
    }
    if (
      request.user.role === 'merchant' &&
      !['pending', 'rejected'].includes(hotel.status)
    ) {
      throw new Error('已审核通过的酒店商户不可编辑');
    }

    const [updated] = await db
      .update(hotels)
      .set(body)
      .where(eq(hotels.id, params.id))
      .returning();
    return { status: 200, body: updated };
  },
  approve: async ({ params, request }) => {
    checkPermission(request.user, ['admin']);
    const [updated] = await db
      .update(hotels)
      .set({ status: 'approved', statusDescription: null })
      .where(eq(hotels.id, params.id))
      .returning();
    if (!updated) throw new Error('酒店不存在');
    return { status: 200, body: updated };
  },
  reject: async ({ params, body, request }) => {
    checkPermission(request.user, ['admin']);
    const [updated] = await db
      .update(hotels)
      .set({
        status: 'rejected',
        statusDescription: body.rejectReason,
      })
      .where(eq(hotels.id, params.id))
      .returning();
    if (!updated) throw new Error('酒店不存在');
    return { status: 200, body: updated };
  },
  offline: async ({ params, request }) => {
    checkPermission(request.user, ['admin']);
    const [updated] = await db
      .update(hotels)
      .set({ status: 'offline' })
      .where(eq(hotels.id, params.id))
      .returning();
    if (!updated) throw new Error('酒店不存在');
    return { status: 200, body: updated };
  },
  online: async ({ params, request }) => {
    checkPermission(request.user, ['admin']);
    const [updated] = await db
      .update(hotels)
      .set({ status: 'approved' })
      .where(eq(hotels.id, params.id))
      .returning();
    if (!updated) throw new Error('酒店不存在');
    return { status: 200, body: updated };
  },
  adminList: async ({ query, request }) => {
    checkPermission(request.user, ['admin']);
    let q = db
      .select()
      .from(hotels)
      .where(isNull(hotels.deletedAt));
    if (query.status)
      q = q.where(eq(hotels.status, query.status));

    const totalQuery = await db
      .select({ count: sql<number>`count(*) over()` })
      .from(q.as('subq'))
      .limit(1);
    const total = totalQuery[0]?.count || 0;

    const hotelList = await q
      .limit(query.limit || 10)
      .offset(
        ((query.page || 1) - 1) * (query.limit || 10),
      );
    return {
      status: 200,
      body: {
        hotels: hotelList,
        total,
        page: query.page || 1,
      },
    };
  },
  merchantList: async ({ query, request }) => {
    checkPermission(request.user, ['merchant']);
    let q = db
      .select()
      .from(hotels)
      .where(
        and(
          eq(hotels.ownerId, request.user.id),
          isNull(hotels.deletedAt),
        ),
      );

    const totalQuery = await db
      .select({ count: sql<number>`count(*) over()` })
      .from(q.as('subq'))
      .limit(1);
    const total = totalQuery[0]?.count || 0;

    const hotelList = await q
      .limit(query.limit || 10)
      .offset(
        ((query.page || 1) - 1) * (query.limit || 10),
      );
    return {
      status: 200,
      body: {
        hotels: hotelList,
        total,
        page: query.page || 1,
      },
    };
  },
  delete: async ({ params, request }) => {
    checkPermission(request.user, ['admin']);
    await db
      .update(hotels)
      .set({ deletedAt: new Date() })
      .where(eq(hotels.id, params.id));
    return { status: 200, body: { message: '已删除' } };
  },
});

const roomTypesRouter = s.router(roomTypesContract, {
  create: async ({ body, request }) => {
    checkPermission(request.user, ['merchant', 'admin']);
    // 如果是商户角色，验证酒店所有权
    const [hotel] = await db
      .select()
      .from(hotels)
      .where(eq(hotels.id, body.hotelId));
    if (!hotel) throw new Error('酒店不存在');
    if (
      request.user.role === 'merchant' &&
      hotel.ownerId !== request.user.id
    )
      throw new Error('非本酒店所有者');
    const [newRoomType] = await db
      .insert(roomTypes)
      .values(body)
      .returning();
    return { status: 201, body: newRoomType };
  },
  get: async ({ params }) => {
    const [roomType] = await db
      .select()
      .from(roomTypes)
      .where(eq(roomTypes.id, params.id));
    if (!roomType) throw new Error('房型不存在');
    return { status: 200, body: roomType };
  },
  update: async ({ params, body, request }) => {
    checkPermission(request.user, ['merchant', 'admin']);
    const [rt] = await db
      .select()
      .from(roomTypes)
      .where(eq(roomTypes.id, params.id));
    if (!rt) throw new Error('房型不存在');
    const [hotel] = await db
      .select()
      .from(hotels)
      .where(eq(hotels.id, rt.hotelId));
    if (
      request.user.role === 'merchant' &&
      hotel.ownerId !== request.user.id
    )
      throw new Error('非本酒店所有者');
    const [updated] = await db
      .update(roomTypes)
      .set(body)
      .where(eq(roomTypes.id, params.id))
      .returning();
    return { status: 200, body: updated };
  },
  delete: async ({ params, request }) => {
    checkPermission(request.user, ['merchant', 'admin']);
    const [rt] = await db
      .select()
      .from(roomTypes)
      .where(eq(roomTypes.id, params.id));
    if (!rt) throw new Error('房型不存在');
    const [hotel] = await db
      .select()
      .from(hotels)
      .where(eq(hotels.id, rt.hotelId));
    if (
      request.user.role === 'merchant' &&
      hotel.ownerId !== request.user.id
    )
      throw new Error('非本酒店所有者');
    await db
      .update(roomTypes)
      .set({ deletedAt: new Date() })
      .where(eq(roomTypes.id, params.id));
    return { status: 200, body: { message: '已删除' } };
  },
});

const promotionsRouter = s.router(promotionsContract, {
  create: async ({ body, request }) => {
    checkPermission(request.user, ['merchant', 'admin']);
    body.ownerId = request.user.id;
    // 验证关联的酒店或房型所有权（如果是商户角色）
    if (body.hotelId) {
      const [hotel] = await db
        .select()
        .from(hotels)
        .where(eq(hotels.id, body.hotelId));
      if (
        request.user.role === 'merchant' &&
        hotel.ownerId !== request.user.id
      )
        throw new Error('非本酒店所有者');
    }
    if (body.roomTypeId) {
      const [rt] = await db
        .select()
        .from(roomTypes)
        .where(eq(roomTypes.id, body.roomTypeId));
      const [hotel] = await db
        .select()
        .from(hotels)
        .where(eq(hotels.id, rt.hotelId));
      if (
        request.user.role === 'merchant' &&
        hotel.ownerId !== request.user.id
      )
        throw new Error('非本酒店所有者');
    }
    const [newPromo] = await db
      .insert(promotions)
      .values(body)
      .returning();
    return { status: 201, body: newPromo };
  },
  list: async ({ query }) => {
    let q = db
      .select()
      .from(promotions)
      .where(isNull(promotions.deletedAt));
    if (query.hotelId)
      q = q.where(eq(promotions.hotelId, query.hotelId));
    if (query.roomTypeId)
      q = q.where(
        eq(promotions.roomTypeId, query.roomTypeId),
      );
    const promoList = await q;
    return { status: 200, body: promoList };
  },
  get: async ({ params }) => {
    const [promo] = await db
      .select()
      .from(promotions)
      .where(eq(promotions.id, params.id));
    if (!promo) throw new Error('优惠不存在');
    return { status: 200, body: promo };
  },
  update: async ({ params, body, request }) => {
    checkPermission(request.user, ['merchant', 'admin']);
    const [promo] = await db
      .select()
      .from(promotions)
      .where(eq(promotions.id, params.id));
    if (!promo) throw new Error('优惠不存在');
    if (
      request.user.role === 'merchant' &&
      promo.ownerId !== request.user.id
    )
      throw new Error('非本优惠所有者');
    const [updated] = await db
      .update(promotions)
      .set(body)
      .where(eq(promotions.id, params.id))
      .returning();
    return { status: 200, body: updated };
  },
  delete: async ({ params, request }) => {
    checkPermission(request.user, ['merchant', 'admin']);
    const [promo] = await db
      .select()
      .from(promotions)
      .where(eq(promotions.id, params.id));
    if (!promo) throw new Error('优惠不存在');
    if (
      request.user.role === 'merchant' &&
      promo.ownerId !== request.user.id
    )
      throw new Error('非本优惠所有者');
    await db
      .update(promotions)
      .set({ deletedAt: new Date() })
      .where(eq(promotions.id, params.id));
    return { status: 200, body: { message: '已删除' } };
  },
});

const bookingsRouter = s.router(bookingsContract, {
  create: async ({ body, request }) => {
    checkPermission(request.user, ['customer']);
    body.userId = request.user.id;
    const [rt] = await db
      .select()
      .from(roomTypes)
      .where(eq(roomTypes.id, body.roomTypeId));
    if (!rt || rt.stock <= 0) throw new Error('库存不足');
    const [hotel] = await db
      .select()
      .from(hotels)
      .where(eq(hotels.id, body.hotelId));
    if (!hotel || hotel.status !== 'approved')
      throw new Error('无效酒店');
    const checkInDate = new Date(body.checkIn);
    const checkOutDate = new Date(body.checkOut);
    const days =
      (checkOutDate.getTime() - checkInDate.getTime()) /
      (1000 * 60 * 60 * 24);
    if (days <= 0) throw new Error('无效日期');
    let totalPrice = Number(rt.price) * days;
    let appliedPromoId = null;
    if (body.promotionId) {
      const [promo] = await db
        .select()
        .from(promotions)
        .where(
          and(
            eq(promotions.id, body.promotionId),
            lte(promotions.startDate, checkInDate),
            gte(promotions.endDate, checkOutDate),
            or(
              eq(promotions.hotelId, body.hotelId),
              eq(promotions.roomTypeId, body.roomTypeId),
            ),
          ),
        );
      if (promo) {
        appliedPromoId = promo.id;
        if (promo.type === 'percentage')
          totalPrice *= Number(promo.value);
        else if (promo.type === 'direct')
          totalPrice -= Number(promo.value);
        // 如有 'spend_and_save' 类型，可在此补充逻辑
      }
    }
    body.totalPrice = totalPrice;
    body.promotionId = appliedPromoId;
    body.status = 'pending';
    let newBooking;
    await db.transaction(async (tx) => {
      await tx
        .update(roomTypes)
        .set({ stock: sql`${roomTypes.stock} - 1` })
        .where(eq(roomTypes.id, body.roomTypeId));
      [newBooking] = await tx
        .insert(bookings)
        .values(body)
        .returning();
    });
    return { status: 201, body: newBooking };
  },
  list: async ({ query, request }) => {
    checkPermission(request.user, ['customer']);
    let q = db
      .select()
      .from(bookings)
      .where(
        and(
          eq(bookings.userId, request.user.id),
          isNull(bookings.deletedAt),
        ),
      );
    if (query.status)
      q = q.where(eq(bookings.status, query.status));
    const totalQuery = await db
      .select({ count: sql<number>`count(*) over()` })
      .from(q.as('subq'))
      .limit(1);
    const total = totalQuery[0]?.count || 0;
    const bookingList = await q
      .limit(query.limit || 10)
      .offset(
        ((query.page || 1) - 1) * (query.limit || 10),
      );
    return {
      status: 200,
      body: {
        bookings: bookingList,
        total,
        page: query.page || 1,
      },
    };
  },
  adminList: async ({ query, request }) => {
    checkPermission(request.user, ['admin']);
    let q = db
      .select()
      .from(bookings)
      .where(isNull(bookings.deletedAt));
    if (query.hotelId)
      q = q.where(eq(bookings.hotelId, query.hotelId));
    if (query.status)
      q = q.where(eq(bookings.status, query.status));
    const totalQuery = await db
      .select({ count: sql<number>`count(*) over()` })
      .from(q.as('subq'))
      .limit(1);
    const total = totalQuery[0]?.count || 0;
    const bookingList = await q
      .limit(query.limit || 10)
      .offset(
        ((query.page || 1) - 1) * (query.limit || 10),
      );
    return {
      status: 200,
      body: {
        bookings: bookingList,
        total,
        page: query.page || 1,
      },
    };
  },
  merchantList: async ({ query, request }) => {
    checkPermission(request.user, ['merchant']);
    let q = db
      .select()
      .from(bookings)
      .innerJoin(hotels, eq(bookings.hotelId, hotels.id))
      .where(
        and(
          eq(hotels.ownerId, request.user.id),
          isNull(bookings.deletedAt),
        ),
      );
    if (query.hotelId)
      q = q.where(eq(bookings.hotelId, query.hotelId));
    if (query.status)
      q = q.where(eq(bookings.status, query.status));
    const totalQuery = await db
      .select({ count: sql<number>`count(*) over()` })
      .from(q.as('subq'))
      .limit(1);
    const total = totalQuery[0]?.count || 0;
    const bookingList = await q
      .limit(query.limit || 10)
      .offset(
        ((query.page || 1) - 1) * (query.limit || 10),
      );
    return {
      status: 200,
      body: {
        bookings: bookingList,
        total,
        page: query.page || 1,
      },
    };
  },
  get: async ({ params, request }) => {
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, params.id));
    if (!booking) throw new Error('预订不存在');
    // 检查权限：客户拥有、商户拥有酒店、管理员全部
    if (
      request.user.role === 'customer' &&
      booking.userId !== request.user.id
    )
      throw new Error('无权限');
    if (request.user.role === 'merchant') {
      const [hotel] = await db
        .select()
        .from(hotels)
        .where(eq(hotels.id, booking.hotelId));
      if (hotel.ownerId !== request.user.id)
        throw new Error('无权限');
    }
    return { status: 200, body: booking };
  },
  confirm: async ({ params, request }) => {
    checkPermission(request.user, ['merchant', 'admin']);
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, params.id));
    if (!booking) throw new Error('预订不存在');
    if (request.user.role === 'merchant') {
      const [hotel] = await db
        .select()
        .from(hotels)
        .where(eq(hotels.id, booking.hotelId));
      if (hotel.ownerId !== request.user.id)
        throw new Error('无权限');
    }
    const [updated] = await db
      .update(bookings)
      .set({ status: 'confirmed' })
      .where(eq(bookings.id, params.id))
      .returning();
    return { status: 200, body: updated };
  },
  cancel: async ({ params, request }) => {
    checkPermission(request.user, [
      'customer',
      'merchant',
      'admin',
    ]);
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.id, params.id));
    if (!booking) throw new Error('预订不存在');
    if (
      request.user.role === 'customer' &&
      booking.userId !== request.user.id
    )
      throw new Error('无权限');
    if (request.user.role === 'merchant') {
      const [hotel] = await db
        .select()
        .from(hotels)
        .where(eq(hotels.id, booking.hotelId));
      if (hotel.ownerId !== request.user.id)
        throw new Error('无权限');
    }
    let updated;
    await db.transaction(async (tx) => {
      await tx
        .update(roomTypes)
        .set({ stock: sql`${roomTypes.stock} + 1` })
        .where(eq(roomTypes.id, booking.roomTypeId));
      [updated] = await tx
        .update(bookings)
        .set({ status: 'cancelled' })
        .where(eq(bookings.id, params.id))
        .returning();
    });
    return { status: 200, body: updated };
  },
  delete: async ({ params, request }) => {
    checkPermission(request.user, ['admin']);
    await db
      .update(bookings)
      .set({ deletedAt: new Date() })
      .where(eq(bookings.id, params.id));
    return { status: 200, body: { message: '已删除' } };
  },
});

const router = s.router(contract, {
  users: usersRouter,
  hotels: hotelsRouter,
  roomTypes: roomTypesRouter,
  promotions: promotionsRouter,
  bookings: bookingsRouter,
});

export const routerPlugin = s.plugin(router);
