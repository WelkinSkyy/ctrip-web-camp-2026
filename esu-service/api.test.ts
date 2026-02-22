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
import * as v from 'valibot';

// 导入 ts-rest 契约
import { contract, HotelWithRelationsSchema, RoomTypeWithDiscountSchema } from 'esu-types';

// 从 Valibot Schema 推断类型
type HotelWithRelations = v.InferOutput<typeof HotelWithRelationsSchema>;
type RoomTypeWithDiscount = v.InferOutput<typeof RoomTypeWithDiscountSchema>;

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

    it('注册用户名已存在返回400', async () => {
      const result = await client.users.register({
        body: {
          username: 'customer', // 使用seedTestData中已存在的用户名
          password: 'password123',
          role: 'customer',
          phone: null,
          email: null,
        },
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('注册密码过短返回400', async () => {
      const result = await client.users.register({
        body: {
          username: 'newuser2',
          password: '123', // 少于6位
          role: 'customer',
          phone: null,
          email: null,
        },
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('注册用户名过短返回400', async () => {
      const result = await client.users.register({
        body: {
          username: 'ab', // 少于3位
          password: 'password123',
          role: 'customer',
          phone: null,
          email: null,
        },
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('注册无效角色返回400', async () => {
      const result = await client.users.register({
        body: {
          username: 'newuser3',
          password: 'password123',
          role: 'invalid_role' as any,
          phone: null,
          email: null,
        },
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('注册时提供邮箱和手机号', async () => {
      const result = await client.users.register({
        body: {
          username: 'newuser4',
          password: 'password123',
          role: 'customer',
          phone: '13800138000',
          email: 'test@example.com',
        },
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.body.phone).toBe('13800138000');
        expect(result.body.email).toBe('test@example.com');
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

    it('用户名不存在返回401', async () => {
      const result = await client.users.login({
        body: {
          username: 'nonexistentuser',
          password: 'password123',
        },
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('登录账号已禁用返回403', async () => {
      // 先禁用账号
      await db.update(users).set({ deletedAt: new Date() }).where(eq(users.username, 'customer'));

      const result = await client.users.login({
        body: {
          username: 'customer',
          password: 'password123',
        },
      });

      expect(result.status).toBe(403);
    });

    it('用户名和密码为空返回400', async () => {
      const result = await client.users.login({
        body: {
          username: '',
          password: '',
        },
      });

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

    it('无效token返回401', async () => {
      const result = await client.users.me({
        ...authHeaders('invalid_token'),
      });

      expect(result.status).toBe(401);
    });

    it('不同角色用户获取自己的信息', async () => {
      // 测试商户
      const merchantResult = await client.users.me({
        ...authHeaders(tokens.merchant),
      });

      expect(merchantResult.status).toBe(200);
      if (merchantResult.status === 200) {
        expect(merchantResult.body.username).toBe('merchant');
        expect(merchantResult.body.role).toBe('merchant');
      }

      // 测试管理员
      const adminResult = await client.users.me({
        ...authHeaders(tokens.admin),
      });

      expect(adminResult.status).toBe(200);
      if (adminResult.status === 200) {
        expect(adminResult.body.username).toBe('admin');
        expect(adminResult.body.role).toBe('admin');
      }
    });

    it('获取用户信息不返回密码', async () => {
      const result = await client.users.me({
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        // 用户类型不包含 password 属性，验证响应中不存在 password
        expect('password' in result.body).toBe(false);
      }
    });
  });
});

// =============================================================================
// 酒店模块测试
// =============================================================================

describe('酒店模块', () => {
  // 补充酒店更新测试 - 在现有测试之后添加
  describe('PUT /hotels - 额外测试', () => {
    it('商户更新不存在的酒店返回404', async () => {
      const result = await client.hotels.update({
        params: { id: '99999' },
        body: { nameZh: '不存在的酒店' },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(404);
    });

    it('商户更新非自己的酒店返回403', async () => {
      // 创建一个属于admin的酒店
      const [hotelForAdmin] = await db
        .insert(hotels)
        .values({
          nameZh: '管理员酒店',
          ownerId: testData.admin.id,
          address: '北京市某处',
          latitude: 39.9042,
          longitude: 116.4074,
          starRating: 5,
          openingDate: '2020-01-01',
          status: 'approved',
        })
        .returning();

      if (!hotelForAdmin) throw new Error('Failed to create hotelForAdmin');

      // 商户尝试更新管理员的酒店
      const result = await client.hotels.update({
        params: { id: String(hotelForAdmin.id) },
        body: { nameZh: '试图修改' },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(403);
    });

    it('管理员更新任何酒店成功', async () => {
      const result = await client.hotels.update({
        params: { id: String(testData.hotel.id) },
        body: { nameZh: '管理员更新酒店' },
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.nameZh).toBe('管理员更新酒店');
      }
    });

    it('更新酒店状态变为pending', async () => {
      // 管理员审核通过后 商户再更新
      await client.hotels.approve({
        params: { id: String(testData.pendingHotel.id) },
        body: {},
        ...authHeaders(tokens.admin),
      });

      // 商户更新自己的酒店
      const result = await client.hotels.update({
        params: { id: String(testData.pendingHotel.id) },
        body: { address: '新地址' },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        // 更新后状态应该变回pending
        expect(result.body.status).toBe('pending');
      }
    });
  });

  // 补充酒店操作测试
  describe('酒店操作 - 额外边界测试', () => {
    it('管理员审核不存在的酒店返回404', async () => {
      const result = await client.hotels.approve({
        params: { id: '99999' },
        body: {},
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(404);
    });

    it('管理员拒绝不存在的酒店返回404', async () => {
      const result = await client.hotels.reject({
        params: { id: '99999' },
        body: { rejectReason: '测试拒绝' },
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(404);
    });

    it('管理员下线不存在的酒店返回404', async () => {
      const result = await client.hotels.offline({
        params: { id: '99999' },
        body: {},
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(404);
    });

    it('管理员上线不存在的酒店返回404', async () => {
      const result = await client.hotels.online({
        params: { id: '99999' },
        body: {},
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(404);
    });

    it('管理员删除不存在的酒店', async () => {
      const result = await client.hotels.delete({
        params: { id: '99999' },
        ...authHeaders(tokens.admin),
      });

      // 可能返回200表示成功或404表示不存在，取决于实现
      expect([200, 404]).toContain(result.status);
    });

    it('商户尝试审核酒店返回403', async () => {
      const result = await client.hotels.approve({
        params: { id: String(testData.pendingHotel.id) },
        body: {},
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(403);
    });

    it('商户尝试拒绝酒店返回403', async () => {
      const result = await client.hotels.reject({
        params: { id: String(testData.pendingHotel.id) },
        body: { rejectReason: '测试' },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(403);
    });

    it('商户尝试下线酒店返回403', async () => {
      const result = await client.hotels.offline({
        params: { id: String(testData.hotel.id) },
        body: {},
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(403);
    });

    it('商户尝试上线酒店返回403', async () => {
      const result = await client.hotels.online({
        params: { id: String(testData.hotel.id) },
        body: {},
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(403);
    });

    it('商户尝试删除酒店返回403', async () => {
      const result = await client.hotels.delete({
        params: { id: String(testData.hotel.id) },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(403);
    });

    it('用户尝试审核酒店返回403', async () => {
      const result = await client.hotels.approve({
        params: { id: String(testData.pendingHotel.id) },
        body: {},
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(403);
    });
  });

  // 补充酒店列表排序测试
  describe('GET /hotels - 排序和分页额外测试', () => {
    it('按评分排序', async () => {
      const result = await client.hotels.list({
        query: { sortBy: 'rating' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200 && result.body.hotels.length > 1) {
        // 验证评分降序排列
        const ratings = result.body.hotels.map((h: HotelWithRelations) => h.averageRating || 0);
        for (let i = 1; i < ratings.length; i++) {
          expect(ratings[i]).toBeLessThanOrEqual(ratings[i - 1]!);
        }
      }
    });

    it('按创建时间排序（默认）', async () => {
      const result = await client.hotels.list({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        // 验证返回了正确的分页结构
        expect(result.body).toHaveProperty('total');
        expect(result.body).toHaveProperty('page');
        expect(result.body).toHaveProperty('hotels');
      }
    });

    it('自定义分页参数', async () => {
      const result = await client.hotels.list({
        query: { page: '2', limit: '5' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.page).toBe(2);
        expect(result.body.hotels.length).toBeLessThanOrEqual(5);
      }
    });

    it('limit为1时返回1条数据', async () => {
      const result = await client.hotels.list({
        query: { limit: '1' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.hotels.length).toBeLessThanOrEqual(1);
      }
    });
  });

  // 补充酒店详情测试
  describe('GET /hotels/:id - 额外测试', () => {
    it('酒店详情包含房型和优惠信息', async () => {
      const result = await client.hotels.get({
        params: { id: String(testData.hotel.id) },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body).toHaveProperty('roomTypes');
        expect(result.body).toHaveProperty('promotions');
        // 响应中包含 ownerId 字段
        expect(result.body).toHaveProperty('ownerId');
      }
    });

    it('软删除的酒店不返回', async () => {
      // 先软删除酒店
      await db.update(hotels).set({ deletedAt: new Date() }).where(eq(hotels.id, testData.hotel.id));

      const result = await client.hotels.get({
        params: { id: String(testData.hotel.id) },
      });

      expect(result.status).toBe(404);
    });
  });

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

    it('商户创建酒店时自动设置ownerId', async () => {
      const result = await client.hotels.create({
        body: {
          nameZh: '商户自己的酒店',
          nameEn: null,
          address: '深圳市测试路200号',
          latitude: null,
          longitude: null,
          starRating: 4,
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
        expect(result.body.ownerId).toBe(testData.merchant.id);
      }
    });

    it('创建酒店时无效的ownerId返回400', async () => {
      const result = await client.hotels.create({
        body: {
          nameZh: '无效owner酒店',
          nameEn: null,
          address: '深圳市测试路300号',
          latitude: null,
          longitude: null,
          starRating: 3,
          openingDate: '2023-01-01',
          ownerId: 99999, // 不存在的用户ID
          nearbyAttractions: null,
          images: null,
          facilities: null,
          tags: null,
        },
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('创建酒店时owner不是商户角色返回400', async () => {
      const result = await client.hotels.create({
        body: {
          nameZh: '无效owner类型酒店',
          nameEn: null,
          address: '深圳市测试路400号',
          latitude: null,
          longitude: null,
          starRating: 3,
          openingDate: '2023-01-01',
          ownerId: testData.customer.id, // customer角色不能作为owner
          nearbyAttractions: null,
          images: null,
          facilities: null,
          tags: null,
        },
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(400);
    });

    it('创建酒店时缺少必填字段返回400', async () => {
      const result = await client.hotels.create({
        body: {
          nameZh: '', // 必填字段为空
          nameEn: null,
          address: '深圳市测试路500号',
          latitude: null,
          longitude: null,
          starRating: 3,
          openingDate: '2023-01-01',
          ownerId: testData.merchant.id,
          nearbyAttractions: null,
          images: null,
          facilities: null,
          tags: null,
        },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('创建酒店时星级超出范围返回400', async () => {
      const result = await client.hotels.create({
        body: {
          nameZh: '星级错误酒店',
          nameEn: null,
          address: '深圳市测试路600号',
          latitude: null,
          longitude: null,
          starRating: 6, // 超出1-5范围
          openingDate: '2023-01-01',
          ownerId: testData.merchant.id,
          nearbyAttractions: null,
          images: null,
          facilities: null,
          tags: null,
        },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('创建酒店时提供完整信息', async () => {
      const result = await client.hotels.create({
        body: {
          nameZh: '完整信息酒店',
          nameEn: 'Complete Info Hotel',
          address: '深圳市测试路700号',
          latitude: 22.5431,
          longitude: 114.0579,
          starRating: 5,
          openingDate: '2023-01-01',
          ownerId: testData.merchant.id,
          nearbyAttractions: ['世界之窗', '欢乐谷'],
          images: ['https://example.com/hotel.jpg'],
          facilities: ['停车场', '游泳池', '健身房'],
          tags: ['豪华', '商务'],
        },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.body.nameEn).toBe('Complete Info Hotel');
        expect(result.body.nearbyAttractions).toEqual(['世界之窗', '欢乐谷']);
        expect(result.body.facilities).toEqual(['停车场', '游泳池', '健身房']);
        expect(result.body.tags).toEqual(['豪华', '商务']);
      }
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

    it('关键词搜索 - 按名称搜索', async () => {
      const result = await client.hotels.list({
        query: { keyword: '测试酒店' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.hotels.length).toBeGreaterThan(0);
        result.body.hotels.forEach((hotel: HotelWithRelations) => {
          expect(hotel.nameZh).toContain('测试酒店');
        });
      }
    });

    it('关键词搜索 - 按地址搜索', async () => {
      const result = await client.hotels.list({
        query: { keyword: '北京' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.hotels.length).toBeGreaterThan(0);
        const found = result.body.hotels.some((h: HotelWithRelations) => h.address.includes('北京'));
        expect(found).toBe(true);
      }
    });

    it('关键词搜索 - 按标签搜索', async () => {
      const result = await client.hotels.list({
        query: { keyword: '亲子' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        const found = result.body.hotels.some((h: HotelWithRelations) => h.tags && h.tags.includes('亲子'));
        expect(found).toBe(true);
      }
    });

    it('关键词搜索 - 多关键词AND逻辑', async () => {
      const result = await client.hotels.list({
        query: { keyword: '北京 商务' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        const hotel = result.body.hotels.find(
          (h: HotelWithRelations) => h.address.includes('北京') && h.tags?.includes('商务'),
        );
        expect(hotel).toBeDefined();
      }
    });

    it('关键词搜索 - 无匹配结果返回空列表', async () => {
      const result = await client.hotels.list({
        query: { keyword: '不存在的酒店名称xyz123' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.hotels).toEqual([]);
        expect(result.body.total).toBe(0);
      }
    });

    it('星级筛选', async () => {
      const result = await client.hotels.list({
        query: { starRating: '4' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        result.body.hotels.forEach((hotel: HotelWithRelations) => {
          expect(hotel.starRating).toBe(4);
        });
      }
    });

    it('星级筛选 - 无匹配返回空列表', async () => {
      const result = await client.hotels.list({
        query: { starRating: '5' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.hotels).toEqual([]);
        expect(result.body.total).toBe(0);
      }
    });

    it('设施筛选', async () => {
      await db
        .update(hotels)
        .set({ facilities: ['停车场', '餐厅', '健身房'] })
        .where(eq(hotels.id, testData.hotel.id));

      const result = await client.hotels.list({
        query: { facilities: ['停车场', '餐厅'] },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.hotels.length).toBeGreaterThan(0);
        result.body.hotels.forEach((hotel: HotelWithRelations) => {
          expect(hotel.facilities).toContain('停车场');
          expect(hotel.facilities).toContain('餐厅');
        });
      }
    });

    it('设施筛选 - 部分匹配', async () => {
      await db
        .update(hotels)
        .set({ facilities: ['停车场'] })
        .where(eq(hotels.id, testData.hotel.id));

      const result = await client.hotels.list({
        query: { facilities: ['停车场', '游泳池'] },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        result.body.hotels.forEach((hotel: HotelWithRelations) => {
          const hasAny = hotel.facilities?.some((f: string) => ['停车场', '游泳池'].includes(f));
          expect(hasAny).toBe(true);
        });
      }
    });

    it('价格区间筛选 - 最低价格', async () => {
      const result = await client.hotels.list({
        query: { priceMin: '300' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        result.body.hotels.forEach((hotel: HotelWithRelations) => {
          const hasRoomInRange = hotel.roomTypes?.some((rt: RoomTypeWithDiscount) => Number(rt.price) >= 300);
          expect(hasRoomInRange).toBe(true);
        });
      }
    });

    it('价格区间筛选 - 最高价格', async () => {
      const result = await client.hotels.list({
        query: { priceMax: '500' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        result.body.hotels.forEach((hotel: HotelWithRelations) => {
          const hasRoomInRange = hotel.roomTypes?.some((rt: RoomTypeWithDiscount) => Number(rt.price) <= 500);
          expect(hasRoomInRange).toBe(true);
        });
      }
    });

    it('价格区间筛选 - 价格区间', async () => {
      const result = await client.hotels.list({
        query: { priceMin: '300', priceMax: '500' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        const found = result.body.hotels.some((h: HotelWithRelations) => h.id === testData.hotel.id);
        expect(found).toBe(true);
      }
    });

    it('价格区间筛选 - 无匹配返回空列表', async () => {
      const result = await client.hotels.list({
        query: { priceMin: '10000' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.hotels).toEqual([]);
        expect(result.body.total).toBe(0);
      }
    });

    it('多条件组合筛选', async () => {
      await db
        .update(hotels)
        .set({ facilities: ['停车场', '餐厅'] })
        .where(eq(hotels.id, testData.hotel.id));

      const result = await client.hotels.list({
        query: {
          keyword: '北京',
          starRating: '4',
          facilities: ['停车场'],
          priceMin: '300',
          priceMax: '500',
        },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.hotels.length).toBeGreaterThan(0);
        const hotel = result.body.hotels[0] as HotelWithRelations;
        expect(hotel.address).toContain('北京');
        expect(hotel.starRating).toBe(4);
        expect(hotel.facilities).toContain('停车场');
      }
    });

    it('分页 - 第一页', async () => {
      const result = await client.hotels.list({
        query: { page: '1', limit: '1' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.hotels.length).toBeLessThanOrEqual(1);
        expect(result.body.page).toBe(1);
      }
    });

    it('分页 - 超出范围返回空列表', async () => {
      const result = await client.hotels.list({
        query: { page: '100', limit: '10' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.hotels).toEqual([]);
        expect(result.body.page).toBe(100);
      }
    });

    it('待审核酒店不在列表中', async () => {
      const result = await client.hotels.list({
        query: { keyword: '待审核' },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        const found = result.body.hotels.some((h: HotelWithRelations) => h.status !== 'approved');
        expect(found).toBe(false);
      }
    });

    it('返回数据包含折扣价格', async () => {
      const result = await client.hotels.list({});

      expect(result.status).toBe(200);
      if (result.status === 200 && result.body.hotels.length > 0) {
        const hotel = result.body.hotels[0] as HotelWithRelations;
        if (hotel.roomTypes && hotel.roomTypes.length > 0) {
          expect(hotel.roomTypes[0]).toHaveProperty('discountedPrice');
        }
      }
    });

    it('地理位置搜索 - 按距离筛选', async () => {
      // 测试酒店位于北京（39.9042, 116.4074）
      // 使用北京坐标搜索，半径 50 公里
      const result = await client.hotels.list({
        query: {
          userLat: '39.9042',
          userLng: '116.4074',
          radius: '50',
        },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        // 应该找到北京的酒店
        expect(result.body.hotels.length).toBeGreaterThan(0);
        // 每个酒店应该有 distance 字段
        result.body.hotels.forEach((hotel: HotelWithRelations) => {
          expect(hotel).toHaveProperty('distance');
          expect(hotel.distance).toBeGreaterThanOrEqual(0);
          expect(hotel.distance).toBeLessThanOrEqual(50);
        });
      }
    });

    it('地理位置搜索 - 半径外无结果', async () => {
      // 测试酒店位于北京（39.9042, 116.4074）
      // 使用上海坐标搜索，半径 1 公里（应该找不到北京的酒店）
      const result = await client.hotels.list({
        query: {
          userLat: '31.2304',
          userLng: '121.4737',
          radius: '1',
        },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        // 北京到上海约 1000+ 公里，1 公里半径内应该没有酒店
        expect(result.body.hotels).toEqual([]);
        expect(result.body.total).toBe(0);
      }
    });

    it('地理位置搜索 - 按距离排序', async () => {
      const result = await client.hotels.list({
        query: {
          userLat: '39.9042',
          userLng: '116.4074',
          radius: '100',
          sortBy: 'distance',
        },
      });

      expect(result.status).toBe(200);
      if (result.status === 200 && result.body.hotels.length > 1) {
        // 验证按距离升序排列
        const distances = result.body.hotels.map((h: HotelWithRelations) => h.distance);
        for (let i = 1; i < distances.length; i++) {
          expect(distances[i]).toBeGreaterThanOrEqual(distances[i - 1]!);
        }
      }
    });

    it('地理位置搜索 - 结合关键词', async () => {
      const result = await client.hotels.list({
        query: {
          userLat: '39.9042',
          userLng: '116.4074',
          radius: '50',
          keyword: '测试',
        },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        // 应该找到符合关键词且在半径内的酒店
        result.body.hotels.forEach((hotel: HotelWithRelations) => {
          expect(hotel.nameZh).toContain('测试');
          expect(hotel.distance).toBeLessThanOrEqual(50);
        });
      }
    });

    it('地理位置搜索 - 无经纬度参数时忽略', async () => {
      // 不提供位置参数，应该返回所有酒店（不计算距离）
      const result = await client.hotels.list({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        // 没有 distance 字段（或为 undefined）
        result.body.hotels.forEach((hotel: HotelWithRelations) => {
          expect(hotel.distance).toBeUndefined();
        });
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

    it('创建房型时酒店不存在返回404', async () => {
      const result = await client.roomTypes.create({
        body: {
          hotelId: 99999,
          name: '测试房型',
          price: 399.0,
          stock: 5,
          capacity: null,
          description: null,
        },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(404);
    });

    it('创建房型时必填字段缺失返回400', async () => {
      const result = await client.roomTypes.create({
        body: {
          hotelId: testData.hotel.id,
          // 缺少 name, price, description, capacity
          price: 399.0,
          stock: 5,
          description: null,
          capacity: null,
        } as any,
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('创建房型时价格低于0返回400', async () => {
      const result = await client.roomTypes.create({
        body: {
          hotelId: testData.hotel.id,
          name: '负价格房型',
          price: -100.0,
          stock: 5,
          description: null,
          capacity: null,
        },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('创建房型时库存为0', async () => {
      const result = await client.roomTypes.create({
        body: {
          hotelId: testData.hotel.id,
          name: '无库存房型',
          price: 199.0,
          stock: 0,
          description: null,
          capacity: null,
        },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.body.stock).toBe(0);
      }
    });

    it('创建房型时提供完整信息', async () => {
      const result = await client.roomTypes.create({
        body: {
          hotelId: testData.hotel.id,
          name: '完整信息房型',
          price: 899.0,
          stock: 10,
          capacity: 2,
          description: '海景房，配备独立阳台',
        },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.body.capacity).toBe(2);
        expect(result.body.description).toBe('海景房，配备独立阳台');
      }
    });

    it('普通用户创建房型返回403', async () => {
      const result = await client.roomTypes.create({
        body: {
          hotelId: testData.hotel.id,
          name: '用户创建房型',
          price: 399.0,
          stock: 5,
          description: null,
          capacity: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(403);
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

    it('获取房型详情包含酒店信息', async () => {
      const result = await client.roomTypes.get({
        params: { id: String(testData.roomType.id) },
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        // 响应中包含 hotelId 字段
        expect(result.body).toHaveProperty('hotelId');
      }
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

    it('更新不存在的房型返回404', async () => {
      const result = await client.roomTypes.update({
        params: { id: '99999' },
        body: { price: 499.0 },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(404);
    });

    it('商户更新非自己酒店的房型返回403', async () => {
      // 创建一个属于另一个商户的酒店和房型
      const [otherMerchant] = await db
        .insert(users)
        .values({
          username: 'othermerchant',
          password: await bcrypt.hash('password123', 10),
          role: 'merchant',
        })
        .returning();

      if (!otherMerchant) throw new Error('Failed to create otherMerchant');

      const [otherHotel] = await db
        .insert(hotels)
        .values({
          nameZh: '其他商户酒店',
          ownerId: otherMerchant.id,
          address: '其他地址',
          starRating: 4,
          openingDate: '2023-01-01',
          status: 'approved',
        })
        .returning();

      if (!otherHotel) throw new Error('Failed to create otherHotel');

      const [otherRoomType] = await db
        .insert(roomTypes)
        .values({
          hotelId: otherHotel.id,
          name: '其他房型',
          price: 500.0,
          stock: 5,
        })
        .returning();

      if (!otherRoomType) throw new Error('Failed to create otherRoomType');

      // 当前商户尝试更新其他商户的房型
      const result = await client.roomTypes.update({
        params: { id: String(otherRoomType.id) },
        body: { price: 100.0 },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(403);
    });

    it('管理员更新房型成功', async () => {
      const result = await client.roomTypes.update({
        params: { id: String(testData.roomType.id) },
        body: { price: 599.0, stock: 15 },
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(200);
      if (result.status === 200) {
        expect(result.body.price).toBe(599);
        expect(result.body.stock).toBe(15);
      }
    });

    it('更新房型时库存为负数返回400', async () => {
      const result = await client.roomTypes.update({
        params: { id: String(testData.roomType.id) },
        body: { stock: -1 },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
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

    it('删除不存在的房型返回404', async () => {
      const result = await client.roomTypes.delete({
        params: { id: '99999' },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(404);
    });

    it('商户删除非自己酒店的房型返回403', async () => {
      // 创建其他商户的房型
      const [otherMerchant] = await db
        .insert(users)
        .values({
          username: 'othermerchant2',
          password: await bcrypt.hash('password123', 10),
          role: 'merchant',
        })
        .returning();

      if (!otherMerchant) throw new Error('Failed to create otherMerchant');

      const [otherHotel] = await db
        .insert(hotels)
        .values({
          nameZh: '其他商户酒店2',
          ownerId: otherMerchant.id,
          address: '其他地址2',
          starRating: 4,
          openingDate: '2023-01-01',
          status: 'approved',
        })
        .returning();

      if (!otherHotel) throw new Error('Failed to create otherHotel');

      const [otherRoomType] = await db
        .insert(roomTypes)
        .values({
          hotelId: otherHotel.id,
          name: '其他房型2',
          price: 500.0,
          stock: 5,
        })
        .returning();

      if (!otherRoomType) throw new Error('Failed to create otherRoomType');

      // 当前商户尝试删除其他商户的房型
      const result = await client.roomTypes.delete({
        params: { id: String(otherRoomType.id) },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(403);
    });

    it('普通用户删除房型返回403', async () => {
      const result = await client.roomTypes.delete({
        params: { id: String(testData.roomType.id) },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(403);
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

    it('创建预订时房型不存在返回404', async () => {
      const result = await client.bookings.create({
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: 99999,
          checkIn: '2024-07-01',
          checkOut: '2024-07-03',
          promotionId: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(404);
    });

    it('创建预订时酒店不存在返回400', async () => {
      const result = await client.bookings.create({
        body: {
          hotelId: 99999,
          roomTypeId: testData.roomType.id,
          checkIn: '2024-07-01',
          checkOut: '2024-07-03',
          promotionId: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(400);
    });

    it('创建预订时酒店未审核返回400', async () => {
      // 创建一个待审核的酒店和房型
      const [pendingHotel] = await db
        .insert(hotels)
        .values({
          nameZh: '待审核酒店2',
          ownerId: testData.merchant.id,
          address: '待审核地址',
          starRating: 4,
          openingDate: '2023-01-01',
          status: 'pending',
        })
        .returning();

      if (!pendingHotel) throw new Error('Failed to create pendingHotel');

      const [pendingRoomType] = await db
        .insert(roomTypes)
        .values({
          hotelId: pendingHotel.id,
          name: '待审核房型',
          price: 399.0,
          stock: 5,
        })
        .returning();

      if (!pendingRoomType) throw new Error('Failed to create pendingRoomType');

      const result = await client.bookings.create({
        body: {
          hotelId: pendingHotel.id,
          roomTypeId: pendingRoomType.id,
          checkIn: '2024-07-01',
          checkOut: '2024-07-03',
          promotionId: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(400);
    });

    it('创建预订时退房日期早于入住日期返回400', async () => {
      const result = await client.bookings.create({
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: testData.roomType.id,
          checkIn: '2024-07-03',
          checkOut: '2024-07-01', // 退房早于入住
          promotionId: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(400);
    });

    it('创建预订时退房日期等于入住日期返回400', async () => {
      const result = await client.bookings.create({
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: testData.roomType.id,
          checkIn: '2024-07-01',
          checkOut: '2024-07-01', // 退房等于入住
          promotionId: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(400);
    });

    it('创建预订时库存不足返回400', async () => {
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

    it('创建预订后库存减1', async () => {
      const originalStock = testData.roomType.stock;

      const result = await client.bookings.create({
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: testData.roomType.id,
          checkIn: '2024-08-01',
          checkOut: '2024-08-03',
          promotionId: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(201);

      // 验证库存已减少
      const updatedRoomType = await db.query.roomTypes.findFirst({
        where: { id: { eq: testData.roomType.id } },
      });
      expect(updatedRoomType?.stock).toBe(originalStock - 1);
    });

    it('创建预订时正确计算总价（天数*单价）', async () => {
      const result = await client.bookings.create({
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: testData.roomType.id,
          checkIn: '2024-09-01',
          checkOut: '2024-09-04', // 3晚
          promotionId: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        // testData.roomType.price = 399, 3晚 = 399 * 3 = 1197
        expect(result.body.totalPrice).toBe(399 * 3);
      }
    });

    it('未登录用户创建预订返回401', async () => {
      const result = await client.bookings.create({
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: testData.roomType.id,
          checkIn: '2024-07-01',
          checkOut: '2024-07-03',
          promotionId: null,
        },
      });

      expect(result.status).toBe(401);
    });

    it('商户创建预订返回403', async () => {
      const result = await client.bookings.create({
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: testData.roomType.id,
          checkIn: '2024-07-01',
          checkOut: '2024-07-03',
          promotionId: null,
        },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(403);
    });

    it('管理员创建预订返回403', async () => {
      const result = await client.bookings.create({
        body: {
          hotelId: testData.hotel.id,
          roomTypeId: testData.roomType.id,
          checkIn: '2024-07-01',
          checkOut: '2024-07-03',
          promotionId: null,
        },
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(403);
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

    it('评分分数为1分', async () => {
      const result = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 1,
          comment: '很差',
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.body.score).toBe(1);
      }
    });

    it('评分不带评论', async () => {
      const result = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 4,
          comment: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(201);
      if (result.status === 201) {
        expect(result.body.comment).toBeNull();
      }
    });

    it('评分分数为0返回400', async () => {
      const result = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 0,
          comment: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('评分分数超过5返回400', async () => {
      const result = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 6,
          comment: null,
        },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBeGreaterThanOrEqual(400);
    });

    it('评分后更新酒店平均评分', async () => {
      // 创建一个新酒店
      const [hotelForRating] = await db
        .insert(hotels)
        .values({
          nameZh: '评分测试酒店',
          ownerId: testData.merchant.id,
          address: '评分测试地址',
          starRating: 4,
          openingDate: '2023-01-01',
          status: 'approved',
        })
        .returning();

      if (!hotelForRating) throw new Error('Failed to create hotelForRating');

      // 创建第一个评分
      await client.ratings.create({
        body: {
          hotelId: hotelForRating.id,
          score: 5,
          comment: '非常好',
        },
        ...authHeaders(tokens.customer),
      });

      // 获取酒店信息，验证平均评分已更新
      const hotelResult = await client.hotels.get({
        params: { id: String(hotelForRating.id) },
      });

      expect(hotelResult.status).toBe(200);
      if (hotelResult.status === 200) {
        expect(hotelResult.body.averageRating).toBe(5);
        expect(hotelResult.body.ratingCount).toBe(1);
      }
    });

    it('商户创建评分返回403', async () => {
      const result = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 4,
          comment: null,
        },
        ...authHeaders(tokens.merchant),
      });

      expect(result.status).toBe(403);
    });

    it('管理员创建评分返回403', async () => {
      const result = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 4,
          comment: null,
        },
        ...authHeaders(tokens.admin),
      });

      expect(result.status).toBe(403);
    });

    it('未登录创建评分返回401', async () => {
      const result = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 4,
          comment: null,
        },
      });

      expect(result.status).toBe(401);
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

    it('用户修改其他用户的评分返回403', async () => {
      // 先创建评分
      const createResult = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 3,
          comment: '其他用户的评分',
        },
        ...authHeaders(tokens.customer),
      });

      // 创建另一个用户
      const [otherCustomer] = await db
        .insert(users)
        .values({
          username: 'othercustomer4',
          password: await bcrypt.hash('password123', 10),
          role: 'customer',
        })
        .returning();

      if (!otherCustomer) throw new Error('Failed to create otherCustomer');

      const otherToken = createToken(otherCustomer.id, 'customer');

      if (createResult.status === 201) {
        // 另一个用户尝试修改评分
        const result = await client.ratings.update({
          params: { id: String(createResult.body.id) },
          body: { score: 5, comment: '试图修改' },
          ...authHeaders(otherToken),
        });

        expect(result.status).toBe(403);
      }
    });

    it('管理员修改评分失败', async () => {
      // 先创建评分
      const createResult = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 3,
          comment: '用户评分',
        },
        ...authHeaders(tokens.customer),
      });

      if (createResult.status === 201) {
        // 管理员修改评分 - 由于contract权限限制为customer，admin无法通过权限检查
        // 所以这个测试改为验证admin不能修改（返回403）
        const result = await client.ratings.update({
          params: { id: String(createResult.body.id) },
          body: { score: 5 },
          ...authHeaders(tokens.admin),
        });

        // 实际上由于权限限制，admin会返回403
        expect(result.status).toBe(403);
      }
    });

    it('更新评分后更新酒店平均评分', async () => {
      // 创建一个新酒店
      const [hotelForRating] = await db
        .insert(hotels)
        .values({
          nameZh: '评分更新测试酒店',
          ownerId: testData.merchant.id,
          address: '评分更新测试地址',
          starRating: 4,
          openingDate: '2023-01-01',
          status: 'approved',
        })
        .returning();

      if (!hotelForRating) throw new Error('Failed to create hotelForRating');

      // 创建第一个评分
      await client.ratings.create({
        body: {
          hotelId: hotelForRating.id,
          score: 3,
          comment: '3分',
        },
        ...authHeaders(tokens.customer),
      });

      // 获取评分
      const ratings = await db.query.ratings.findMany({
        where: { hotelId: { eq: hotelForRating.id } },
      });

      if (!ratings[0]) throw new Error('Failed to find rating');

      // 修改评分
      await client.ratings.update({
        params: { id: String(ratings[0].id) },
        body: { score: 5 },
        ...authHeaders(tokens.customer),
      });

      // 验证酒店平均评分已更新
      const hotelResult = await client.hotels.get({
        params: { id: String(hotelForRating.id) },
      });

      expect(hotelResult.status).toBe(200);
      if (hotelResult.status === 200) {
        expect(hotelResult.body.averageRating).toBe(5);
      }
    });

    it('更新不存在的评分返回404', async () => {
      const result = await client.ratings.update({
        params: { id: '99999' },
        body: { score: 5 },
        ...authHeaders(tokens.customer),
      });

      expect(result.status).toBe(404);
    });

    it('未登录修改评分返回401', async () => {
      // 先创建评分
      const createResult = await client.ratings.create({
        body: {
          hotelId: testData.hotel.id,
          score: 3,
          comment: '测试',
        },
        ...authHeaders(tokens.customer),
      });

      if (createResult.status === 201) {
        const result = await client.ratings.update({
          params: { id: String(createResult.body.id) },
          body: { score: 5 },
        });

        expect(result.status).toBe(401);
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

    it('无图片的酒店不出现', async () => {
      // 创建一个无图片的酒店
      await db.insert(hotels).values({
        nameZh: '无图片酒店',
        ownerId: testData.merchant.id,
        address: '无图片地址',
        starRating: 3,
        openingDate: '2023-01-01',
        status: 'approved',
        images: null,
      });

      const result = await client.carousel.list({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        // 验证无图片的酒店不在列表中
        const hotelIds = result.body.map((item: any) => item.hotelId);
        const hotel = await db.query.hotels.findFirst({
          where: { nameZh: { eq: '无图片酒店' } },
        });
        if (hotel) {
          expect(hotelIds).not.toContain(hotel.id);
        }
      }
    });

    it('未审核通过的酒店不出现', async () => {
      // 创建一个待审核的酒店但有图片
      await db.insert(hotels).values({
        nameZh: '待审核有图酒店',
        ownerId: testData.merchant.id,
        address: '待审核地址',
        starRating: 3,
        openingDate: '2023-01-01',
        status: 'pending',
        images: ['https://example.com/pending.jpg'],
      });

      const result = await client.carousel.list({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        // 验证待审核的酒店不在列表中
        const hotelIds = result.body.map((item: any) => item.hotelId);
        const hotel = await db.query.hotels.findFirst({
          where: { nameZh: { eq: '待审核有图酒店' } },
        });
        if (hotel) {
          expect(hotelIds).not.toContain(hotel.id);
        }
      }
    });

    it('已下线的酒店不出现', async () => {
      // 创建一个已下线的酒店但有图片
      await db.insert(hotels).values({
        nameZh: '已下线有图酒店',
        ownerId: testData.merchant.id,
        address: '已下线地址',
        starRating: 3,
        openingDate: '2023-01-01',
        status: 'offline',
        images: ['https://example.com/offline.jpg'],
      });

      const result = await client.carousel.list({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        // 验证已下线的酒店不在列表中
        const hotelIds = result.body.map((item: any) => item.hotelId);
        const hotel = await db.query.hotels.findFirst({
          where: { nameZh: { eq: '已下线有图酒店' } },
        });
        if (hotel) {
          expect(hotelIds).not.toContain(hotel.id);
        }
      }
    });

    it('软删除的酒店不出现', async () => {
      // 创建一个软删除的酒店但有图片
      const [softDeletedHotel] = await db
        .insert(hotels)
        .values({
          nameZh: '软删除有图酒店',
          ownerId: testData.merchant.id,
          address: '软删除地址',
          starRating: 3,
          openingDate: '2023-01-01',
          status: 'approved',
          images: ['https://example.com/deleted.jpg'],
        })
        .returning();

      if (!softDeletedHotel) throw new Error('Failed to create softDeletedHotel');

      // 软删除
      await db.update(hotels).set({ deletedAt: new Date() }).where(eq(hotels.id, softDeletedHotel.id));

      const result = await client.carousel.list({});

      expect(result.status).toBe(200);
      if (result.status === 200) {
        const hotelIds = result.body.map((item: any) => item.hotelId);
        expect(hotelIds).not.toContain(softDeletedHotel.id);
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
