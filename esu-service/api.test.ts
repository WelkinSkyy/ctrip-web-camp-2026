/**
 * 酒店管理系统 API 集成测试
 *
 * 测试策略：
 * - 导入真正的路由处理器（router-factory）
 * - 注入测试数据库
 * - 测试完整的 API 流程
 */

import {
  describe,
  it,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from '@jest/globals';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import { eq, and, isNull } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';

// 导入真正的路由处理器工厂
import { createRouter } from './router-factory.js';

// 导入数据库 Schema
import {
  users,
  hotels,
  roomTypes,
  promotions,
  bookings,
  relations,
} from './schema.js';

// =============================================================================
// 测试配置
// =============================================================================

const JWT_SECRET = 'test_secret_key';

// 测试数据库连接
const pool = new Pool({
  connectionString:
    process.env.DATABASE_URL ||
    'postgresql://postgres:postgres@localhost:5432/hotel_test',
});
const db = drizzle({
  client: pool,
  logger: true, // 开发环境启用日志
  relations,
});

// Fastify 应用实例
let app = Fastify({ logger: true });

// 测试数据
let testData: {
  admin: any;
  merchant: any;
  customer: any;
  hotel: any;
  pendingHotel: any;
  roomType: any;
  promotion: any;
  booking: any;
};

// Token 缓存
const tokens = {
  customer: '',
  admin: '',
  merchant: '',
};

// =============================================================================
// 辅助函数
// =============================================================================

/** 生成 JWT Token */
const createToken = (id: number, role: string) => {
  return app.jwt.sign({ id, role });
};

/** 发送 HTTP 请求 */
const request = async (options: {
  method:
    | 'DELETE'
    | 'delete'
    | 'GET'
    | 'get'
    | 'HEAD'
    | 'head'
    | 'PATCH'
    | 'patch'
    | 'POST'
    | 'post'
    | 'PUT'
    | 'put'
    | 'OPTIONS'
    | 'options';
  url: string;
  body?: any;
  token?: string;
}) => {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (options.token) {
    headers.authorization = `Bearer ${options.token}`;
  }

  const response = await app.inject({
    method: options.method,
    url: options.url,
    headers,
    payload: options.body
      ? JSON.stringify(options.body)
      : undefined,
  });

  return {
    status: response.statusCode,
    body: response.json
      ? response.json()
      : JSON.parse(response.body),
  };
};

/** 清空数据库 */
const cleanDatabase = async () => {
  const client = await pool.connect();
  try {
    await client.query(`
      TRUNCATE TABLE bookings, promotions, room_types, hotels, users
      RESTART IDENTITY CASCADE
    `);
  } finally {
    client.release();
  }
};

/** 准备测试数据 */
const seedTestData = async () => {
  const hashedPassword = await bcrypt.hash(
    'password123',
    10,
  );

  // 创建用户
  const [admin, merchant, customer] = await db
    .insert(users)
    .values([
      {
        username: 'admin',
        password: hashedPassword,
        role: 'admin',
      },
      {
        username: 'merchant',
        password: hashedPassword,
        role: 'merchant',
      },
      {
        username: 'customer',
        password: hashedPassword,
        role: 'customer',
      },
    ])
    .returning();

  if (!admin || !merchant || !customer)
    throw new Error(
      'get error when seedTestData insert users',
    );

  // 创建酒店
  const [hotel, pendingHotel] = await db
    .insert(hotels)
    .values([
      {
        nameZh: '测试酒店A',
        ownerId: merchant.id,
        address: '北京市测试路1号',
        starRating: 4,
        openingDate: '2020-01-01',
        status: 'approved',
      },
      {
        nameZh: '待审核酒店',
        ownerId: merchant.id,
        address: '上海市测试路2号',
        starRating: 3,
        openingDate: '2021-01-01',
        status: 'pending',
      },
    ])
    .returning();

  if (!hotel || !pendingHotel)
    throw new Error('get error when seedTestData hotels');

  // 创建房型
  const [roomType] = await db
    .insert(roomTypes)
    .values([
      {
        hotelId: hotel.id,
        name: '标准间',
        price: 399.0,
        stock: 10,
      },
    ])
    .returning();

  if (!roomType)
    throw new Error('get error when seedTestData roomType');

  // 创建优惠
  const [promotion] = await db
    .insert(promotions)
    .values([
      {
        ownerId: merchant.id,
        hotelId: hotel.id,
        type: 'percentage',
        value: 0.85,
        startDate: '2024-01-01',
        endDate: '2024-12-31',
      },
    ])
    .returning();

  if (!promotion)
    throw new Error(
      'get error when seedTestData promotion',
    );

  // 创建预订
  const [booking] = await db
    .insert(bookings)
    .values([
      {
        userId: customer.id,
        hotelId: hotel.id,
        roomTypeId: roomType.id,
        checkIn: '2024-06-01',
        checkOut: '2024-06-03',
        totalPrice: 798.0,
        status: 'pending',
      },
    ])
    .returning();

  if (!booking)
    throw new Error('get error when eedTestData');

  testData = {
    admin,
    merchant,
    customer,
    hotel,
    pendingHotel,
    roomType,
    promotion,
    booking,
  };
};

// =============================================================================
// 测试生命周期
// =============================================================================

beforeAll(async () => {
  // 创建 Fastify 应用
  app = Fastify({ logger: true });
  await app.register(jwt, { secret: JWT_SECRET });

  // 请求钩子：除注册和登录外的所有路由都需要验证 JWT
  app.addHook('onRequest', async (request, reply) => {
    try {
      if (
        !['/users/register', '/users/login'].includes(
          request.url,
        )
      ) {
        await request.jwtVerify();
      }
    } catch (err) {
      reply.code(401).send({ error: '未授权' });
    }
  });

  // 注册真正的路由处理器（注入测试数据库）
  const routerPlugin = createRouter(db);
  await app.register(routerPlugin);

  // 准备测试数据
  await cleanDatabase();
  await seedTestData();

  // 生成 Token
  tokens.admin = createToken(testData.admin.id, 'admin');
  tokens.merchant = createToken(
    testData.merchant.id,
    'merchant',
  );
  tokens.customer = createToken(
    testData.customer.id,
    'customer',
  );
});

afterAll(async () => {
  await pool.end();
});

beforeEach(async () => {
  await cleanDatabase();
  await seedTestData();
});

// =============================================================================
// 用户模块测试
// =============================================================================

describe('用户模块', () => {
  describe('POST /users/register', () => {
    it('成功注册新用户', async () => {
      const res = await request({
        method: 'POST',
        url: '/users/register',
        body: {
          username: 'newuser',
          password: 'password123',
          role: 'customer',
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.username).toBe('newuser');
      expect(res.body.password).toBeUndefined();
    });
  });

  describe('POST /users/login', () => {
    it('成功登录', async () => {
      const res = await request({
        method: 'POST',
        url: '/users/login',
        body: {
          username: 'customer',
          password: 'password123',
        },
      });

      expect(res.status).toBe(200);
      expect(res.body.token).toBeDefined();
      expect(res.body.user.username).toBe('customer');
    });

    it('密码错误返回401', async () => {
      const res = await request({
        method: 'POST',
        url: '/users/login',
        body: {
          username: 'customer',
          password: 'wrongpassword',
        },
      });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /users/me', () => {
    it('获取当前用户信息', async () => {
      const res = await request({
        method: 'GET',
        url: '/users/me',
        token: tokens.customer,
      });

      expect(res.status).toBe(200);
      expect(res.body.username).toBe('customer');
    });

    it('未登录返回401', async () => {
      const res = await request({
        method: 'GET',
        url: '/users/me',
      });
      expect(res.status).toBe(401);
    });
  });
});

// =============================================================================
// 酒店模块测试
// =============================================================================

describe('酒店模块', () => {
  describe('POST /hotels', () => {
    it('商户创建酒店', async () => {
      const res = await request({
        method: 'POST',
        url: '/hotels',
        token: tokens.merchant,
        body: {
          nameZh: '新酒店',
          address: '深圳市测试路100号',
          starRating: 5,
          openingDate: '2023-01-01',
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.nameZh).toBe('新酒店');
      expect(res.body.status).toBe('pending');
    });

    it('普通用户无权限', async () => {
      const res = await request({
        method: 'POST',
        url: '/hotels',
        token: tokens.customer,
        body: {
          nameZh: '测试',
          address: '测试',
          starRating: 3,
          openingDate: '2023-01-01',
        },
      });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /hotels', () => {
    it('返回已审核通过的酒店列表', async () => {
      const res = await request({
        method: 'GET',
        url: '/hotels',
      });

      expect(res.status).toBe(200);
      expect(res.body.hotels.length).toBeGreaterThan(0);
    });
  });

  describe('GET /hotels/:id', () => {
    it('返回酒店详情', async () => {
      const res = await request({
        method: 'GET',
        url: `/hotels/${testData.hotel.id}`,
      });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testData.hotel.id);
    });

    it('酒店不存在返回404', async () => {
      const res = await request({
        method: 'GET',
        url: '/hotels/9999',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('PUT /hotels/:id', () => {
    it('商户更新自己的酒店', async () => {
      const res = await request({
        method: 'PUT',
        url: `/hotels/${testData.hotel.id}`,
        token: tokens.merchant,
        body: { nameZh: '更新后的酒店' },
      });

      expect(res.status).toBe(200);
      expect(res.body.nameZh).toBe('更新后的酒店');
    });
  });

  describe('POST /hotels/:id/approve', () => {
    it('管理员审核通过', async () => {
      const res = await request({
        method: 'POST',
        url: `/hotels/${testData.pendingHotel.id}/approve`,
        token: tokens.admin,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
    });

    it('商户无权限', async () => {
      const res = await request({
        method: 'POST',
        url: `/hotels/${testData.pendingHotel.id}/approve`,
        token: tokens.merchant,
      });

      expect(res.status).toBe(403);
    });
  });

  describe('PATCH /hotels/:id/reject', () => {
    it('管理员审核拒绝', async () => {
      const res = await request({
        method: 'PATCH',
        url: `/hotels/${testData.pendingHotel.id}/reject`,
        token: tokens.admin,
        body: { rejectReason: '信息不完整' },
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('rejected');
    });
  });

  describe('PATCH /hotels/:id/offline', () => {
    it('管理员下线酒店', async () => {
      const res = await request({
        method: 'PATCH',
        url: `/hotels/${testData.hotel.id}/offline`,
        token: tokens.admin,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('offline');
    });
  });

  describe('PATCH /hotels/:id/online', () => {
    it('管理员恢复上线', async () => {
      await db
        .update(hotels)
        .set({ status: 'offline' })
        .where(eq(hotels.id, testData.hotel.id));

      const res = await request({
        method: 'PATCH',
        url: `/hotels/${testData.hotel.id}/online`,
        token: tokens.admin,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('approved');
    });
  });

  describe('GET /hotels/admin', () => {
    it('管理员查看所有酒店', async () => {
      const res = await request({
        method: 'GET',
        url: '/hotels/admin',
        token: tokens.admin,
      });

      expect(res.status).toBe(200);
    });

    it('商户无权限', async () => {
      const res = await request({
        method: 'GET',
        url: '/hotels/admin',
        token: tokens.merchant,
      });

      expect(res.status).toBe(403);
    });
  });

  describe('GET /hotels/merchant', () => {
    it('商户查看自己的酒店', async () => {
      const res = await request({
        method: 'GET',
        url: '/hotels/merchant',
        token: tokens.merchant,
      });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /hotels/:id', () => {
    it('管理员软删除酒店', async () => {
      const res = await request({
        method: 'DELETE',
        url: `/hotels/${testData.hotel.id}`,
        token: tokens.admin,
      });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('已删除');
    });
  });
});

// =============================================================================
// 房型模块测试
// =============================================================================

describe('房型模块', () => {
  describe('POST /room-types', () => {
    it('创建房型', async () => {
      const res = await request({
        method: 'POST',
        url: '/room-types',
        token: tokens.merchant,
        body: {
          hotelId: testData.hotel.id,
          name: '豪华间',
          price: '599.00',
          stock: 5,
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('豪华间');
    });
  });

  describe('GET /room-types/:id', () => {
    it('获取房型详情', async () => {
      const res = await request({
        method: 'GET',
        url: `/room-types/${testData.roomType.id}`,
      });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(testData.roomType.id);
    });

    it('房型不存在返回404', async () => {
      const res = await request({
        method: 'GET',
        url: '/room-types/9999',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /room-types/:id', () => {
    it('更新房型', async () => {
      const res = await request({
        method: 'PATCH',
        url: `/room-types/${testData.roomType.id}`,
        token: tokens.merchant,
        body: { price: '499.00' },
      });

      expect(res.status).toBe(200);
      expect(res.body.price).toBe('499.00');
    });
  });

  describe('DELETE /room-types/:id', () => {
    it('删除房型', async () => {
      const res = await request({
        method: 'DELETE',
        url: `/room-types/${testData.roomType.id}`,
        token: tokens.merchant,
      });

      expect(res.status).toBe(200);
    });
  });
});

// =============================================================================
// 优惠模块测试
// =============================================================================

describe('优惠模块', () => {
  describe('POST /promotions', () => {
    it('创建优惠', async () => {
      const res = await request({
        method: 'POST',
        url: '/promotions',
        token: tokens.merchant,
        body: {
          hotelId: testData.hotel.id,
          type: 'direct',
          value: '50.00',
          startDate: '2024-01-01',
          endDate: '2024-12-31',
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.type).toBe('direct');
    });
  });

  describe('GET /promotions', () => {
    it('获取优惠列表', async () => {
      const res = await request({
        method: 'GET',
        url: '/promotions',
      });
      expect(res.status).toBe(200);
    });
  });

  describe('GET /promotions/:id', () => {
    it('获取优惠详情', async () => {
      const res = await request({
        method: 'GET',
        url: `/promotions/${testData.promotion.id}`,
      });

      expect(res.status).toBe(200);
    });

    it('优惠不存在返回404', async () => {
      const res = await request({
        method: 'GET',
        url: '/promotions/9999',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('PATCH /promotions/:id', () => {
    it('更新优惠', async () => {
      const res = await request({
        method: 'PATCH',
        url: `/promotions/${testData.promotion.id}`,
        token: tokens.merchant,
        body: { value: '0.80' },
      });

      expect(res.status).toBe(200);
    });
  });

  describe('DELETE /promotions/:id', () => {
    it('删除优惠', async () => {
      const res = await request({
        method: 'DELETE',
        url: `/promotions/${testData.promotion.id}`,
        token: tokens.merchant,
      });

      expect(res.status).toBe(200);
    });
  });
});

// =============================================================================
// 预订模块测试
// =============================================================================

describe('预订模块', () => {
  describe('POST /bookings', () => {
    it('用户创建预订', async () => {
      const res = await request({
        method: 'POST',
        url: '/bookings',
        token: tokens.customer,
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: testData.roomType.id,
          checkIn: '2024-07-01',
          checkOut: '2024-07-03',
        },
      });

      expect(res.status).toBe(201);
      expect(res.body.status).toBe('pending');
    });

    it('库存不足返回400', async () => {
      await db
        .update(roomTypes)
        .set({ stock: 0 })
        .where(eq(roomTypes.id, testData.roomType.id));

      const res = await request({
        method: 'POST',
        url: '/bookings',
        token: tokens.customer,
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: testData.roomType.id,
          checkIn: '2024-07-01',
          checkOut: '2024-07-03',
        },
      });

      expect(res.status).toBe(400);
    });
  });

  describe('GET /bookings', () => {
    it('用户查看自己的预订', async () => {
      const res = await request({
        method: 'GET',
        url: '/bookings',
        token: tokens.customer,
      });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /bookings/admin', () => {
    it('管理员查看所有预订', async () => {
      const res = await request({
        method: 'GET',
        url: '/bookings/admin',
        token: tokens.admin,
      });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /bookings/merchant', () => {
    it('商户查看自己酒店的预订', async () => {
      const res = await request({
        method: 'GET',
        url: '/bookings/merchant',
        token: tokens.merchant,
      });

      expect(res.status).toBe(200);
    });
  });

  describe('GET /bookings/:id', () => {
    it('用户查看自己的预订详情', async () => {
      const res = await request({
        method: 'GET',
        url: `/bookings/${testData.booking.id}`,
        token: tokens.customer,
      });

      expect(res.status).toBe(200);
    });
  });

  describe('PATCH /bookings/:id/confirm', () => {
    it('商户确认预订', async () => {
      const res = await request({
        method: 'PATCH',
        url: `/bookings/${testData.booking.id}/confirm`,
        token: tokens.merchant,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('confirmed');
    });

    it('非pending状态返回400', async () => {
      await db
        .update(bookings)
        .set({ status: 'confirmed' })
        .where(eq(bookings.id, testData.booking.id));

      const res = await request({
        method: 'PATCH',
        url: `/bookings/${testData.booking.id}/confirm`,
        token: tokens.merchant,
      });

      expect(res.status).toBe(400);
    });
  });

  describe('PATCH /bookings/:id/cancel', () => {
    it('用户取消预订', async () => {
      const res = await request({
        method: 'PATCH',
        url: `/bookings/${testData.booking.id}/cancel`,
        token: tokens.customer,
      });

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('cancelled');
    });
  });

  describe('DELETE /bookings/:id', () => {
    it('管理员删除预订', async () => {
      const res = await request({
        method: 'DELETE',
        url: `/bookings/${testData.booking.id}`,
        token: tokens.admin,
      });

      expect(res.status).toBe(200);
    });
  });
});
