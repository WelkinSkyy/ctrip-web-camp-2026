// 1. 数据库表定义 (drizzle-orm格式)
// 导入drizzle-orm必要模块（假设环境已配置）
import { pgTable, serial, text, varchar, integer, numeric, timestamp, date, pgEnum, unique, uniqueIndex, foreignKey } from 'drizzle-orm/pg-core';
import { defineRelations } from 'drizzle-orm';
import { hotelStatus, bookingStatus, promotionType, roleType } from 'esu-types'

// 枚举定义：酒店状态
const hotelStatusEnum = pgEnum('hotel_status', hotelStatus);

// 枚举定义：预订状态
const bookingStatusEnum = pgEnum('booking_status', bookingStatus);

// 枚举定义：优惠类型（新增：折扣、套餐等）
const promotionTypeEnum = pgEnum('promotion_type', promotionType);

const roleTypeEnum = pgEnum('role_type', roleType);

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
  role: roleTypeEnum().notNull(),
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