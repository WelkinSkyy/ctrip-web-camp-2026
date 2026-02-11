
/**
 * 以下是基于用户提供的原始API定义、JSON Schema和项目需求（酒店预订平台）生成的完整后端定义。
 * 我已酌情修改和补全原始API，包括：
 * - 修正原始Schema中的错误（如Promotion的标题错误，实际为RoomType Schema；Room Schema中promotions应为array<string>引用Promotion.id）。
 * - 增加预订系统（Booking相关表和API）：用户端可创建预订、查看预订列表；商户/管理员可管理预订。
 * - 补全权限系统：基于RBAC0（Role-Based Access Control Level 0），角色包括customer（用户）、merchant（商户）、admin（管理员）。
 *   - 用户表中role为数组，支持多角色（虽常见为单角色，但保留原始设计）。
 *   - 每个API指定Permission（允许角色），后端需检查token中的角色。
 *   - 未添加单独权限表（RBAC0不强制），权限通过角色硬编码在API中实现。
 * - 其他补全：添加商户酒店列表API、优惠关联到房型/酒店、库存检查在预订时、实时价格更新机制（通过Promotion计算折扣价）。
 * - 数据库：使用PostgreSQL假设，drizzle-orm定义表，支持软删除（deletedAt）。
 * - 类型：使用Valibot定义Request/Response schemas，整合到ts-rest合约中。
 * - 注释：详尽中文注释，覆盖描述、约束、关系。
 * - 技术假设：Node.js后端，JWT token认证，数据库如PostgreSQL。
 */

// 1. 数据库表定义 (drizzle-orm格式)
// 导入drizzle-orm必要模块（假设环境已配置）
import { pgTable, serial, text, varchar, integer, numeric, timestamp, date, pgEnum, unique, uniqueIndex, foreignKey } from 'drizzle-orm/pg-core';
import { defineRelations } from 'drizzle-orm';

const hotelStatus = ['pending', 'approved', 'rejected', 'offline'] as const;

const bookingStatus = ['pending', 'confirmed', 'cancelled', 'completed'] as const;

const promotionType = ['direct', 'percentage', 'spend_and_save'] as const;

// 枚举定义：酒店状态
const hotelStatusEnum = pgEnum('hotel_status', hotelStatus);

// 枚举定义：预订状态
const bookingStatusEnum = pgEnum('booking_status', bookingStatus);

// 枚举定义：优惠类型（新增：折扣、套餐等）
const promotionTypeEnum = pgEnum('promotion_type', promotionType);

const timestamps = () => ({
  createdAt: timestamp().defaultNow().notNull(), // 创建时间
  updatedAt: timestamp().defaultNow().notNull(), // 更新时间
  deletedAt: timestamp(), // 软删除时间
});

// 用户表：存储用户信息，支持多角色（RBAC0基础）
export const users = pgTable('users', {
  id: serial().primaryKey(), // 自增主键
  username: varchar({ length: 50 }).notNull().unique(), // 用户名，唯一
  password: varchar({ length: 100 }).notNull(), // 加密密码
  phone: varchar({ length: 20 }), // 手机号，可选
  email: varchar({ length: 100 }), // 邮箱，可选
  ...timestamps()
});

// 酒店表：存储酒店信息
export const hotels = pgTable('hotels', {
  id: serial().primaryKey(), // 自增主键
  nameZh: varchar({ length: 50 }).unique().notNull(), // 酒店中文名
  nameEn: varchar({ length: 100 }), // 酒店英文名
  ownerId: integer().notNull(),// 所属商户ID，外键引用users
  address: text().notNull(), // 地址
  starRating: integer().notNull(), // 星级，1-5
  openingDate: date().notNull(), // 开业时间（日期）
  nearbyAttractions: varchar({ length: 50 }).array(), // 附近景点数组
  images: text().array(), // 图片URL数组
  facilities: varchar({ length: 50 }).array(), // 设施数组
  status: hotelStatusEnum(), // 状态，默认审核中
  statusDescription: text(), // 状态说明（如拒绝原因）
  ...timestamps()
});

// 房型表：酒店下的房型（RoomType更准确，修正原始Room为RoomType）
export const roomTypes = pgTable('room_types', {
  id: serial().primaryKey(),
  hotelId: integer().notNull(), // 所属酒店，外键
  name: varchar({ length: 100 }).notNull(), // 房型名
  price: numeric({ precision: 10, scale: 2 }).notNull(), // 基础价格
  stock: integer().notNull().default(0), // 库存
  capacity: integer().default(1), // 容纳人数，默认1
  description: text(), // 描述
  ...timestamps()
});

// 优惠表：关联酒店或房型，支持类型（如折扣率）
export const promotions = pgTable('promotions', {
  id: serial().primaryKey(),
  ownerId: integer(),
  hotelId: integer(), // 可关联酒店，外键可选
  roomTypeId: integer(), // 可关联房型，外键可选
  type: promotionTypeEnum().notNull().default('direct'), // 优惠类型
  value: numeric({ precision: 5, scale: 2 }).notNull(), // 值，如折扣率0.8
  startDate: date().notNull(), // 开始日期
  endDate: date().notNull(), // 结束日期
  description: text(), // 描述，如“节日8折”
  ...timestamps()
});

export const roomTypePromotion = pgTable('promotions', {
  id: serial().primaryKey(),
  roomTypeId: integer().notNull(),
  promotionId: integer().notNull(),
  ...timestamps()
})

// 预订表：用户预订记录（新增预订系统）
export const bookings = pgTable('bookings', {
  id: serial().primaryKey(),
  userId: integer().notNull(), // 预订用户，外键
  hotelId: integer().notNull(), // 酒店，外键
  roomTypeId: integer().notNull(), // 房型，外键
  checkIn: date().notNull(), // 入住日期
  checkOut: date().notNull(), // 离店日期
  totalPrice: numeric({ precision: 2, scale: 8 }).notNull(), // 总价（计算后）
  status: bookingStatusEnum().notNull().default('pending'), // 状态，默认待确认
  promotionId: integer(), // 应用的优惠，可选
  ...timestamps()
});

const relations = defineRelations({ users, hotels, roomTypes, promotions, roomTypePromotion, bookings }, r => ({
  users: {
    hotels: r.many.hotels(),
    bookings: r.many.bookings(),
    promotions: r.many.promotions()
  },
  hotels: {
    owner: r.one.users({
      from: r.hotels.ownerId,
      to: r.users.id
    }),
    roomTypes: r.many.roomTypes(),
    promotions: r.many.promotions(),
    bookings: r.many.bookings()
  },
  roomTypes: {
    hotel: r.one.hotels({
      from: r.roomTypes.hotelId,
      to: r.hotels.id
    }),
    bookings: r.many.bookings(),
    promotionsId: r.many.roomTypePromotion()
  },
  promotions: {
    hotel: r.one.hotels({
      from: r.promotions.hotelId,
      to: r.hotels.id
    }),
    owner: r.one.users({
      from: r.promotions.ownerId,
      to: r.users.id
    }),
    roomTypesId: r.many.roomTypePromotion()
  },
  roomTypePromotion: {
    roomType: r.one.roomTypes({
      from: r.roomTypePromotion.roomTypeId,
      to: r.roomTypes.id
    }),
    promotion: r.one.promotions({
      from: r.roomTypePromotion.promotionId,
      to: r.promotions.id
    })
  },
  bookings: {
    user: r.one.users({
      from: r.bookings.userId,
      to: r.users.id
    }),
    hotel: r.one.hotels({
      from: r.bookings.hotelId,
      to: r.hotels.id
    }),
    roomType: r.one.roomTypes({
      from: r.bookings.roomTypeId,
      to: r.roomTypes.id
    }),
    promotion: r.one.promotions({
      from: r.bookings.promotionId,
      to: r.promotions.id
    })
  }
}));

// 2. 类型定义 (Valibot schemas)
// 导入Valibot（假设环境已安装）
import * as v from 'valibot';

const vTimestamps = () => ({
  createdAt: v.pipe(v.string(), v.isoTimestamp('无效日期')), // 创建时间
  updatedAt: v.pipe(v.string(), v.isoTimestamp('无效日期')), // 更新时间
  deletedAt: v.optional(v.pipe(v.string(), v.isoTimestamp('无效日期'))), // 更新时间
})

const ParamIdSchema = v.pipe(v.string(), v.toNumber(), v.integer());

// 用户Schema（基于原始，移除password在响应中）
const UserSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1, 'ID不能为空')), // 用户ID
  username: v.pipe(v.string(), v.minLength(3, '用户名至少3字符'), v.maxLength(50, '用户名最多50字符')), // 用户名
  password: v.pipe(v.string(), v.minLength(6, '密码至少6位')),
  phone: v.optional(v.pipe(v.string(), v.minLength(6, '手机号至少6位'))), // 手机号，可选
  email: v.optional(v.pipe(v.string(), v.email('无效邮箱'))), // 邮箱，可选
  ...vTimestamps()
});

// 用户响应Schema（无password）
const UserResponseSchema = v.omit(UserSchema, ['password']);

// 用户注册Request Schema（无ID、时间，password明文）
const UserRegisterRequestSchema = v.omit(UserSchema, ['id', 'createdAt', 'updatedAt', 'deletedAt']);

const UserRegisterResponseSchema = v.omit(UserSchema, ["password"]);

const UserLoginRequestSchema = v.pick(UserSchema, ['username', 'password']);

const UserLoginResponseSchema = v.object({
  token: v.string(),
  user: UserResponseSchema
})

// 酒店Schema（基于原始，rooms改为roomTypes array）
const HotelSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1, 'ID不能为空')), // 酒店ID
  nameZh: v.pipe(v.string(), v.minLength(1, '中文名不能为空')), // 中文名
  nameEn: v.optional(v.string()), // 英文名，可选
  ownerId: v.pipe(v.number(), v.integer(), v.minValue(1, 'ID不能为空')), // 所属商户ID
  address: v.pipe(v.string(), v.minLength(1)), // 地址
  starRating: v.pipe(v.number(), v.integer(), v.minValue(1, '星级至少1'), v.maxValue(5, '星级最多5')), // 星级
  openingDate: v.pipe(v.string(), v.isoDate('无效开业日期')), // 开业日期
  nearbyAttractions: v.optional(v.array(v.pipe(v.string(), v.minLength(1, '最少输入一个字符'), v.maxLength(50, '最多输入50个字符')))), // 附近景点
  images: v.optional(v.array(v.pipe(v.string(), v.url('无效URL')))), // 图片
  facilities: v.optional(v.array(v.pipe(v.string(), v.minLength(1, '最少输入一个字符'), v.maxLength(50, '最多输入50个字符')))), // 附近景点
  status: v.picklist(hotelStatus, '无效状态'), // 状态
  statusDescription: v.optional(v.string()), // 状态说明
  ...vTimestamps()
});

// 酒店创建/更新 Partial Schema
const PartialHotelSchema = v.partial(HotelSchema);

const HotelCreateRequestSchema = v.omit(HotelSchema, ['id', 'createdAt', 'updatedAt', 'status']);

const HotelListRequestSchema = v.object({
  keyword: v.optional(v.string()), // 关键字
  checkIn: v.optional(v.pipe(v.string(), v.isoDate())),
  checkOut: v.optional(v.pipe(v.string(), v.isoDate())),
  starRating: v.optional(v.pipe(v.number(), v.integer())),
  facilities: v.optional(v.array(v.string())),
  priceMin: v.optional(v.number()),
  priceMax: v.optional(v.number()),
  page: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  limit: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
}); // Request query: 筛选参数，支持分页
const HotelListResponseSchema = v.object({ hotels: v.array(HotelSchema), total: v.number(), page: v.number() });

const HotelAdminListRequestSchema = v.object({
  status: v.optional(HotelSchema.entries.status),
  page: v.optional(v.number()),
  limit: v.optional(v.number()),
});

// 房型Schema（基于原始Promotion Schema修正为RoomType）
const RoomTypeSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1, 'ID不能为空')),
  hotelId: v.pipe(v.number(), v.integer(), v.minValue(1, 'ID不能为空')),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  price: v.pipe(v.number(), v.minValue(0, '价格不能为负')),
  stock: v.pipe(v.number(), v.integer(), v.minValue(0, '库存不能为负')),
  capacity: v.optional(v.pipe(v.number(), v.integer(), v.minValue(1))),
  description: v.optional(v.string()),
  ...vTimestamps()
});

// 房型创建/更新 Partial
const PartialRoomTypeSchema = v.partial(RoomTypeSchema);

// 优惠Schema（基于原始Room Schema修正，添加type/value）
const PromotionSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1)),
  ownerId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  hotelId: v.optional(v.pipe(v.number(), v.integer())),
  roomTypeId: v.optional(v.pipe(v.number(), v.integer())),
  type: v.picklist(promotionType, '无效优惠类型'),
  value: v.number(), // 如折扣0.8
  startDate: v.pipe(v.string(), v.isoDate()),
  endDate: v.pipe(v.string(), v.isoDate()),
  description: v.optional(v.string()),
  ...vTimestamps()
});

// 优惠创建/更新 Partial
const PartialPromotionSchema = v.partial(PromotionSchema);

// 预订Schema（新增）
const BookingSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1)),
  userId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  hotelId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  roomTypeId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  checkIn: v.pipe(v.string(), v.isoDate()),
  checkOut: v.pipe(v.string(), v.isoDate()),
  totalPrice: v.pipe(v.number(), v.minValue(0)),
  status: v.picklist(bookingStatus, '无效预订状态'),
  promotionId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  ...vTimestamps()
});

// 预订创建 Schema（无ID、时间、status默认pending）
const BookingCreateSchema = v.omit(BookingSchema, ['id', 'createdAt', 'updatedAt', 'deletedAt', 'status', 'totalPrice']); // totalPrice后端计算

const BookingListRequestSchema = v.object({
  status: v.optional(v.picklist(bookingStatus)),
  page: v.optional(v.number()),
  limit: v.optional(v.number()),
});

const BookingListResponseSchema = v.object({
  bookings: v.array(BookingSchema),
  total: v.number(),
  page: v.number()
});

const BookingAdminListRequestSchema = v.object({
  hotelId: v.optional(v.string()),
  status: v.optional(v.picklist(bookingStatus)),
  page: v.optional(v.number()),
  limit: v.optional(v.number()),
});

// 3. API定义 (ts-rest格式，整合Valibot schemas)
// 导入ts-rest（假设环境已安装）
import { initContract } from '@ts-rest/core';
const c = initContract();

export const usersContract = c.router({
  register: {
    method: 'POST',
    path: '/users/register',
    body: UserRegisterRequestSchema, // Request body: 用户注册数据
    responses: {
      201: UserRegisterResponseSchema, // Response: 新用户基本信息
    },
    summary: '用户注册，选择角色（后端加密password）',
    metadata: { permission: null }, // Permission: 无需认证
  },
  login: {
    method: 'POST',
    path: '/users/login',
    body: UserLoginRequestSchema, // Request: 登录凭证
    responses: {
      200: UserLoginResponseSchema, // Response: token和用户信息
    },
    summary: '用户登录，自动判断角色，返回JWT token',
    metadata: { permission: null },
  },
  me: {
    method: 'GET',
    path: '/users/me',
    responses: {
      200: UserResponseSchema, // Response: 当前用户信息
    },
    summary: '获取当前登录用户信息（需token）',
    metadata: { permission: ['customer', 'merchant', 'admin'] }, // Permission: 所有角色
  },
});

export const hotelsContract = c.router({
  create: {
    method: 'POST',
    path: '/hotels',
    body: HotelCreateRequestSchema, // Request: 创建数据（status默认pending，ownerId从token获取）
    responses: {
      201: HotelSchema, // Response: 新酒店
    },
    summary: '创建酒店（商户自动ownerId，管理员指定）',
    metadata: { permission: ['merchant', 'admin'] },
  },
  list: {
    method: 'GET',
    path: '/hotels',
    query: HotelListRequestSchema, // Request query: 筛选参数，支持分页
    responses: {
      200: HotelListResponseSchema, // Response: 酒店列表（populate roomTypes，按价格排序）
    },
    summary: '用户端酒店列表（支持筛选、上滑加载，价格考虑优惠实时计算）',
    metadata: { permission: null },
  },
  get: {
    method: 'GET',
    path: '/hotels/:id',
    pathParams: v.object({ id: ParamIdSchema }), // Request params: ID
    responses: {
      200: HotelSchema, // Response: 酒店详情（populate roomTypes和promotions，按价格低到高）
    },
    summary: '酒店详情',
    metadata: { permission: null },
  },
  update: {
    method: 'PUT',
    path: '/hotels/:id',
    pathParams: v.object({ id: ParamIdSchema }),
    body: v.partial(HotelSchema), // Request body: 部分更新
    responses: {
      200: HotelSchema,
    },
    summary: '编辑酒店（商户仅自己的，pending/rejected可编，admin无限）',
    metadata: { permission: ['merchant', 'admin'] },
  },
  approve: {
    method: 'POST',
    path: '/hotels/:id/approve',
    body: v.any(),
    pathParams: v.object({ id: ParamIdSchema }),
    responses: {
      200: HotelSchema,
    },
    summary: '管理员审核通过（status → approved）',
    metadata: { permission: ['admin'] },
  },
  reject: {
    method: 'PATCH',
    path: '/hotels/:id/reject',
    pathParams: v.object({ id: ParamIdSchema }),
    body: v.object({ rejectReason: v.string() }), // Request: 拒绝原因
    responses: {
      200: HotelSchema,
    },
    summary: '管理员审核不通过',
    metadata: { permission: ['admin'] },
  },
  offline: {
    method: 'PATCH',
    path: '/hotels/:id/offline',
    body: v.any(),
    pathParams: v.object({ id: ParamIdSchema }),
    responses: {
      200: HotelSchema,
    },
    summary: '管理员下线（status → offline，可恢复）',
    metadata: { permission: ['admin'] },
  },
  online: {
    method: 'PATCH',
    path: '/hotels/:id/online',
    body: v.any(),
    pathParams: v.object({ id: ParamIdSchema }),
    responses: {
      200: HotelSchema,
    },
    summary: '管理员恢复上线（status → approved）',
    metadata: { permission: ['admin'] },
  },
  adminList: {
    method: 'GET',
    path: '/hotels/admin',
    query: HotelAdminListRequestSchema,
    responses: {
      200: HotelListResponseSchema,
    },
    summary: '管理员酒店列表（支持状态过滤）',
    metadata: { permission: ['admin'] },
  },
  merchantList: {
    method: 'GET',
    path: '/hotels/merchant',
    query: v.object({
      page: v.optional(v.number()),
      limit: v.optional(v.number()),
    }),
    responses: {
      200: v.object({ hotels: v.array(HotelSchema), total: v.number() }),
    },
    summary: '商户自己的酒店列表（新增）',
    metadata: { permission: ['merchant'] },
  },
  delete: {
    method: 'DELETE',
    path: '/hotels/:id',
    pathParams: v.object({ id: v.string() }),
    responses: {
      200: v.object({ message: v.literal('Deleted') }),
    },
    summary: '删除酒店（软删除，仅admin）',
    metadata: { permission: ['admin'] },
  },
});

export const roomTypesContract = c.router({
  create: {
    method: 'POST',
    path: '/room-types',
    body: v.omit(RoomTypeSchema, ['id', 'createdAt', 'updatedAt', 'deletedAt']), // Request: 创建数据
    responses: {
      201: RoomTypeSchema,
    },
    summary: '创建房型（关联酒店，商户/admin）',
    metadata: { permission: ['merchant', 'admin'] },
  },
  get: {
    method: 'GET',
    path: '/room-types/:id',
    pathParams: v.object({ id: ParamIdSchema }),
    responses: {
      200: RoomTypeSchema,
    },
    summary: '获取单个房型',
    metadata: { permission: null },
  },
  update: {
    method: 'PATCH',
    path: '/room-types/:id',
    pathParams: v.object({ id: ParamIdSchema }),
    body: PartialRoomTypeSchema,
    responses: {
      200: RoomTypeSchema,
    },
    summary: '更新房型（价格等，商户/admin）',
    metadata: { permission: ['merchant', 'admin'] },
  },
  delete: {
    method: 'DELETE',
    path: '/room-types/:id',
    pathParams: v.object({ id: ParamIdSchema }),
    responses: {
      200: v.object({ message: v.literal('Deleted') }),
    },
    summary: '删除房型（商户/admin）',
    metadata: { permission: ['merchant', 'admin'] },
  },
});

export const promotionsContract = c.router({
  create: {
    method: 'POST',
    path: '/promotions',
    body: v.omit(PromotionSchema, ['id', 'createdAt', 'updatedAt', 'deletedAt']),
    responses: {
      201: PromotionSchema,
    },
    summary: '创建优惠（关联酒店/房型）',
    metadata: { permission: ['merchant', 'admin'] },
  },
  list: {
    method: 'GET',
    path: '/promotions',
    query: v.object({
      hotelId: v.optional(v.string()),
      roomTypeId: v.optional(v.string()),
    }),
    responses: {
      200: v.array(PromotionSchema),
    },
    summary: '优惠列表（可过滤）',
    metadata: { permission: null },
  },
  get: {
    method: 'GET',
    path: '/promotions/:id',
    pathParams: v.object({ id: ParamIdSchema }),
    responses: {
      200: PromotionSchema,
    },
    summary: '获取单个优惠',
    metadata: { permission: '无' },
  },
  update: {
    method: 'PATCH',
    path: '/promotions/:id',
    pathParams: v.object({ id: ParamIdSchema }),
    body: PartialPromotionSchema,
    responses: {
      200: PromotionSchema,
    },
    summary: '更新优惠',
    metadata: { permission: ['merchant', 'admin'] },
  },
  delete: {
    method: 'DELETE',
    path: '/promotions/:id',
    pathParams: v.object({ id: ParamIdSchema }),
    responses: {
      200: v.object({ message: v.literal('Deleted') }),
    },
    summary: '删除优惠',
    metadata: { permission: ['merchant', 'admin'] },
  },
});

export const bookingsContract = c.router({
  create: {
    method: 'POST',
    path: '/bookings',
    body: BookingCreateSchema, // Request: 预订数据（后端检查库存、计算totalPrice考虑优惠）
    responses: {
      201: BookingSchema,
    },
    summary: '创建预订（用户端，检查库存减1，计算价格）',
    metadata: { permission: ['customer'] },
  },
  list: {
    method: 'GET',
    path: '/bookings',
    query: BookingListRequestSchema,
    responses: {
      200: BookingListResponseSchema,
    },
    summary: '用户自己的预订列表',
    metadata: { permission: ['customer'] },
  },
  adminList: {
    method: 'GET',
    path: '/bookings/admin',
    query: BookingAdminListRequestSchema,
    responses: {
      200: BookingListResponseSchema,
    },
    summary: '管理员预订列表（所有）',
    metadata: { permission: ['admin'] },
  },
  merchantList: {
    method: 'GET',
    path: '/bookings/merchant',
    query: BookingAdminListRequestSchema,
    responses: {
      200: BookingListResponseSchema,
    },
    summary: '商户预订列表（自己的酒店）',
    metadata: { permission: ['merchant'] },
  },
  get: {
    method: 'GET',
    path: '/bookings/:id',
    pathParams: v.object({ id: ParamIdSchema }),
    responses: {
      200: BookingSchema,
    },
    summary: '获取单个预订详情（用户/商户/admin根据权限）',
    metadata: { permission: ['customer', 'merchant', 'admin'] },
  },
  confirm: {
    method: 'PATCH',
    path: '/bookings/:id/confirm',
    body: v.any(),
    pathParams: v.object({ id: v.string() }),
    responses: {
      200: BookingSchema,
    },
    summary: '确认预订（商户/admin，status → confirmed）',
    metadata: { permission: ['merchant', 'admin'] },
  },
  cancel: {
    method: 'PATCH',
    path: '/bookings/:id/cancel',
    body: v.any(),
    pathParams: v.object({ id: v.string() }),
    responses: {
      200: BookingSchema,
    },
    summary: '取消预订（用户/商户/admin，恢复库存，status → cancelled）',
    metadata: { permission: ['customer', 'merchant', 'admin'] },
  },
  delete: {
    method: 'DELETE',
    path: '/bookings/:id',
    pathParams: v.object({ id: v.string() }),
    responses: {
      200: v.object({ message: v.literal('Deleted') }),
    },
    summary: '删除预订（软删除，仅admin）',
    metadata: { permission: ['admin'] },
  },
});

// 完整API合约
export const contract = c.router({
  // 用户相关 API
  users: usersContract,
  // 酒店相关 API
  hotels: hotelsContract,
  // 房型相关 API（修正为roomTypes）
  roomTypes: roomTypesContract,
  // 优惠相关 API
  promotions: promotionsContract,
  // 预订相关 API（新增预订系统）
  bookings: bookingsContract,
});
