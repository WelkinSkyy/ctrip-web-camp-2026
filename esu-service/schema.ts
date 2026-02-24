// =============================================================================
// 导入 Drizzle ORM 核心模块
// =============================================================================
import {
  pgTable, // PostgreSQL 表定义函数
  serial, // 自增序列主键
  text, // 文本类型
  varchar, // 可变长度字符串
  integer, // 整数类型
  numeric, // 精确数值类型（用于价格）
  timestamp, // 时间戳类型
  date, // 日期类型
  pgEnum, // PostgreSQL 枚举类型
  doublePrecision, // 双精度浮点数（用于经纬度）
} from 'drizzle-orm/pg-core';

// 导入关系定义函数 - Drizzle beta 版使用 defineRelations
import { defineRelations } from 'drizzle-orm';

// 导入类型定义（假设打包为 esu-types 包）
import {
  hotelStatus, // 酒店状态枚举值
  bookingStatus, // 预订状态枚举值
  promotionType, // 优惠类型枚举值
  roleType, // 用户角色枚举值
} from 'esu-types';

// =============================================================================
// 枚举类型定义
// =============================================================================

/**
 * 酒店状态枚举
 * - pending: 待审核（新创建的酒店默认状态）
 * - approved: 已通过审核（可正常营业）
 * - rejected: 审核未通过（需要修改后重新提交）
 * - offline: 已下线（管理员操作，可恢复）
 */
export const hotelStatusEnum = pgEnum('hotel_status', hotelStatus);

/**
 * 预订状态枚举
 * - pending: 待确认（用户刚创建预订）
 * - confirmed: 已确认（商户/管理员确认）
 * - cancelled: 已取消（用户/商户/管理员取消）
 * - completed: 已完成（用户已入住并退房）
 */
export const bookingStatusEnum = pgEnum('booking_status', bookingStatus);

/**
 * 优惠类型枚举
 * - direct: 直接减免（如减100元）
 * - percentage: 百分比折扣（如打8折）
 * - spend_and_save: 满减优惠（如满500减50）
 */
export const promotionTypeEnum = pgEnum('promotion_type', promotionType);

/**
 * 用户角色枚举
 * - customer: 普通用户（可浏览、预订酒店）
 * - merchant: 商户（可管理自己的酒店信息）
 * - admin: 管理员（可审核、管理所有数据）
 */
export const roleTypeEnum = pgEnum('role_type', roleType);

// =============================================================================
// 辅助函数
// =============================================================================

/**
 * 时间戳字段生成器
 * 为每个表添加标准的创建时间、更新时间和软删除时间字段
 *
 * @returns 包含三个时间戳字段的对象
 * - createdAt: 创建时间，默认为当前时间，不可为空
 * - updatedAt: 更新时间，默认为当前时间，不可为空
 * - deletedAt: 软删除时间，可为空（未删除时为null）
 */
const timestamps = () => ({
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  deletedAt: timestamp('deleted_at'),
});

// =============================================================================
// 数据表定义
// =============================================================================

/**
 * 用户表 (users)
 *
 * 存储所有用户信息，包括普通用户、商户和管理员。
 * 支持基于角色的访问控制（RBAC）。
 *
 * 字段说明：
 * - id: 自增主键
 * - username: 用户名，唯一，3-50字符
 * - password: 加密后的密码
 * - role: 用户角色（customer/merchant/admin）
 * - phone: 手机号，可选
 * - email: 邮箱，可选
 */
export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  username: varchar('username', { length: 50 }).notNull().unique(),
  password: varchar('password', { length: 100 }).notNull(),
  role: roleTypeEnum('role').notNull(),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 100 }),
  ...timestamps(),
});

/**
 * 酒店表 (hotels)
 *
 * 存储酒店的基本信息，包括名称、地址、星级等。
 * 需要经过管理员审核后才能上线。
 *
 * 字段说明：
 * - id: 自增主键
 * - nameZh: 中文名称，唯一，必填
 * - nameEn: 英文名称，可选
 * - ownerId: 所属商户ID，外键关联users表
 * - address: 酒店地址，必填
 * - latitude: 纬度，用于地图定位
 * - longitude: 经度，用于地图定位
 * - starRating: 星级评定，1-5星
 * - openingDate: 开业日期
 * - nearbyAttractions: 附近景点数组
 * - images: 酒店图片URL数组
 * - facilities: 酒店设施数组
 * - tags: 酒店标签数组（如：亲子、商务、度假等）
 * - averageRating: 平均评分，0-5分
 * - ratingCount: 评分总数
 * - status: 酒店状态（pending/approved/rejected/offline）
 * - statusDescription: 状态说明（如拒绝原因）
 */
export const hotels = pgTable('hotels', {
  id: serial('id').primaryKey(),
  nameZh: varchar('name_zh', { length: 50 }).unique().notNull(),
  nameEn: varchar('name_en', { length: 100 }),
  ownerId: integer('owner_id')
    .notNull()
    .references(() => users.id),
  address: text('address').notNull(),
  latitude: doublePrecision('latitude'),
  longitude: doublePrecision('longitude'),
  starRating: integer('star_rating').notNull(),
  openingDate: date('opening_date').notNull(),
  nearbyAttractions: varchar('nearby_attractions', {
    length: 50,
  }).array(),
  images: text('images').array(),
  facilities: varchar('facilities', { length: 50 }).array(),
  tags: varchar('tags', { length: 50 }).array(),
  averageRating: numeric('average_rating', {
    mode: 'number',
    precision: 3,
    scale: 2,
  }).default(0),
  ratingCount: integer('rating_count').default(0),
  status: hotelStatusEnum('status').notNull().default('pending'),
  statusDescription: text('status_description'),
  ...timestamps(),
});

/**
 * 房型表 (room_types)
 *
 * 存储酒店下的各类房型信息。
 * 每个房型有自己的价格、库存和容纳人数。
 *
 * 字段说明：
 * - id: 自增主键
 * - hotelId: 所属酒店ID，外键关联hotels表
 * - name: 房型名称
 * - price: 基础价格（精确数值，避免浮点误差）
 * - stock: 可预订房间数量
 * - capacity: 房间容纳人数，默认1人
 * - description: 房型描述
 */
export const roomTypes = pgTable('room_types', {
  id: serial('id').primaryKey(),
  hotelId: integer('hotel_id')
    .notNull()
    .references(() => hotels.id),
  name: varchar('name', { length: 100 }).notNull(),
  price: numeric('price', {
    mode: 'number',
    precision: 10,
    scale: 2,
  }).notNull(),
  stock: integer('stock').notNull().default(0),
  capacity: integer('capacity').default(1),
  description: text('description'),
  ...timestamps(),
});

/**
 * 优惠表 (promotions)
 *
 * 存储酒店的优惠活动信息。
 * 可关联到整个酒店或特定房型。
 *
 * 字段说明：
 * - id: 自增主键
 * - ownerId: 创建者ID，外键关联users表
 * - hotelId: 关联酒店ID，可选（为空表示通用优惠）
 * - roomTypeId: 关联房型ID，可选
 * - type: 优惠类型（direct/percentage/spend_and_save）
 * - value: 优惠值（如0.8表示8折，100表示减100元）
 * - startDate: 优惠开始日期
 * - endDate: 优惠结束日期
 * - description: 优惠描述
 */
export const promotions = pgTable('promotions', {
  id: serial('id').primaryKey(),
  ownerId: integer('owner_id')
    .references(() => users.id)
    .notNull(),
  hotelId: integer('hotel_id').references(() => hotels.id),
  roomTypeId: integer('room_type_id').references(() => roomTypes.id),
  type: promotionTypeEnum('type').notNull().default('direct'),
  value: numeric('value', {
    mode: 'number',
    precision: 10,
    scale: 2,
  }).notNull(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date').notNull(),
  description: text('description'),
  ...timestamps(),
});

/**
 * 房型优惠关联表 (room_type_promotion)
 *
 * 多对多关系的中间表，用于关联房型和优惠。
 * 一个房型可以有多个优惠，一个优惠可以适用于多个房型。
 *
 * 字段说明：
 * - id: 自增主键
 * - roomTypeId: 房型ID，外键
 * - promotionId: 优惠ID，外键
 */
export const roomTypePromotion = pgTable('room_type_promotion', {
  id: serial('id').primaryKey(),
  roomTypeId: integer('room_type_id')
    .notNull()
    .references(() => roomTypes.id),
  promotionId: integer('promotion_id')
    .notNull()
    .references(() => promotions.id),
  ...timestamps(),
});

/**
 * 预订表 (bookings)
 *
 * 存储用户的酒店预订记录。
 * 包含预订的房型、日期、价格和状态信息。
 *
 * 字段说明：
 * - id: 自增主键
 * - userId: 预订用户ID，外键关联users表
 * - hotelId: 预订酒店ID，外键关联hotels表
 * - roomTypeId: 预订房型ID，外键关联room_types表
 * - checkIn: 入住日期
 * - checkOut: 离店日期
 * - totalPrice: 预订总价（已应用优惠）
 * - status: 预订状态
 * - promotionId: 应用的优惠ID，可选
 */
export const bookings = pgTable('bookings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  hotelId: integer('hotel_id')
    .notNull()
    .references(() => hotels.id),
  roomTypeId: integer('room_type_id')
    .notNull()
    .references(() => roomTypes.id),
  checkIn: date('check_in').notNull(),
  checkOut: date('check_out').notNull(),
  totalPrice: numeric('total_price', {
    mode: 'number',
    precision: 10,
    scale: 2,
  }).notNull(),
  status: bookingStatusEnum('status').notNull().default('pending'),
  promotionId: integer('promotion_id').references(() => promotions.id),
  ...timestamps(),
});

/**
 * 评分表 (ratings)
 *
 * 存储用户对酒店的评分和评论。
 * 每个用户对每个酒店只能评分一次。
 *
 * 字段说明：
 * - id: 自增主键
 * - userId: 评分用户ID，外键关联users表
 * - hotelId: 评分酒店ID，外键关联hotels表
 * - score: 评分，1-5分
 * - comment: 评论内容，可选
 */
export const ratings = pgTable('ratings', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id),
  hotelId: integer('hotel_id')
    .notNull()
    .references(() => hotels.id),
  score: integer('score').notNull(),
  comment: text('comment'),
  ...timestamps(),
});

// =============================================================================
// 关系定义（使用 Drizzle ORM beta 版 defineRelations API）
// =============================================================================

/**
 * 关系定义
 *
 * 使用 Drizzle beta 版的 defineRelations 函数定义表之间的关系。
 * 这种方式更加简洁，使用链式调用定义一对一、一对多和多对多关系。
 *
 * 关系类型：
 * - r.one.tableName(): 一对一关系
 * - r.many.tableName(): 一对多关系
 *
 * 关联条件使用 from 和 to 指定：
 * - from: 当前表的字段
 * - to: 关联表的字段
 */
export const relations = defineRelations(
  // 第一个参数：所有需要定义关系的表
  {
    users,
    hotels,
    roomTypes,
    promotions,
    roomTypePromotion,
    bookings,
    ratings,
  },
  // 第二个参数：关系定义回调函数
  (r) => ({
    /**
     * 用户表关系
     *
     * 一个用户可以：
     * - 拥有多家酒店（作为商户）
     * - 创建多个预订（作为普通用户）
     * - 创建多个优惠活动
     * - 创建多个评分
     */
    users: {
      hotels: r.many.hotels(),
      bookings: r.many.bookings(),
      promotions: r.many.promotions(),
      ratings: r.many.ratings(),
    },

    /**
     * 酒店表关系
     *
     * 一个酒店：
     * - 属于一个商户（owner）
     * - 有多个房型
     * - 可能有多个关联优惠
     * - 有多个预订记录
     * - 有多个评分记录
     */
    hotels: {
      // 一对一：酒店属于一个商户
      owner: r.one.users({
        from: r.hotels.ownerId,
        to: r.users.id,
      }),
      // 一对多：酒店有多个房型
      roomTypes: r.many.roomTypes(),
      // 一对多：酒店有多个优惠
      promotions: r.many.promotions(),
      // 一对多：酒店有多个预订
      bookings: r.many.bookings(),
      // 一对多：酒店有多个评分
      ratings: r.many.ratings(),
    },

    /**
     * 房型表关系
     *
     * 一个房型：
     * - 属于一个酒店
     * - 可能有多个关联优惠（通过中间表）
     * - 有多个预订记录
     */
    roomTypes: {
      // 一对一：房型属于一个酒店
      hotel: r.one.hotels({
        from: r.roomTypes.hotelId,
        to: r.hotels.id,
      }),
      // 一对多：房型有多个预订
      bookings: r.many.bookings(),
      // 一对多：房型有多个优惠关联（通过中间表）
      promotionRelations: r.many.roomTypePromotion(),
    },

    /**
     * 优惠表关系
     *
     * 一个优惠：
     * - 由一个用户创建
     * - 可能关联到一个酒店
     * - 可能关联到多个房型（通过中间表）
     */
    promotions: {
      // 一对一：优惠由一个用户创建
      owner: r.one.users({
        from: r.promotions.ownerId,
        to: r.users.id,
      }),
      // 一对一：优惠可能关联一个酒店
      hotel: r.one.hotels({
        from: r.promotions.hotelId,
        to: r.hotels.id,
      }),
      // 一对一：优惠可能关联一个房型
      roomType: r.one.roomTypes({
        from: r.promotions.roomTypeId,
        to: r.roomTypes.id,
      }),
      // 一对多：优惠有多个房型关联（通过中间表）
      roomTypeRelations: r.many.roomTypePromotion(),
    },

    /**
     * 房型优惠关联表关系
     *
     * 中间表关系：
     * - 每条记录关联一个房型和一个优惠
     */
    roomTypePromotion: {
      // 一对一：关联一个房型
      roomType: r.one.roomTypes({
        from: r.roomTypePromotion.roomTypeId,
        to: r.roomTypes.id,
      }),
      // 一对一：关联一个优惠
      promotion: r.one.promotions({
        from: r.roomTypePromotion.promotionId,
        to: r.promotions.id,
      }),
    },

    /**
     * 预订表关系
     *
     * 一个预订：
     * - 属于一个用户
     * - 关联一个酒店
     * - 关联一个房型
     * - 可能应用了一个优惠
     */
    bookings: {
      // 一对一：预订属于一个用户
      user: r.one.users({
        from: r.bookings.userId,
        to: r.users.id,
      }),
      // 一对一：预订关联一个酒店
      hotel: r.one.hotels({
        from: r.bookings.hotelId,
        to: r.hotels.id,
      }),
      // 一对一：预订关联一个房型
      roomType: r.one.roomTypes({
        from: r.bookings.roomTypeId,
        to: r.roomTypes.id,
      }),
      // 一对一：预订可能应用一个优惠
      promotion: r.one.promotions({
        from: r.bookings.promotionId,
        to: r.promotions.id,
      }),
    },

    /**
     * 评分表关系
     *
     * 一个评分：
     * - 属于一个用户
     * - 关联一个酒店
     */
    ratings: {
      // 一对一：评分属于一个用户
      user: r.one.users({
        from: r.ratings.userId,
        to: r.users.id,
      }),
      // 一对一：评分关联一个酒店
      hotel: r.one.hotels({
        from: r.ratings.hotelId,
        to: r.hotels.id,
      }),
    },
  }),
);
