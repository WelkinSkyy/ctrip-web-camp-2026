
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

export const hotelStatus = ['pending', 'approved', 'rejected', 'offline'] as const;

export const bookingStatus = ['pending', 'confirmed', 'cancelled', 'completed'] as const;

export const promotionType = ['direct', 'percentage', 'spend_and_save'] as const;

export const roleType = ['customer', 'merchant', 'admin'] as const;

// 2. 类型定义 (Valibot schemas)
// 导入Valibot（假设环境已安装）
import * as v from 'valibot';

// 通用错误响应 Schema
export const ErrorResponseSchema = v.object({
  message: v.string(),
});

// 使用 Valibot 实现泛型错误 Schema
// 格式：StatusError(400)、StatusError(401) 等
const BaseErrorSchema = v.object({ message: v.string() });

export const StatusError = <const T extends number>(status: T) => BaseErrorSchema;

// 通用错误响应定义（用于 ts-rest commonResponses）
export const CommonResponseErrors = {
  400: StatusError(400),
  401: StatusError(401),
  403: StatusError(403),
  404: StatusError(404),
  500: StatusError(500),
};

export const vTimestamps = () => ({
  createdAt: v.date('无效日期'), // 创建时间
  updatedAt: v.date('无效日期'), // 更新时间
  deletedAt: v.nullable(v.date('无效日期')), // 更新时间
})

export const ParamIdSchema = v.pipe(v.string(), v.toNumber(), v.integer());

// 用户Schema（基于原始，移除password在响应中）
export const UserSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1, 'ID不能为空')), // 用户ID
  username: v.pipe(v.string(), v.minLength(3, '用户名至少3字符'), v.maxLength(50, '用户名最多50字符')), // 用户名
  password: v.pipe(v.string(), v.minLength(6, '密码至少6位')),
  role: v.picklist(roleType, '无效角色'),
  phone: v.nullable(v.pipe(v.string(), v.minLength(6, '手机号至少6位'))), // 手机号，可选
  email: v.nullable(v.pipe(v.string(), v.email('无效邮箱'))), // 邮箱，可选
  ...vTimestamps()
});

export const JwtSchema = v.pick(UserSchema, ['id', 'role']);

// 用户响应Schema（无password）
export const UserResponseSchema = v.omit(UserSchema, ['password']);

// 用户注册Request Schema（无ID、时间，password明文）
export const UserRegisterRequestSchema = v.omit(UserSchema, ['id', 'createdAt', 'updatedAt', 'deletedAt']);

export const UserRegisterResponseSchema = v.omit(UserSchema, ["password"]);

export const UserLoginRequestSchema = v.pick(UserSchema, ['username', 'password']);

export const UserLoginResponseSchema = v.object({
  token: v.string(),
  user: UserResponseSchema
})

// 酒店Schema（基于原始，rooms改为roomTypes array）
export const HotelSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1, 'ID不能为空')), // 酒店ID
  nameZh: v.pipe(v.string(), v.minLength(1, '中文名不能为空')), // 中文名
  nameEn: v.nullable(v.string()), // 英文名，可选
  ownerId: v.pipe(v.number(), v.integer(), v.minValue(1, 'ID不能为空')), // 所属商户ID
  address: v.pipe(v.string(), v.minLength(1)), // 地址
  latitude: v.nullable(v.pipe(v.number(), v.minValue(-90), v.maxValue(90))), // 纬度
  longitude: v.nullable(v.pipe(v.number(), v.minValue(-180), v.maxValue(180))), // 经度
  starRating: v.pipe(v.number(), v.integer(), v.minValue(1, '星级至少1'), v.maxValue(5, '星级最多5')), // 星级
  openingDate: v.pipe(v.string(), v.isoDate('无效开业日期')), // 开业日期
  nearbyAttractions: v.nullable(v.array(v.pipe(v.string(), v.minLength(1, '最少输入一个字符'), v.maxLength(50, '最多输入50个字符')))), // 附近景点
  images: v.nullable(v.array(v.pipe(v.string(), v.url('无效URL')))), // 图片
  facilities: v.nullable(v.array(v.pipe(v.string(), v.minLength(1, '最少输入一个字符'), v.maxLength(50, '最多输入50个字符')))), // 酒店设施
  tags: v.nullable(v.array(v.pipe(v.string(), v.minLength(1, '最少输入一个字符'), v.maxLength(50, '最多输入50个字符')))), // 酒店标签
  averageRating: v.nullable(v.pipe(v.number(), v.minValue(0), v.maxValue(5))), // 平均评分
  ratingCount: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(0))), // 评分总数
  status: v.picklist(hotelStatus, '无效状态'), // 状态
  statusDescription: v.nullable(v.string()), // 状态说明
  ...vTimestamps()
});

// 酒店创建/更新 Partial Schema
export const PartialHotelSchema = v.partial(HotelSchema);

export const HotelCreateRequestSchema = v.omit(HotelSchema, ['id', 'createdAt', 'updatedAt', 'status', 'deletedAt', 'statusDescription', 'averageRating', 'ratingCount']);

export const HotelListRequestSchema = v.object({
  keyword: v.optional(v.string()),
  checkIn: v.optional(v.pipe(v.string(), v.isoDate())),
  checkOut: v.optional(v.pipe(v.string(), v.isoDate())),
  // 使用 v.string() + v.toNumber() 转换
  starRating: v.optional(v.pipe(v.string(), v.toNumber(), v.integer())),
  facilities: v.optional(v.array(v.string())),
  priceMin: v.optional(v.pipe(v.string(), v.toNumber())),
  priceMax: v.optional(v.pipe(v.string(), v.toNumber())),
  // 地理位置搜索参数
  userLat: v.optional(v.pipe(v.string(), v.toNumber(), v.minValue(-90), v.maxValue(90))), // 用户纬度
  userLng: v.optional(v.pipe(v.string(), v.toNumber(), v.minValue(-180), v.maxValue(180))), // 用户经度
  radius: v.optional(v.pipe(v.string(), v.toNumber(), v.minValue(0.1), v.maxValue(100))), // 搜索半径（公里），默认 10km
  sortBy: v.optional(v.picklist(['distance', 'price', 'rating', 'createdAt'])), // 排序方式
  page: v.optional(v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(1))),
  limit: v.optional(v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(1))),
});

export const HotelAdminListRequestSchema = v.object({
  status: v.optional(HotelSchema.entries.status),
  page: v.optional(v.number()),
  limit: v.optional(v.number()),
});

// 房型Schema（基于原始Promotion Schema修正为RoomType）
export const RoomTypeSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1, 'ID不能为空')),
  hotelId: v.pipe(v.number(), v.integer(), v.minValue(1, 'ID不能为空')),
  name: v.pipe(v.string(), v.minLength(1), v.maxLength(100)),
  price: v.pipe(v.number(), v.minValue(0, '价格不能为负')),
  stock: v.pipe(v.number(), v.integer(), v.minValue(0, '库存不能为负')),
  capacity: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  description: v.nullable(v.string()),
  ...vTimestamps()
});

// 房型创建/更新 Partial
export const PartialRoomTypeSchema = v.partial(RoomTypeSchema);

// 优惠Schema（基于原始Room Schema修正，添加type/value）
export const PromotionSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1)),
  ownerId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  hotelId: v.nullable(v.pipe(v.number(), v.integer())),
  roomTypeId: v.nullable(v.pipe(v.number(), v.integer())),
  type: v.picklist(promotionType, '无效优惠类型'),
  value: v.number(), // 如折扣0.8
  startDate: v.pipe(v.string(), v.isoDate()),
  endDate: v.pipe(v.string(), v.isoDate()),
  description: v.nullable(v.string()),
  ...vTimestamps()
});

// 优惠创建/更新 Partial
export const PartialPromotionSchema = v.partial(PromotionSchema);

// 预订Schema（新增）
export const BookingSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1)),
  userId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  hotelId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  roomTypeId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  checkIn: v.pipe(v.string(), v.isoDate()),
  checkOut: v.pipe(v.string(), v.isoDate()),
  totalPrice: v.pipe(v.number(), v.minValue(0)),
  status: v.picklist(bookingStatus, '无效预订状态'),
  promotionId: v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1))),
  ...vTimestamps()
});

// 预订创建 Schema（无ID、时间、status默认pending，userId从token获取）
export const BookingCreateSchema = v.omit(BookingSchema, ['id', 'createdAt', 'updatedAt', 'deletedAt', 'status', 'totalPrice', 'userId']); // totalPrice后端计算，userId从token获取

export const BookingListRequestSchema = v.object({
  status: v.optional(v.picklist(bookingStatus)),
  page: v.optional(v.number()),
  limit: v.optional(v.number()),
});

export const BookingListResponseSchema = v.object({
  bookings: v.array(BookingSchema),
  total: v.number(),
  page: v.number()
});

export const BookingAdminListRequestSchema = v.object({
  hotelId: v.optional(v.string()),
  status: v.optional(v.picklist(bookingStatus)),
  page: v.optional(v.number()),
  limit: v.optional(v.number()),
});

// 评分Schema（新增）
export const RatingSchema = v.object({
  id: v.pipe(v.number(), v.integer(), v.minValue(1)),
  userId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  hotelId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  score: v.pipe(v.number(), v.integer(), v.minValue(1, '评分最低1分'), v.maxValue(5, '评分最高5分')),
  comment: v.nullable(v.pipe(v.string(), v.maxLength(500, '评论最多500字符'))),
  ...vTimestamps()
});

// 评分创建 Schema（无ID、时间，userId从token获取）
export const RatingCreateSchema = v.omit(RatingSchema, ['id', 'createdAt', 'updatedAt', 'deletedAt', 'userId']);

// 评分列表响应 Schema
export const RatingListResponseSchema = v.object({
  ratings: v.array(RatingSchema),
  total: v.number(),
});

// 轮播图项 Schema
export const CarouselItemSchema = v.object({
  hotelId: v.pipe(v.number(), v.integer(), v.minValue(1)),
  image: v.pipe(v.string(), v.url('无效URL')),
});

// 轮播图响应 Schema
export const CarouselResponseSchema = v.array(CarouselItemSchema);

// 房型带折扣价格 Schema
export const RoomTypeWithDiscountSchema = v.intersect([
  RoomTypeSchema,
  v.object({
    discountedPrice: v.optional(v.number()),
  }),
]);

// 酒店带关联数据 Schema（用于列表响应）
export const HotelWithRelationsSchema = v.intersect([
  HotelSchema,
  v.object({
    roomTypes: v.optional(v.array(RoomTypeWithDiscountSchema)),
    promotions: v.optional(v.array(PromotionSchema)),
    distance: v.optional(v.number()), // 距离用户的公里数（仅位置搜索时返回）
  }),
]);

// 酒店列表响应 Schema
export const HotelListResponseSchema = v.object({ 
  hotels: v.array(HotelWithRelationsSchema), 
  total: v.number(), 
  page: v.number() 
});

// 酒店详情响应 Schema（包含 owner 信息）
export const HotelDetailSchema = v.intersect([
  HotelSchema,
  v.object({
    roomTypes: v.optional(v.array(RoomTypeWithDiscountSchema)),
    promotions: v.optional(v.array(PromotionSchema)),
    owner: v.nullable(v.object({
      id: v.number(),
      username: v.string(),
      role: v.picklist(roleType),
    })),
  }),
]);

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
      400: StatusError(400), // 参数验证失败
      500: StatusError(500), // 服务器错误
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
      401: StatusError(401), // 用户名或密码错误
      403: StatusError(403), // 账号已被禁用
      500: StatusError(500), // 服务器错误
    },
    summary: '用户登录，自动判断角色，返回JWT token',
    metadata: { permission: null },
  },
  me: {
    method: 'GET',
    path: '/users/me',
    responses: {
      200: UserResponseSchema, // Response: 当前用户信息
      400: StatusError(400), // 参数错误
      403: StatusError(403), // 账号已被禁用
      404: StatusError(404), // 用户不存在
      500: StatusError(500), // 服务器错误
    },
    summary: '获取当前登录用户信息（需token）',
    metadata: { permission: ['customer', 'merchant', 'admin'] }, // Permission: 所有角色
  },
}, {
  commonResponses: CommonResponseErrors,
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
      400: StatusError(400), // 参数错误
      500: StatusError(500), // 服务器错误
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
    body: PartialHotelSchema, // Request body: 部分更新
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
    method: 'PUT',
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
    method: 'PUT',
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
    method: 'PUT',
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
}, {
  commonResponses: CommonResponseErrors,
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
    method: 'PUT',
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
}, {
  commonResponses: CommonResponseErrors,
});

export const promotionsContract = c.router({
  create: {
    method: 'POST',
    path: '/promotions',
    body: v.omit(PromotionSchema, ['id', 'createdAt', 'updatedAt', 'deletedAt', 'ownerId']),
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
    method: 'PUT',
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
}, {
  commonResponses: CommonResponseErrors,
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
    method: 'PUT',
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
    method: 'PUT',
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
}, {
  commonResponses: CommonResponseErrors,
});

// 评分相关 API
export const ratingsContract = c.router({
  create: {
    method: 'POST',
    path: '/ratings',
    body: RatingCreateSchema,
    responses: {
      201: RatingSchema,
    },
    summary: '创建评分（用户对酒店评分，每个用户对每个酒店只能评一次）',
    metadata: { permission: ['customer'] },
  },
  list: {
    method: 'GET',
    path: '/ratings',
query: v.object({
  hotelId: v.optional(v.pipe(v.string(), v.toNumber(), v.integer())),
  page: v.optional(v.pipe(v.string(), v.toNumber(), v.integer())),
  limit: v.optional(v.pipe(v.string(), v.toNumber(), v.integer())),
}),
    responses: {
      200: RatingListResponseSchema,
    },
    summary: '获取评分列表（可按酒店筛选）',
    metadata: { permission: null },
  },
  get: {
    method: 'GET',
    path: '/ratings/:id',
    pathParams: v.object({ id: ParamIdSchema }),
    responses: {
      200: RatingSchema,
    },
    summary: '获取单个评分详情',
    metadata: { permission: null },
  },
  update: {
    method: 'PUT',
    path: '/ratings/:id',
    pathParams: v.object({ id: ParamIdSchema }),
    body: v.partial(RatingCreateSchema),
    responses: {
      200: RatingSchema,
    },
    summary: '更新评分（仅评分者本人可修改）',
    metadata: { permission: ['customer'] },
  },
  delete: {
    method: 'DELETE',
    path: '/ratings/:id',
    pathParams: v.object({ id: ParamIdSchema }),
    responses: {
      200: v.object({ message: v.literal('Deleted') }),
    },
    summary: '删除评分（评分者本人或管理员）',
    metadata: { permission: ['customer', 'admin'] },
  },
}, {
  commonResponses: CommonResponseErrors,
});

// 轮播图相关 API
export const carouselContract = c.router({
  list: {
    method: 'GET',
    path: '/carousel',
query: v.object({
  limit: v.optional(v.pipe(v.string(), v.toNumber(), v.integer(), v.minValue(1))),
}),
    responses: {
      200: CarouselResponseSchema,
    },
    summary: '获取轮播图列表（返回有图片的酒店，用于前端首页轮播）',
    metadata: { permission: null },
  },
}, {
  commonResponses: CommonResponseErrors,
});

// 完整API合约
// 使用 commonResponses 为所有 API 添加统一的错误响应定义
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
  // 评分相关 API
  ratings: ratingsContract,
  // 轮播图相关 API
  carousel: carouselContract,
}, {
  // 通用错误响应定义，所有子路由都会继承这些响应状态码
  commonResponses: CommonResponseErrors,
});
