/**
 * 酒店管理系统 - 路由处理器实现
 *
 * 本文件实现了酒店预订平台的所有API路由处理逻辑。
 * 使用 ts-rest 与 Fastify 集成，提供类型安全的 REST API。
 *
 * 技术栈：
 * - ts-rest: 类型安全的REST API定义
 * - Fastify 5.0: 高性能Web框架
 * - Drizzle ORM v1 RC: 数据库ORM（使用 Relational Queries v2）
 * - Valibot: 数据验证
 * - bcryptjs: 密码加密
 *
 * API模块：
 * 1. 用户模块 (usersRouter): 注册、登录、获取当前用户
 * 2. 酒店模块 (hotelsRouter): CRUD、审核、上下线
 * 3. 房型模块 (roomTypesRouter): CRUD
 * 4. 优惠模块 (promotionsRouter): CRUD
 * 5. 预订模块 (bookingsRouter): 创建、查询、确认、取消
 */

// =============================================================================
// 导入依赖模块
// =============================================================================

// ts-rest Fastify 集成
import { initServer } from '@ts-rest/fastify';

// Drizzle ORM SQL 工具（用于写入操作和原生SQL）
import { sql } from 'drizzle-orm';

// PostgreSQL 连接池
import { Pool } from 'pg';

// Drizzle ORM PostgreSQL 驱动
import { drizzle } from 'drizzle-orm/node-postgres';

// 密码加密库
import bcrypt from 'bcryptjs';

// Valibot 数据验证
import * as v from 'valibot';

// 导入API合约和类型定义（假设打包为 esu-types 包）
import {
  contract, // 完整API合约
  usersContract, // 用户API合约
  hotelsContract, // 酒店API合约
  roomTypesContract, // 房型API合约
  promotionsContract, // 优惠API合约
  bookingsContract, // 预订API合约
  roleType, // 角色类型枚举
  UserSchema, // 用户Schema
  JwtSchema, // JWT Payload Schema
} from 'esu-types';

// 导入数据库表定义
import {
  users,
  hotels,
  roomTypes,
  promotions,
  roomTypePromotion,
  bookings,
  relations,
} from './schema.js';

// =============================================================================
// 数据库连接初始化
// =============================================================================

/**
 * PostgreSQL 连接池配置
 * 使用环境变量 DATABASE_URL 获取连接字符串
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Drizzle ORM 实例
 * 配置日志输出便于开发调试
 */
const db = drizzle({
  client: pool,
  logger: process.env.NODE_ENV === 'development', // 开发环境启用日志
  relations,
});

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 权限检查辅助函数
 *
 * 验证JWT token中的用户角色是否有权限访问当前API。
 *
 * @param jwt - JWT token中解析出的用户信息
 * @param permissions - 允许访问的角色列表，null表示无需认证
 * @returns 解析后的用户信息（包含id和role）
 * @throws Error 如果权限不足则抛出异常
 */
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

/**
 * 移除敏感字段辅助函数
 * 从用户对象中移除密码字段，防止敏感信息泄露。
 */
const omitPassword = (
  user: v.InferInput<typeof UserSchema>,
) => {
  const { password, ...rest } = user;
  return rest;
};

/**
 * 计算折扣价格辅助函数
 * 根据优惠类型计算应用优惠后的价格。
 */
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

/**
 * 获取当前有效的优惠辅助函数
 *
 * 查询指定酒店或房型当前有效的优惠活动。
 * 使用 Drizzle Relational Queries v2 的对象格式 where 条件。
 *
 * @param hotelId - 酒店ID
 * @param roomTypeId - 房型ID（可选）
 * @returns 有效优惠列表
 */
const getActivePromotions = async (
  hotelId: number,
  roomTypeId?: number,
) => {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // 使用 Drizzle RQB v2 对象格式 where 条件
  // 多个字段默认是 AND 关系
  const response = await db.query.promotions.findMany({
    where: {
      // 开始日期 <= 今天
      startDate: { lte: today },
      // 结束日期 >= 今天
      endDate: { gte: today },
      // 未被软删除
      deletedAt: { isNull: true },
      // OR 条件：关联到指定酒店、房型，或者是全局优惠
      OR: [
        { hotelId: { eq: hotelId } },
        ...(roomTypeId
          ? [{ roomTypeId: { eq: roomTypeId } }]
          : []),
        { hotelId: { isNull: true } },
      ],
    },
  });

  return response;
};

// =============================================================================
// ts-rest 服务器初始化
// =============================================================================
const s = initServer();

// =============================================================================
// 用户路由处理器 (usersRouter)
// =============================================================================

const usersRouter = s.router(usersContract, {
  /**
   * 用户注册
   *
   * 权限：公开接口，无需认证
   */
  register: async ({ body }) => {
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

    if (!newUser) {
      throw new Error('用户创建失败，请稍后重试');
    }

    return { status: 201, body: omitPassword(newUser) };
  },

  /**
   * 用户登录
   *
   * 权限：公开接口，无需认证
   */
  login: async ({ body, request }) => {
    const app = request.server;

    // 使用 Drizzle RQB v2 对象格式 where 条件
    const user = await db.query.users.findFirst({
      where: {
        username: { eq: body.username },
      },
    });

    if (
      !user ||
      !(await bcrypt.compare(body.password, user.password))
    ) {
      throw new Error('用户名或密码错误');
    }

    if (user.deletedAt) {
      throw new Error('该账号已被禁用');
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

  /**
   * 获取当前用户信息
   *
   * 权限：需要用户认证（customer/merchant/admin均可）
   */
  me: async ({ request }) => {
    const jwt = checkPermission(request.user, [
      'customer',
      'merchant',
      'admin',
    ]);

    // 使用 Drizzle RQB v2 对象格式 where 条件
    const user = await db.query.users.findFirst({
      where: {
        id: { eq: jwt.id },
      },
    });

    if (!user) {
      throw new Error('用户不存在');
    }

    if (user.deletedAt) {
      throw new Error('该账号已被禁用');
    }

    return { status: 200, body: omitPassword(user) };
  },
});

// =============================================================================
// 酒店路由处理器 (hotelsRouter)
// =============================================================================

const hotelsRouter = s.router(hotelsContract, {
  /**
   * 创建酒店
   *
   * 权限：需要商户或管理员角色
   */
  create: async ({ body, request }) => {
    const jwt = checkPermission(request.user, [
      'merchant',
      'admin',
    ]);

    if (jwt.role === 'merchant') {
      body.ownerId = jwt.id;
    }

    const owner = await db.query.users.findFirst({
      where: {
        id: { eq: body.ownerId },
      },
    });

    if (!owner || owner.role !== 'merchant') {
      throw new Error(
        '无效的所有者：酒店所有者必须是商户角色',
      );
    }

    const [newHotel] = await db
      .insert(hotels)
      .values({
        ...body,
        status: 'pending',
      })
      .returning();

    if (!newHotel) {
      throw new Error('酒店创建失败');
    }

    return { status: 201, body: newHotel };
  },

  /**
   * 酒店列表（用户端）
   *
   * 权限：公开接口，无需认证
   */
  list: async ({ query }) => {
    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    // 构建 where 条件对象
    // Drizzle RQB v2: 多个字段默认是 AND 关系
    // 使用 AND 显式组合条件
    const whereCondition: any = {
      deletedAt: { isNull: true },
      status: { eq: 'approved' },
    };

    // 添加可选的筛选条件
    if (query.keyword) {
      whereCondition.nameZh = {
        ilike: `%${query.keyword}%`,
      };
    }
    if (query.starRating) {
      whereCondition.starRating = { eq: query.starRating };
    }

    // 使用 relational query 查询酒店列表
    const hotelList = await db.query.hotels.findMany({
      where: whereCondition,
      with: {
        // 关联查询房型信息
        roomTypes: {
          where: {
            deletedAt: { isNull: true },
          },
        },
        // 关联查询优惠信息
        promotions: {
          where: {
            deletedAt: { isNull: true },
          },
        },
      },
      limit,
      offset,
      orderBy: { createdAt: 'desc' },
    });

    // 为每个酒店计算房型折扣价
    for (const hotel of hotelList) {
      if (hotel.roomTypes && hotel.roomTypes.length > 0) {
        for (const rt of hotel.roomTypes) {
          const activePromotions =
            await getActivePromotions(hotel.id, rt.id);
          let discountedPrice = Number(rt.price);
          for (const promo of activePromotions) {
            discountedPrice = calculateDiscountedPrice(
              discountedPrice,
              promo,
            );
          }
          (rt as any).discountedPrice = Math.max(
            0,
            discountedPrice,
          );
        }
        hotel.roomTypes.sort((a, b) => {
          const priceA =
            (a as any).discountedPrice || Number(a.price);
          const priceB =
            (b as any).discountedPrice || Number(b.price);
          return priceA - priceB;
        });
      }
    }

    // 获取总数
    const totalCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(hotels)
      .where(
        sql`${hotels.deletedAt} IS NULL AND ${hotels.status} = 'approved'`,
      );

    const total = Number(totalCount[0]?.count) || 0;

    return {
      status: 200,
      body: { hotels: hotelList, total, page },
    };
  },

  /**
   * 酒店详情
   *
   * 权限：公开接口，无需认证
   */
  get: async ({ params }) => {
    // 使用 Drizzle RQB v2 对象格式 where 条件
    // 多个条件默认是 AND 关系
    const hotel = await db.query.hotels.findFirst({
      where: {
        id: { eq: params.id },
        deletedAt: { isNull: true },
      },
      with: {
        roomTypes: {
          where: {
            deletedAt: { isNull: true },
          },
        },
        promotions: {
          where: {
            deletedAt: { isNull: true },
          },
        },
        owner: {
          columns: { id: true, username: true, role: true },
        },
      },
    });

    if (!hotel) {
      throw new Error('酒店不存在');
    }

    // 计算房型折扣价
    if (hotel.roomTypes && hotel.roomTypes.length > 0) {
      for (const rt of hotel.roomTypes) {
        const activePromotions = await getActivePromotions(
          hotel.id,
          rt.id,
        );
        let discountedPrice = Number(rt.price);
        for (const promo of activePromotions) {
          discountedPrice = calculateDiscountedPrice(
            discountedPrice,
            promo,
          );
        }
        (rt as any).discountedPrice = Math.max(
          0,
          discountedPrice,
        );
      }
      hotel.roomTypes.sort((a, b) => {
        const priceA =
          (a as any).discountedPrice || Number(a.price);
        const priceB =
          (b as any).discountedPrice || Number(b.price);
        return priceA - priceB;
      });
    }

    return { status: 200, body: hotel };
  },

  /**
   * 更新酒店信息
   *
   * 权限：需要商户或管理员角色
   */
  update: async ({ params, body, request }) => {
    const jwt = checkPermission(request.user, [
      'merchant',
      'admin',
    ]);

    const hotel = await db.query.hotels.findFirst({
      where: { id: { eq: params.id } },
    });

    if (!hotel) {
      throw new Error('酒店不存在');
    }

    if (
      jwt.role === 'merchant' &&
      hotel.ownerId !== jwt.id
    ) {
      throw new Error('无权限：您只能修改自己创建的酒店');
    }

    if (
      jwt.role === 'merchant' &&
      !['pending', 'rejected'].includes(hotel.status)
    ) {
      throw new Error('无权限：已审核通过的酒店不能修改');
    }

    const [updated] = await db
      .update(hotels)
      .set({ ...body, updatedAt: new Date() })
      .where(sql`${hotels.id} = ${params.id}`)
      .returning();

    return { status: 200, body: updated };
  },

  /**
   * 审核通过
   *
   * 权限：仅管理员
   */
  approve: async ({ params, request }) => {
    checkPermission(request.user, ['admin']);

    const [updated] = await db
      .update(hotels)
      .set({
        status: 'approved',
        statusDescription: null,
        updatedAt: new Date(),
      })
      .where(sql`${hotels.id} = ${params.id}`)
      .returning();

    if (!updated) {
      throw new Error('酒店不存在');
    }

    return { status: 200, body: updated };
  },

  /**
   * 审核拒绝
   *
   * 权限：仅管理员
   */
  reject: async ({ params, body, request }) => {
    checkPermission(request.user, ['admin']);

    const [updated] = await db
      .update(hotels)
      .set({
        status: 'rejected',
        statusDescription: body.rejectReason,
        updatedAt: new Date(),
      })
      .where(sql`${hotels.id} = ${params.id}`)
      .returning();

    if (!updated) {
      throw new Error('酒店不存在');
    }

    return { status: 200, body: updated };
  },

  /**
   * 下线酒店
   *
   * 权限：仅管理员
   */
  offline: async ({ params, request }) => {
    checkPermission(request.user, ['admin']);

    const [updated] = await db
      .update(hotels)
      .set({ status: 'offline', updatedAt: new Date() })
      .where(sql`${hotels.id} = ${params.id}`)
      .returning();

    if (!updated) {
      throw new Error('酒店不存在');
    }

    return { status: 200, body: updated };
  },

  /**
   * 恢复上线
   *
   * 权限：仅管理员
   */
  online: async ({ params, request }) => {
    checkPermission(request.user, ['admin']);

    const [updated] = await db
      .update(hotels)
      .set({ status: 'approved', updatedAt: new Date() })
      .where(sql`${hotels.id} = ${params.id}`)
      .returning();

    if (!updated) {
      throw new Error('酒店不存在');
    }

    return { status: 200, body: updated };
  },

  /**
   * 管理员酒店列表
   *
   * 权限：仅管理员
   */
  adminList: async ({ query, request }) => {
    checkPermission(request.user, ['admin']);

    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    // 构建 where 条件对象
    const whereCondition: any = {
      deletedAt: { isNull: true },
    };
    if (query.status) {
      whereCondition.status = { eq: query.status };
    }

    const hotelList = await db.query.hotels.findMany({
      where: whereCondition,
      with: {
        owner: {
          columns: { id: true, username: true },
        },
      },
      limit,
      offset,
      orderBy: { createdAt: 'desc' },
    });

    const totalCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(hotels)
      .where(sql`${hotels.deletedAt} IS NULL`);

    const total = Number(totalCount[0]?.count) || 0;

    return {
      status: 200,
      body: { hotels: hotelList, total, page },
    };
  },

  /**
   * 商户自己的酒店列表
   *
   * 权限：仅商户
   */
  merchantList: async ({ query, request }) => {
    const jwt = checkPermission(request.user, ['merchant']);

    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    const hotelList = await db.query.hotels.findMany({
      where: {
        ownerId: { eq: jwt.id },
        deletedAt: { isNull: true },
      },
      limit,
      offset,
      orderBy: { createdAt: 'desc' },
    });

    const totalCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(hotels)
      .where(
        sql`${hotels.ownerId} = ${jwt.id} AND ${hotels.deletedAt} IS NULL`,
      );

    const total = Number(totalCount[0]?.count) || 0;

    return {
      status: 200,
      body: { hotels: hotelList, total, page },
    };
  },

  /**
   * 删除酒店（软删除）
   *
   * 权限：仅管理员
   */
  delete: async ({ params, request }) => {
    checkPermission(request.user, ['admin']);

    await db
      .update(hotels)
      .set({ deletedAt: new Date() })
      .where(sql`${hotels.id} = ${Number(params.id)}`);

    return { status: 200, body: { message: '已删除' } };
  },
});

// =============================================================================
// 房型路由处理器 (roomTypesRouter)
// =============================================================================

const roomTypesRouter = s.router(roomTypesContract, {
  /**
   * 创建房型
   *
   * 权限：需要商户或管理员角色
   */
  create: async ({ body, request }) => {
    const jwt = checkPermission(request.user, [
      'merchant',
      'admin',
    ]);

    const hotel = await db.query.hotels.findFirst({
      where: {
        id: { eq: body.hotelId },
        deletedAt: { isNull: true },
      },
    });

    if (!hotel) {
      throw new Error('酒店不存在');
    }

    if (
      jwt.role &&
      jwt.role === 'merchant' &&
      hotel.ownerId !== (request.user as any).id
    ) {
      throw new Error('无权限：您只能为自己的酒店创建房型');
    }

    const [newRoomType] = await db
      .insert(roomTypes)
      .values(body)
      .returning();

    return { status: 201, body: newRoomType };
  },

  /**
   * 获取房型详情
   *
   * 权限：公开接口，无需认证
   */
  get: async ({ params }) => {
    const roomType = await db.query.roomTypes.findFirst({
      where: {
        id: { eq: params.id },
        deletedAt: { isNull: true },
      },
      with: {
        hotel: {
          columns: {
            id: true,
            nameZh: true,
            address: true,
            starRating: true,
          },
        },
      },
    });

    if (!roomType) {
      throw new Error('房型不存在');
    }

    return { status: 200, body: roomType };
  },

  /**
   * 更新房型信息
   *
   * 权限：需要商户或管理员角色
   */
  update: async ({ params, body, request }) => {
    const jwt = checkPermission(request.user, [
      'merchant',
      'admin',
    ]);

    const rt = await db.query.roomTypes.findFirst({
      where: { id: { eq: params.id } },
    });

    if (!rt) {
      throw new Error('房型不存在');
    }

    const hotel = await db.query.hotels.findFirst({
      where: { id: { eq: rt.hotelId } },
    });

    if (!hotel) {
      throw new Error('关联酒店不存在');
    }

    if (
      jwt.role === 'merchant' &&
      hotel.ownerId !== jwt.id
    ) {
      throw new Error('无权限：您只能修改自己酒店的房型');
    }

    const [updated] = await db
      .update(roomTypes)
      .set({ ...body, updatedAt: new Date() })
      .where(sql`${roomTypes.id} = ${params.id}`)
      .returning();

    return { status: 200, body: updated };
  },

  /**
   * 删除房型
   *
   * 权限：需要商户或管理员角色
   */
  delete: async ({ params, request }) => {
    const jwt = checkPermission(request.user, [
      'merchant',
      'admin',
    ]);

    const rt = await db.query.roomTypes.findFirst({
      where: { id: { eq: params.id } },
    });

    if (!rt) {
      throw new Error('房型不存在');
    }

    const hotel = await db.query.hotels.findFirst({
      where: { id: { eq: rt.hotelId } },
    });

    if (!hotel) {
      throw new Error('关联酒店不存在');
    }

    if (
      jwt.role === 'merchant' &&
      hotel.ownerId !== jwt.id
    ) {
      throw new Error('无权限：您只能删除自己酒店的房型');
    }

    await db
      .update(roomTypes)
      .set({ deletedAt: new Date() })
      .where(sql`${roomTypes.id} = ${params.id}`);

    return { status: 200, body: { message: '已删除' } };
  },
});

// =============================================================================
// 优惠路由处理器 (promotionsRouter)
// =============================================================================

const promotionsRouter = s.router(promotionsContract, {
  /**
   * 创建优惠
   *
   * 权限：需要商户或管理员角色
   */
  create: async ({ body, request }) => {
    const jwt = checkPermission(request.user, [
      'merchant',
      'admin',
    ]);

    const promoData = { ...body, ownerId: jwt.id };

    if (body.hotelId) {
      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: body.hotelId } },
      });
      if (!hotel) {
        throw new Error('关联酒店不存在');
      }
      if (
        jwt.role === 'merchant' &&
        hotel.ownerId !== jwt.id
      ) {
        throw new Error(
          '无权限：您只能为自己的酒店创建优惠',
        );
      }
    }

    if (body.roomTypeId) {
      const rt = await db.query.roomTypes.findFirst({
        where: { id: { eq: body.roomTypeId } },
      });
      if (!rt) {
        throw new Error('关联房型不存在');
      }
      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: rt.hotelId } },
      });
      if (
        hotel &&
        jwt.role === 'merchant' &&
        hotel.ownerId !== jwt.id
      ) {
        throw new Error(
          '无权限：您只能为自己的房型创建优惠',
        );
      }
    }

    const [newPromo] = await db
      .insert(promotions)
      .values(promoData)
      .returning();

    return { status: 201, body: newPromo };
  },

  /**
   * 优惠列表
   *
   * 权限：公开接口，无需认证
   */
  list: async ({ query }) => {
    // 构建 where 条件对象
    const whereCondition: any = {
      deletedAt: { isNull: true },
    };
    if (query.hotelId) {
      whereCondition.hotelId = {
        eq: Number(query.hotelId),
      };
    }
    if (query.roomTypeId) {
      whereCondition.roomTypeId = {
        eq: Number(query.roomTypeId),
      };
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

  /**
   * 优惠详情
   *
   * 权限：公开接口，无需认证
   */
  get: async ({ params }) => {
    const promo = await db.query.promotions.findFirst({
      where: {
        id: { eq: params.id },
        deletedAt: { isNull: true },
      },
      with: {
        hotel: true,
        roomType: true,
        owner: { columns: { id: true, username: true } },
      },
    });

    if (!promo) {
      throw new Error('优惠不存在');
    }

    return { status: 200, body: promo };
  },

  /**
   * 更新优惠
   *
   * 权限：需要商户或管理员角色
   */
  update: async ({ params, body, request }) => {
    const jwt = checkPermission(request.user, [
      'merchant',
      'admin',
    ]);

    const promo = await db.query.promotions.findFirst({
      where: { id: { eq: params.id } },
    });

    if (!promo) {
      throw new Error('优惠不存在');
    }

    if (
      jwt.role === 'merchant' &&
      promo.ownerId !== jwt.id
    ) {
      throw new Error('无权限：您只能修改自己创建的优惠');
    }

    const [updated] = await db
      .update(promotions)
      .set({ ...body, updatedAt: new Date() })
      .where(sql`${promotions.id} = ${params.id}`)
      .returning();

    return { status: 200, body: updated };
  },

  /**
   * 删除优惠
   *
   * 权限：需要商户或管理员角色
   */
  delete: async ({ params, request }) => {
    const jwt = checkPermission(request.user, [
      'merchant',
      'admin',
    ]);

    const promo = await db.query.promotions.findFirst({
      where: { id: { eq: params.id } },
    });

    if (!promo) {
      throw new Error('优惠不存在');
    }

    if (
      jwt.role === 'merchant' &&
      promo.ownerId !== jwt.id
    ) {
      throw new Error('无权限：您只能删除自己创建的优惠');
    }

    await db
      .update(promotions)
      .set({ deletedAt: new Date() })
      .where(sql`${promotions.id} = ${params.id}`);

    return { status: 200, body: { message: '已删除' } };
  },
});

// =============================================================================
// 预订路由处理器 (bookingsRouter)
// =============================================================================

const bookingsRouter = s.router(bookingsContract, {
  /**
   * 创建预订
   *
   * 权限：仅普通用户（customer）
   */
  create: async ({ body, request }) => {
    const jwt = checkPermission(request.user, ['customer']);

    const rt = await db.query.roomTypes.findFirst({
      where: {
        id: { eq: body.roomTypeId },
        deletedAt: { isNull: true },
      },
    });

    if (!rt) {
      throw new Error('房型不存在');
    }

    if (rt.stock <= 0) {
      throw new Error('房型库存不足');
    }

    const hotel = await db.query.hotels.findFirst({
      where: { id: { eq: body.hotelId } },
    });

    if (!hotel || hotel.status !== 'approved') {
      throw new Error('无效的酒店');
    }

    const checkInDate = new Date(body.checkIn);
    const checkOutDate = new Date(body.checkOut);
    const days = Math.ceil(
      (checkOutDate.getTime() - checkInDate.getTime()) /
        (1000 * 60 * 60 * 24),
    );

    if (days <= 0) {
      throw new Error('入住日期必须早于离店日期');
    }

    let totalPrice = Number(rt.price) * days;
    let appliedPromoId: number | null = null;

    if (body.promotionId) {
      const promo = await db.query.promotions.findFirst({
        where: {
          id: { eq: body.promotionId },
          startDate: { lte: body.checkIn },
          endDate: { gte: body.checkOut },
          deletedAt: { isNull: true },
          OR: [
            { hotelId: { eq: body.hotelId } },
            { roomTypeId: { eq: body.roomTypeId } },
            { hotelId: { isNull: true } },
          ],
        },
      });

      if (promo) {
        appliedPromoId = promo.id;
        totalPrice = calculateDiscountedPrice(
          totalPrice,
          promo,
        );
      }
    }

    totalPrice = Math.max(0, totalPrice);

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
          totalPrice: totalPrice.toString(),
          status: 'pending',
          promotionId: appliedPromoId,
        })
        .returning();

      newBooking = created;
    });

    return { status: 201, body: newBooking };
  },

  /**
   * 用户预订列表
   *
   * 权限：仅普通用户（customer）
   */
  list: async ({ query, request }) => {
    const jwt = checkPermission(request.user, ['customer']);

    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    // 构建 where 条件对象
    const whereCondition: any = {
      userId: { eq: jwt.id },
      deletedAt: { isNull: true },
    };
    if (query.status) {
      whereCondition.status = { eq: query.status };
    }

    const bookingList = await db.query.bookings.findMany({
      where: whereCondition,
      with: {
        hotel: {
          columns: {
            id: true,
            nameZh: true,
            address: true,
            starRating: true,
          },
        },
        roomType: {
          columns: { id: true, name: true, price: true },
        },
      },
      limit,
      offset,
      orderBy: { createdAt: 'desc' },
    });

    const totalCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(
        sql`${bookings.userId} = ${jwt.id} AND ${bookings.deletedAt} IS NULL`,
      );

    const total = Number(totalCount[0]?.count) || 0;

    return {
      status: 200,
      body: { bookings: bookingList, total, page },
    };
  },

  /**
   * 管理员预订列表
   *
   * 权限：仅管理员
   */
  adminList: async ({ query, request }) => {
    checkPermission(request.user, ['admin']);

    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    // 构建 where 条件对象
    const whereCondition: any = {
      deletedAt: { isNull: true },
    };
    if (query.hotelId) {
      whereCondition.hotelId = {
        eq: Number(query.hotelId),
      };
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
      offset,
      orderBy: { createdAt: 'desc' },
    });

    const totalCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(sql`${bookings.deletedAt} IS NULL`);

    const total = Number(totalCount[0]?.count) || 0;

    return {
      status: 200,
      body: { bookings: bookingList, total, page },
    };
  },

  /**
   * 商户预订列表
   *
   * 权限：仅商户
   */
  merchantList: async ({ query, request }) => {
    const jwt = checkPermission(request.user, ['merchant']);

    const page = query.page || 1;
    const limit = query.limit || 10;
    const offset = (page - 1) * limit;

    const merchantHotels = await db.query.hotels.findMany({
      where: { ownerId: { eq: jwt.id } },
      columns: { id: true },
    });

    const hotelIds = merchantHotels.map((h) => h.id);

    if (hotelIds.length === 0) {
      return {
        status: 200,
        body: { bookings: [], total: 0, page },
      };
    }

    // 构建 where 条件对象
    // 使用 in 操作符
    const whereCondition: any = {
      hotelId: { in: hotelIds },
      deletedAt: { isNull: true },
    };
    if (query.hotelId) {
      whereCondition.hotelId = {
        eq: Number(query.hotelId),
      };
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
      offset,
      orderBy: { createdAt: 'desc' },
    });

    const totalCount = await db
      .select({ count: sql<number>`count(*)` })
      .from(bookings)
      .where(
        sql`${bookings.hotelId} IN (${hotelIds.join(',')}) AND ${bookings.deletedAt} IS NULL`,
      );

    const total = Number(totalCount[0]?.count) || 0;

    return {
      status: 200,
      body: { bookings: bookingList, total, page },
    };
  },

  /**
   * 预订详情
   *
   * 权限：需要认证（customer/merchant/admin）
   */
  get: async ({ params, request }) => {
    const jwt = checkPermission(request.user, [
      'customer',
      'merchant',
      'admin',
    ]);

    const booking = await db.query.bookings.findFirst({
      where: {
        id: { eq: params.id },
        deletedAt: { isNull: true },
      },
      with: {
        user: {
          columns: {
            id: true,
            username: true,
            phone: true,
            email: true,
          },
        },
        hotel: true,
        roomType: true,
        promotion: true,
      },
    });

    if (!booking) {
      throw new Error('预订不存在');
    }

    if (
      jwt.role === 'customer' &&
      booking.userId !== jwt.id
    ) {
      throw new Error('无权限查看此预订');
    }

    if (jwt.role === 'merchant') {
      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: booking.hotelId } },
      });
      if (!hotel || hotel.ownerId !== jwt.id) {
        throw new Error('无权限查看此预订');
      }
    }

    return { status: 200, body: booking };
  },

  /**
   * 确认预订
   *
   * 权限：需要商户或管理员角色
   */
  confirm: async ({ params, request }) => {
    const jwt = checkPermission(request.user, [
      'merchant',
      'admin',
    ]);

    const booking = await db.query.bookings.findFirst({
      where: { id: { eq: Number(params.id) } },
    });

    if (!booking) {
      throw new Error('预订不存在');
    }

    if (jwt.role === 'merchant') {
      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: booking.hotelId } },
      });
      if (!hotel || hotel.ownerId !== jwt.id) {
        throw new Error('无权限确认此预订');
      }
    }

    if (booking.status !== 'pending') {
      throw new Error('只能确认待确认状态的预订');
    }

    const [updated] = await db
      .update(bookings)
      .set({ status: 'confirmed', updatedAt: new Date() })
      .where(sql`${bookings.id} = ${Number(params.id)}`)
      .returning();

    return { status: 200, body: updated };
  },

  /**
   * 取消预订
   *
   * 权限：需要认证（customer/merchant/admin）
   */
  cancel: async ({ params, request }) => {
    const jwt = checkPermission(request.user, [
      'customer',
      'merchant',
      'admin',
    ]);

    const booking = await db.query.bookings.findFirst({
      where: { id: { eq: Number(params.id) } },
    });

    if (!booking) {
      throw new Error('预订不存在');
    }

    if (
      jwt.role === 'customer' &&
      booking.userId !== jwt.id
    ) {
      throw new Error('无权限取消此预订');
    }

    if (jwt.role === 'merchant') {
      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: booking.hotelId } },
      });
      if (!hotel || hotel.ownerId !== jwt.id) {
        throw new Error('无权限取消此预订');
      }
    }

    if (booking.status === 'cancelled') {
      throw new Error('预订已取消');
    }

    if (booking.status === 'completed') {
      throw new Error('已完成的预订无法取消');
    }

    let updated: any;
    await db.transaction(async (tx) => {
      await tx
        .update(roomTypes)
        .set({
          stock: sql`${roomTypes.stock} + 1`,
          updatedAt: new Date(),
        })
        .where(
          sql`${roomTypes.id} = ${booking.roomTypeId}`,
        );

      const [result] = await tx
        .update(bookings)
        .set({ status: 'cancelled', updatedAt: new Date() })
        .where(sql`${bookings.id} = ${Number(params.id)}`)
        .returning();

      updated = result;
    });

    return { status: 200, body: updated };
  },

  /**
   * 删除预订
   *
   * 权限：仅管理员
   */
  delete: async ({ params, request }) => {
    checkPermission(request.user, ['admin']);

    await db
      .update(bookings)
      .set({ deletedAt: new Date() })
      .where(sql`${bookings.id} = ${Number(params.id)}`);

    return { status: 200, body: { message: '已删除' } };
  },
});

// =============================================================================
// 路由汇总与导出
// =============================================================================

const router = s.router(contract, {
  users: usersRouter,
  hotels: hotelsRouter,
  roomTypes: roomTypesRouter,
  promotions: promotionsRouter,
  bookings: bookingsRouter,
});

export const routerPlugin = s.plugin(router);
