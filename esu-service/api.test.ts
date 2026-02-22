/**
 * 酒店管理系统 API 集成测试
 *
 * 测试策略：
 * - 使用 ts-rest 客户端适配器进行类型安全的 API 测试
 * - 注入测试数据库
 * - 测试完整的 API 流程
 */

import 'dotenv/config';
import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Fastify from 'fastify';
import jwt from '@fastify/jwt';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { initClient } from '@ts-rest/core';

// 导入 ts-rest 契约
import { contract } from 'esu-types';

// 导入真正的路由处理器工厂
import { createRouter } from './router-factory.js';

// 导入数据库 Schema
import { users, hotels, roomTypes, promotions, bookings, relations } from './schema.js';

// =============================================================================
// 测试配置
// =============================================================================

const JWT_SECRET = 'test_secret_key';

// 测试数据库连接
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/db',
});
const db = drizzle({
  client: pool,
  logger: true, // 开发环境启用日志
  relations,
});

// Fastify 应用实例
let app: ReturnType<typeof Fastify>;

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
// ts-rest 测试适配器
// =============================================================================

/**
 * 创建基于 Fastify inject 的 ts-rest 客户端适配器
 *
 * 这个适配器允许我们在不启动实际服务器的情况下，
 * 使用 ts-rest 的类型安全客户端进行 API 测试
 */
const createTestClient = (fastifyApp: ReturnType<typeof Fastify>) => {
  // 导入 ApiFetcher 类型
  type ApiFetcherArgs = {
    route: unknown;
    path: string;
    method: string;
    headers: Record<string, string>;
    body: FormData | URLSearchParams | string | null | undefined;
    rawBody: unknown;
    rawQuery: unknown;
    contentType: string | undefined;
    fetchOptions?: unknown;
    validateResponse?: boolean;
  };

  // 自定义 API fetcher 函数，使用 Fastify 的 inject 方法
  // 符合 ts-rest 的 ApiFetcher 类型签名
  const apiFetcher = async (args: ApiFetcherArgs) => {
    const { path, method, headers, body } = args;

    // 使用 Fastify inject 发送请求
    const response = await fastifyApp.inject({
      method: method as 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH',
      url: path,
      headers,
      body: body ? (typeof body === 'string' ? JSON.parse(body) : body) : undefined,
    });

    // 返回 ts-rest 期望的格式
    return {
      status: response.statusCode,
      body: JSON.parse(response.body || '{}'),
      headers: new Headers({
        'content-type': 'application/json',
      }),
    };
  };

  // 创建 ts-rest 客户端
  // 由于 apiFetcher 符合 ApiFetcher 类型签名，不需要类型断言
  return initClient(contract, {
    baseUrl: 'http://localhost', // 提供 base URL
    api: apiFetcher,
  });
};

// ts-rest 测试客户端类型（从函数返回值推断）
type TsRestClient = ReturnType<typeof createTestClient>;

// ts-rest 测试客户端
let client: TsRestClient;

// =============================================================================
// 辅助函数
// =============================================================================

/** 生成 JWT Token */
const createToken = (id: number, role: string) => {
  return app.jwt.sign({ id, role });
};

/** 创建带认证头的客户端请求选项 */
const authHeaders = (token: string) => ({
  extraHeaders: {
    Authorization: `Bearer ${token}`,
  },
});

/** 清空数据库 */
const cleanDatabase = async () => {
  const dbClient = await pool.connect();
  try {
    await dbClient.query(`
      TRUNCATE TABLE ratings, bookings, promotions, room_types, hotels, users
      RESTART IDENTITY CASCADE
    `);
  } finally {
    dbClient.release();
  }
};

/** 准备测试数据 */
const seedTestData = async () => {
  const hashedPassword = await bcrypt.hash('password123', 10);

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

  if (!admin || !merchant || !customer) throw new Error('get error when seedTestData insert users');

  // 创建酒店
  const [hotel, pendingHotel] = await db
    .insert(hotels)
    .values([
      {
        nameZh: '测试酒店A',
        ownerId: merchant.id,
        address: '北京市测试路1号',
        latitude: 39.9042,
        longitude: 116.4074,
        starRating: 4,
        openingDate: '2020-01-01',
        status: 'approved',
        images: ['https://example.com/hotel-a-1.jpg', 'https://example.com/hotel-a-2.jpg'],
        tags: ['亲子', '商务'],
      },
      {
        nameZh: '待审核酒店',
        ownerId: merchant.id,
        address: '上海市测试路2号',
        latitude: 31.2304,
        longitude: 121.4737,
        starRating: 3,
        openingDate: '2021-01-01',
        status: 'pending',
        images: ['https://example.com/hotel-b-1.jpg'],
        tags: ['度假'],
      },
    ])
    .returning();

  if (!hotel || !pendingHotel) throw new Error('get error when seedTestData hotels');

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

  if (!roomType) throw new Error('get error when seedTestData roomType');

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

  if (!promotion) throw new Error('get error when seedTestData promotion');

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

  if (!booking) throw new Error('get error when eedTestData');

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
  app = Fastify({ logger: false }); // 测试环境禁用日志
  await app.register(jwt, { secret: JWT_SECRET });

  // 注册真正的路由处理器（注入测试数据库）
  const routerPlugin = createRouter(db);
  await app.register(routerPlugin);

  // 创建 ts-rest 测试客户端
  client = createTestClient(app);

  // 准备测试数据
  await cleanDatabase();
  await seedTestData();

  // 生成 Token
  tokens.admin = createToken(testData.admin.id, 'admin');
  tokens.merchant = createToken(testData.merchant.id, 'merchant');
  tokens.customer = createToken(testData.customer.id, 'customer');
});

afterAll(async () => {
  // 先关闭 Fastify 应用
  await app.close();
  // 再关闭数据库连接池
  await pool.end();
});

beforeEach(async () => {
  await cleanDatabase();
  await seedTestData();

  // 重新生成 Token（因为数据已重置）
  tokens.admin = createToken(testData.admin.id, 'admin');
  tokens.merchant = createToken(testData.merchant.id, 'merchant');
  tokens.customer = createToken(testData.customer.id, 'customer');
});

// =============================================================================
// 用户模块测试
// =============================================================================

describe('用户模块', () => {
  describe('POST /users/register', () => {
    it('成功注册新用户', async () => {
      const result = await client.users.register({
        body: {
          username: 'newuser',
          password: 'password123',
          role: 'customer',
          phone: null,
          email: null,
        },
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.body.username).toBe('newuser');
      }
    });
  });

  describe('POST /users/login', () => {
    it('成功登录', async () => {
      const result = await client.users.login({
        body: {
          username: 'customer',
          password: 'password123',
        },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.token).toBeDefined();
        expect(result.body.user.username).toBe('customer');
      }
    });

    it('密码错误返回401', async () => {
      const result = await client.users.login({
        body: {
          username: 'customer',
          password: 'wrongpassword',
        },
      });

      // ts-rest 会将非 2xx 响应视为错误，但这里我们检查状态码
      expect(result.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe('GET /users/me', () => {
    it('获取当前用户信息', async () => {
      const result = await client.users.me({
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.username).toBe('customer');
      }
    });

    it('未登录返回401', async () => {
      const result = await client.users.me({});

      expect(result.status).toBe(401);
    });
  });
});

// =============================================================================
// 酒店模块测试
// =============================================================================

describe('酒店模块', () => {
  describe('POST /hotels', () => {
    it('商户创建酒店', async () => {
      const result = await client.hotels.create({
        body: {
          nameZh: '新酒店',
          nameEn: null,
          address: '深圳市测试路100号',
          latitude: null,
          longitude: null,
          starRating: 5,
          openingDate: '2023-01-01',
          ownerId: testData.merchant.id,
          nearbyAttractions: null,
          images: null,
          facilities: null,
          tags: null,
        },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.body.nameZh).toBe('新酒店');
        expect(result.body.status).toBe('pending');
      }
    });

    it('普通用户无权限', async () => {
      const result = await client.hotels.create({
        body: {
          nameZh: '测试',
          nameEn: null,
          address: '测试',
          latitude: null,
          longitude: null,
          starRating: 3,
          openingDate: '2023-01-01',
          ownerId: testData.customer.id,
          nearbyAttractions: null,
          images: null,
          facilities: null,
          tags: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(403);
    });
  });

  describe('GET /hotels', () => {
    it('返回已审核通过的酒店列表', async () => {
      const result = await client.hotels.list({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.hotels.length).toBeGreaterThan(0);
      }
    });
  });

  describe('GET /hotels/:id', () => {
    it('返回酒店详情', async () => {
      const result = await client.hotels.get({
        params: { id: String(testData.hotel.id) },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.id).toBe(testData.hotel.id);
      }
    });

    it('酒店不存在返回404', async () => {
      const result = await client.hotels.get({
        params: { id: '9999' },
      });

      expect(result.status).toBe(404);
    });
  });

  describe('PUT /hotels/:id', () => {
    it('商户更新自己的酒店', async () => {
      const result = await client.hotels.update({
        params: { id: String(testData.hotel.id) },
        body: { nameZh: '更新后的酒店' },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.nameZh).toBe('更新后的酒店');
      }
    });
  });

  describe('POST /hotels/:id/approve', () => {
    it('管理员审核通过', async () => {
      const result = await client.hotels.approve({
        params: { id: String(testData.pendingHotel.id) },
        body: {},
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.status).toBe('approved');
      }
    });

    it('商户无权限', async () => {
      const result = await client.hotels.approve({
        params: { id: String(testData.pendingHotel.id) },
        body: {},
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(403);
    });
  });

  describe('PUT /hotels/:id/reject', () => {
    it('管理员审核拒绝', async () => {
      const result = await client.hotels.reject({
        params: { id: String(testData.pendingHotel.id) },
        body: { rejectReason: '信息不完整' },
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.status).toBe('rejected');
      }
    });
  });

  describe('PUT /hotels/:id/offline', () => {
    it('管理员下线酒店', async () => {
      const result = await client.hotels.offline({
        params: { id: String(testData.hotel.id) },
        body: {},
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.status).toBe('offline');
      }
    });
  });

  describe('PUT /hotels/:id/online', () => {
    it('管理员恢复上线', async () => {
      await db.update(hotels).set({ status: 'offline' }).where(eq(hotels.id, testData.hotel.id));

      const result = await client.hotels.online({
        params: { id: String(testData.hotel.id) },
        body: {},
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.status).toBe('approved');
      }
    });
  });

  describe('GET /hotels/admin', () => {
    it('管理员查看所有酒店', async () => {
      const result = await client.hotels.adminList({
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(200);
    });

    it('商户无权限', async () => {
      const result = await client.hotels.adminList({
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(403);
    });
  });

  describe('GET /hotels/merchant', () => {
    it('商户查看自己的酒店', async () => {
      const result = await client.hotels.merchantList({
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(200);
    });
  });

  describe('DELETE /hotels/:id', () => {
    it('管理员软删除酒店', async () => {
      const result = await client.hotels.delete({
        params: { id: String(testData.hotel.id) },
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.message).toBe('Deleted');
      }
    });
  });
});

// =============================================================================
// 房型模块测试
// =============================================================================

describe('房型模块', () => {
  describe('POST /room-types', () => {
    it('创建房型', async () => {
      const result = await client.roomTypes.create({
        body: {
          hotelId: testData.hotel.id,
          name: '豪华间',
          price: 599.0,
          stock: 5,
          capacity: null,
          description: null,
        },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.body.name).toBe('豪华间');
      }
    });
  });

  describe('GET /room-types/:id', () => {
    it('获取房型详情', async () => {
      const result = await client.roomTypes.get({
        params: { id: String(testData.roomType.id) },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.id).toBe(testData.roomType.id);
      }
    });

    it('房型不存在返回404', async () => {
      const result = await client.roomTypes.get({
        params: { id: '9999' },
      });

      expect(result.status).toBe(404);
    });
  });

  describe('PUT /room-types/:id', () => {
    it('更新房型', async () => {
      const result = await client.roomTypes.update({
        params: { id: String(testData.roomType.id) },
        body: { price: 499.0 },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.price).toBe(499);
      }
    });
  });

  describe('DELETE /room-types/:id', () => {
    it('删除房型', async () => {
      const result = await client.roomTypes.delete({
        params: { id: String(testData.roomType.id) },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(200);
    });
  });
});

// =============================================================================
// 优惠模块测试
// =============================================================================

describe('优惠模块', () => {
  describe('POST /promotions', () => {
    it('创建优惠', async () => {
      const result = await client.promotions.create({
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: null,
          type: 'direct',
          value: 50.0,
          startDate: '2024-01-01',
          endDate: '2024-12-31',
          description: null,
        },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.body.type).toBe('direct');
      }
    });
  });

  describe('GET /promotions', () => {
    it('获取优惠列表', async () => {
      const result = await client.promotions.list({});

      expect(result.status).toBe(200);
    });
  });

  describe('GET /promotions/:id', () => {
    it('获取优惠详情', async () => {
      const result = await client.promotions.get({
        params: { id: String(testData.promotion.id) },
      });

      expect(result.status).toBe(200);
    });

    it('优惠不存在返回404', async () => {
      const result = await client.promotions.get({
        params: { id: '9999' },
      });

      expect(result.status).toBe(404);
    });
  });

  describe('PUT /promotions/:id', () => {
    it('更新优惠', async () => {
      const result = await client.promotions.update({
        params: { id: String(testData.promotion.id) },
        body: { value: 0.8 },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(200);
    });
  });

  describe('DELETE /promotions/:id', () => {
    it('删除优惠', async () => {
      const result = await client.promotions.delete({
        params: { id: String(testData.promotion.id) },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(200);
    });
  });
});

// =============================================================================
// 预订模块测试
// =============================================================================

describe('预订模块', () => {
  describe('POST /bookings', () => {
    it('用户创建预订', async () => {
      const result = await client.bookings.create({
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: testData.roomType.id,
          checkIn: '2024-07-01',
          checkOut: '2024-07-03',
          promotionId: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.body.status).toBe('pending');
      }
    });

    it('库存不足返回400', async () => {
      await db.update(roomTypes).set({ stock: 0 }).where(eq(roomTypes.id, testData.roomType.id));

      const result = await client.bookings.create({
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: testData.roomType.id,
          checkIn: '2024-07-01',
          checkOut: '2024-07-03',
          promotionId: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(400);
    });
  });

  describe('GET /bookings', () => {
    it('用户查看自己的预订', async () => {
      const result = await client.bookings.list({
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(200);
    });
  });

  describe('GET /bookings/admin', () => {
    it('管理员查看所有预订', async () => {
      const result = await client.bookings.adminList({
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(200);
    });
  });

  describe('GET /bookings/merchant', () => {
    it('商户查看自己酒店的预订', async () => {
      const result = await client.bookings.merchantList({
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(200);
    });
  });

  describe('GET /bookings/:id', () => {
    it('用户查看自己的预订详情', async () => {
      const result = await client.bookings.get({
        params: { id: String(testData.booking.id) },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(200);
    });
  });

  describe('PUT /bookings/:id/confirm', () => {
    it('商户确认预订', async () => {
      const result = await client.bookings.confirm({
        params: { id: String(testData.booking.id) },
        body: {},
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.status).toBe('confirmed');
      }
    });

    it('非pending状态返回400', async () => {
      await db.update(bookings).set({ status: 'confirmed' }).where(eq(bookings.id, testData.booking.id));

      const result = await client.bookings.confirm({
        params: { id: String(testData.booking.id) },
        body: {},
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(400);
    });
  });

  describe('PUT /bookings/:id/cancel', () => {
    it('用户取消预订', async () => {
      const result = await client.bookings.cancel({
        params: { id: String(testData.booking.id) },
        body: {},
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.status).toBe('cancelled');
      }
    });
  });

  describe('DELETE /bookings/:id', () => {
    it('管理员删除预订', async () => {
      const result = await client.bookings.delete({
        params: { id: String(testData.booking.id) },
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(200);
    });
  });
});

// =============================================================================
// 评分模块测试
// =============================================================================

describe('评分模块', () => {
  describe('POST /ratings', () => {
    it('用户创建评分', async () => {
      const result = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 5,
          comment: '非常棒的酒店！',
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.body.score).toBe(5);
        expect(result.body.comment).toBe('非常棒的酒店！');
      }
    });

    it('重复评分返回400', async () => {
      // 先创建一个评分
      await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 4,
          comment: null,
        },
        ...authHeaders(tokens.customer),
      });

      // 再次评分
      const result = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 3,
          comment: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(400);
    });

    it('酒店不存在返回404', async () => {
      const result = await client.ratings.create({
        body: {
          hotelId: 9999,
          score: 5,
          comment: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(404);
    });
  });

  describe('GET /ratings', () => {
    it('获取评分列表', async () => {
      const result = await client.ratings.list({});

      expect(result.status).toBe(200);
    });

    it('按酒店筛选', async () => {
      const result = await client.ratings.list({
        query: { hotelId: testData.hotel.id },
      });

      expect(result.status).toBe(200);
    });
  });

  describe('GET /ratings/:id', () => {
    it('获取评分详情', async () => {
      // 先创建评分
      const createResult = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 4,
          comment: '测试评论',
        },
        ...authHeaders(tokens.customer),
      });

      if (createResult.status === 201) {
        const result = await client.ratings.get({
          params: { id: String(createResult.body.id) },
        });

        expect(result.status).toBe(200);
        if (result.status === 200) {
          expect(result.body.score).toBe(4);
        }
      }
    });

    it('评分不存在返回404', async () => {
      const result = await client.ratings.get({
        params: { id: '9999' },
      });

      expect(result.status).toBe(404);
    });
  });

  describe('PUT /ratings/:id', () => {
    it('用户修改自己的评分', async () => {
      // 先创建评分
      const createResult = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 3,
          comment: '原始评论',
        },
        ...authHeaders(tokens.customer),
      });

      if (createResult.status === 201) {
        const result = await client.ratings.update({
          params: { id: String(createResult.body.id) },
          body: { score: 4, comment: '修改后的评论' },
          ...authHeaders(tokens.customer),
        });

        expect(result.status).toBe(200);
        if (result.status === 200) {
          expect(result.body.score).toBe(4);
          expect(result.body.comment).toBe('修改后的评论');
        }
      }
    });
  });

  describe('DELETE /ratings/:id', () => {
    it('用户删除自己的评分', async () => {
      // 先创建评分
      const createResult = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 2,
          comment: null,
        },
        ...authHeaders(tokens.customer),
      });

      if (createResult.status === 201) {
        const result = await client.ratings.delete({
          params: { id: String(createResult.body.id) },
          ...authHeaders(tokens.customer),
        });

        expect(result.status).toBe(200);
      }
    });
  });
});

// =============================================================================
// 轮播图模块测试
// =============================================================================

describe('轮播图模块', () => {
  describe('GET /carousel', () => {
    it('获取轮播图列表', async () => {
      const result = await client.carousel.list({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        // 测试酒店有图片，应该出现在轮播图中
        expect(result.body.length).toBeGreaterThan(0);
        // 检查返回的数据结构
        expect(result.body[0]).toHaveProperty('hotelId');
        expect(result.body[0]).toHaveProperty('image');
      }
    });

    it('限制返回数量', async () => {
      const result = await client.carousel.list({
        query: { limit: '1' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.length).toBeLessThanOrEqual(1);
      }
    });
  });
});
