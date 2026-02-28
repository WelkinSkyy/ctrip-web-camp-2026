import { SQL, sql, and, eq, isNull, exists, gt, lt, gte, lte, or } from 'drizzle-orm';
import * as v from 'valibot';

import { hotels, roomTypes, bookings } from '../schema.js';
import type { DbInstance } from './types.js';
import { RoomTypeWithDiscountSchema, HotelFilterRulesSchema } from 'esu-types';

export type RoomTypeWithDiscount = v.InferOutput<typeof RoomTypeWithDiscountSchema>;

export type Promotion = {
  id: number;
  type: 'direct' | 'percentage' | 'spend_and_save';
  value: number;
  deletedAt?: string | null;
  startDate: string;
  endDate: string;
  hotelId: number | null;
  roomTypeId?: number | null;
};

type PromoInfo = {
  id: number;
  type: 'direct' | 'percentage' | 'spend_and_save';
  value: number;
};

const PROMO_TYPES = ['direct', 'percentage', 'spend_and_save'] as const;

function toPromoType(value: string): PromoInfo['type'] {
  if ((PROMO_TYPES as readonly string[]).includes(value)) {
    return value as PromoInfo['type'];
  }
  return 'direct';
}

export interface HotelDistanceResult {
  id: number;
  distance: number | null;
  minPrice?: number | null;
}

export interface HotelQueryRoomType {
  id: number;
  price: number;
}

export interface HotelQueryPromotion {
  id: number;
  hotelId: number | null;
  roomTypeId: number | null;
  type: string;
  value: number;
  startDate: string;
  endDate: string;
}

export interface HotelQueryResult {
  id: number;
  roomTypes?: HotelQueryRoomType[] | undefined;
  promotions?: HotelQueryPromotion[] | undefined;
}

const DEFAULT_RADIUS = 10;
const EARTH_RADIUS_KM = 6371;

export const DEFAULT_SEARCH_RADIUS = DEFAULT_RADIUS;

export const calculateDiscountedPrice = (originalPrice: number, promotion: PromoInfo): number => {
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

export const getActivePromotions = async (
  db: DbInstance,
  hotelId: number,
  roomTypeId?: number,
): Promise<PromoInfo[]> => {
  const now = new Date();
  const todayStr = now.toISOString().split('T')[0] ?? '';

  const allPromotions = await db.query.promotions.findMany();

  const validPromotions = allPromotions.filter((p) => {
    if (p.deletedAt) return false;
    if (p.startDate > todayStr || p.endDate < todayStr) return false;
    if (p.hotelId !== null && p.hotelId !== hotelId && p.roomTypeId !== roomTypeId) {
      if (p.hotelId !== null) return false;
    }
    return true;
  });

  return validPromotions.map((p) => ({
    id: p.id,
    type: toPromoType(p.type),
    value: Number(p.value),
  }));
};

export const buildSearchFilter = (keyword: string | undefined): SQL | undefined => {
  if (!keyword || !keyword.trim()) {
    return undefined;
  }

  const keywords = keyword
    .trim()
    .split(/\s+/)
    .filter((k) => k.length > 0)
    .map((k) => k + ':*')
    .join(' & ');

  if (!keywords) {
    return undefined;
  }

  return sql`
    to_tsvector('simple',
      COALESCE(${hotels.nameZh}, '') || ' ' ||
      COALESCE(${hotels.nameEn}, '') || ' ' ||
      COALESCE(${hotels.address}, '') || ' ' ||
      COALESCE(${hotels.tags}::text, '') || ' ' ||
      COALESCE(${hotels.facilities}::text, '') || ' ' ||
      COALESCE(${hotels.nearbyAttractions}::text, '')
    ) @@ to_tsquery('simple', ${keywords})
  `;
};

export const buildGeoDistanceSql = (userLat: number, userLng: number): SQL => {
  return sql`
    (${sql.raw(String(EARTH_RADIUS_KM))} * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(${userLat})) * cos(radians(${hotels.latitude})) *
        cos(radians(${hotels.longitude}) - radians(${userLng})) +
        sin(radians(${userLat})) * sin(radians(${hotels.latitude}))
      ))
    ))
  `;
};

export type DrizzleCondition = ReturnType<typeof and> | ReturnType<typeof eq> | undefined;

export const buildBaseCondition = (): DrizzleCondition => {
  return and(isNull(hotels.deletedAt), eq(hotels.status, 'approved'));
};

export const buildFilterConditions = (query: {
  starRating?: number | undefined;
  facilities?: string[] | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  checkDate?: [string, string] | undefined;
}): DrizzleCondition => {
  const conditions: (ReturnType<typeof and> | undefined)[] = [];

  if (query.starRating !== undefined) {
    conditions.push(eq(hotels.starRating, query.starRating));
  }

  if (query.facilities && query.facilities.length > 0) {
    const facArray = query.facilities;
    conditions.push(sql`${hotels.facilities} && ${sql`{${facArray.join(',')}}`}::text[]` as ReturnType<typeof and>);
  }

  if (query.priceMin !== undefined || query.priceMax !== undefined) {
    let priceCond = `EXISTS (
      SELECT 1 FROM room_types
      WHERE room_types.hotel_id = hotels.id
      AND room_types.deleted_at IS NULL
    `;
    if (query.priceMin !== undefined) {
      priceCond += ` AND room_types.price >= ${query.priceMin}`;
    }
    if (query.priceMax !== undefined) {
      priceCond += ` AND room_types.price <= ${query.priceMax}`;
    }
    priceCond += ')';
    conditions.push(sql.raw(priceCond) as ReturnType<typeof and>);
  }

  if (query.checkDate) {
    const [checkInStr, checkOutStr] = query.checkDate;
    conditions.push(
      sql.raw(`
      NOT EXISTS (
        SELECT 1 FROM bookings b
        INNER JOIN room_types rt ON b.room_type_id = rt.id
        WHERE rt.hotel_id = hotels.id
        AND rt.deleted_at IS NULL
        AND b.status IN ('pending', 'confirmed')
        AND b.check_in < '${checkOutStr}'
        AND b.check_out > '${checkInStr}'
      )
    `) as ReturnType<typeof and>,
    );
  }

  const validConditions = conditions.filter((c): c is ReturnType<typeof and> => c !== undefined);

  if (validConditions.length === 0) {
    return undefined;
  }

  return and(...validConditions);
};

export const applyRoomTypesDiscount = async (
  db: DbInstance,
  hotelId: number,
  roomTypesList: Array<{ id: number; price: unknown }>,
  preloadedPromos?: Promotion[],
): Promise<RoomTypeWithDiscount[]> => {
  let activePromos: PromoInfo[];

  if (preloadedPromos) {
    const todayStr = new Date().toISOString().split('T')[0] ?? '';
    activePromos = preloadedPromos
      .filter((p) => {
        if (p.deletedAt) return false;
        if (p.startDate > todayStr || p.endDate < todayStr) return false;
        if (p.hotelId !== null && p.hotelId !== hotelId) {
          if (p.hotelId !== null) return false;
        }
        return true;
      })
      .map((p) => ({
        id: p.id,
        type: toPromoType(p.type),
        value: Number(p.value),
      }));
  } else {
    activePromos = await getActivePromotions(db, hotelId);
  }

  return roomTypesList.map((rt) => {
    let discountedPrice = Number(rt.price);
    for (const promo of activePromos) {
      discountedPrice = calculateDiscountedPrice(discountedPrice, promo);
    }
    return {
      ...rt,
      discountedPrice: Math.max(0, discountedPrice),
    } as RoomTypeWithDiscount;
  });
};

export type SortBy = 'distance' | 'price' | 'rating' | 'createdAt';

export type FilterRules = v.InferOutput<typeof HotelFilterRulesSchema>;

export type LegacyQueryParams = {
  checkIn?: string | undefined;
  checkOut?: string | undefined;
  starRating?: number | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  radius?: number | undefined;
  sortBy?: string | undefined;
  rules?: FilterRules | undefined;
};

export const normalizeLegacyParams = (
  query: LegacyQueryParams,
): { rules: FilterRules; sortBy: SortBy | undefined; reversed: boolean } => {
  const rules: FilterRules = {
    ...query.rules,
    distance: query.rules?.distance ?? (query.radius !== undefined ? [0, Number(query.radius)] : undefined),
    checkDate:
      query.rules?.checkDate ?? (query.checkIn && query.checkOut ? [query.checkIn, query.checkOut] : undefined),
    price:
      query.rules?.price ??
      (query.priceMin !== undefined || query.priceMax !== undefined
        ? [query.priceMin ?? 0, query.priceMax ?? Infinity]
        : undefined),
    starRating:
      query.rules?.starRating ?? (query.starRating !== undefined ? [query.starRating, query.starRating] : undefined),
  };

  const sortBy =
    query.sortBy === 'distance' || query.sortBy === 'price' || query.sortBy === 'rating' || query.sortBy === 'createdAt'
      ? (query.sortBy as SortBy)
      : undefined;

  return { rules, sortBy, reversed: false };
};

export const buildSortOrder = (sortBy: SortBy | undefined, reversed: boolean, hasGeoSearch: boolean): SQL => {
  if (!sortBy) {
    return sql`${sql.raw(hasGeoSearch ? 'distance ASC' : 'created_at DESC')}`;
  }

  switch (sortBy) {
    case 'distance':
      return sql`distance ${reversed ? 'DESC' : 'ASC'}`;
    case 'price':
      return sql`min_price ${reversed ? 'DESC' : 'ASC'}`;
    case 'rating':
      return sql`average_rating ${reversed ? 'ASC' : 'DESC'}`;
    case 'createdAt':
      return sql`created_at ${reversed ? 'ASC' : 'DESC'}`;
    default:
      return sql`created_at DESC`;
  }
};

export const buildRulesFilter = (
  rules: FilterRules,
  hasGeoSearch: boolean,
  userLat?: number,
  userLng?: number,
): DrizzleCondition => {
  const conditions: (ReturnType<typeof and> | undefined)[] = [];

  // 距离筛选（必须使用 SQL，因为是复杂计算）
  if (hasGeoSearch && userLat !== undefined && userLng !== undefined) {
    if (rules.distance) {
      const [minDist, maxDist] = rules.distance;
      if (minDist > 0) {
        conditions.push(sql`${buildGeoDistanceSql(userLat, userLng)} >= ${minDist}` as ReturnType<typeof and>);
      }
      if (maxDist !== Infinity) {
        conditions.push(sql`${buildGeoDistanceSql(userLat, userLng)} <= ${maxDist}` as ReturnType<typeof and>);
      }
    }
  }

  // 价格筛选（使用 SQL 子查询）
  if (rules.price) {
    const [minPrice, maxPrice] = rules.price;
    let priceCond = `EXISTS (
      SELECT 1 FROM room_types
      WHERE room_types.hotel_id = hotels.id
      AND room_types.deleted_at IS NULL
    `;
    if (minPrice > 0) {
      priceCond += ` AND room_types.price >= ${minPrice}`;
    }
    if (maxPrice !== Infinity) {
      priceCond += ` AND room_types.price <= ${maxPrice}`;
    }
    priceCond += ')';
    conditions.push(sql.raw(priceCond) as ReturnType<typeof and>);
  }

  // 星级筛选（使用 Drizzle）
  if (rules.starRating) {
    const [minStar, maxStar] = rules.starRating;
    if (minStar > 0) {
      conditions.push(gte(hotels.starRating, minStar));
    }
    if (maxStar !== Infinity) {
      conditions.push(lte(hotels.starRating, maxStar));
    }
  }

  // 评分筛选（使用 Drizzle）
  if (rules.avarageRating) {
    const [minRating, maxRating] = rules.avarageRating;
    if (minRating > 0) {
      conditions.push(gte(hotels.averageRating, minRating));
    }
    if (maxRating !== Infinity) {
      conditions.push(lte(hotels.averageRating, maxRating));
    }
  }

  const validConditions = conditions.filter((c): c is ReturnType<typeof and> => c !== undefined);

  if (validConditions.length === 0) {
    return undefined;
  }

  return and(...validConditions);
};

export const getHotelMinPrice = (hotel: {
  roomTypes?: Array<{ discountedPrice?: number | null | undefined }> | undefined;
}): number => {
  if (!hotel.roomTypes || hotel.roomTypes.length === 0) {
    return Infinity;
  }
  const prices = hotel.roomTypes
    .map((rt) => rt.discountedPrice ?? Infinity)
    .filter((p): p is number => typeof p === 'number' && !isNaN(p));
  if (prices.length === 0) {
    return Infinity;
  }
  return Math.min(...prices);
};

export const sortHotelsByDistance = (
  hotels: Array<{ id: number; distance: number | null }>,
  reversed: boolean = false,
): Array<{ id: number; distance: number | null }> => {
  const direction = reversed ? -1 : 1;
  return [...hotels].sort((a, b) => {
    const aDist = a.distance ?? Infinity;
    const bDist = b.distance ?? Infinity;
    return (aDist - bDist) * direction;
  });
};
