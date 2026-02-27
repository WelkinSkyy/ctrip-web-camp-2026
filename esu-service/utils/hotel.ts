import { SQL, sql } from 'drizzle-orm';
import * as v from 'valibot';

import { hotels, roomTypes } from '../schema.js';
import type { DbInstance } from './types.js';
import { RoomTypeWithDiscountSchema, HotelFilterRulesSchema, HotelSortItemSchema } from 'esu-types';

export type RoomTypeWithDiscount = v.InferOutput<typeof RoomTypeWithDiscountSchema>;

export type Promotion = {
  id: number;
  type: 'direct' | 'percentage' | 'spend_and_save';
  value: number;
};

const DEFAULT_RADIUS = 10;
const EARTH_RADIUS_KM = 6371;

export const DEFAULT_SEARCH_RADIUS = DEFAULT_RADIUS;

export const calculateDiscountedPrice = (originalPrice: number, promotion: Promotion): number => {
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
): Promise<Promotion[]> => {
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
    type: p.type as Promotion['type'],
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
    (${EARTH_RADIUS_KM} * acos(
      LEAST(1.0, GREATEST(-1.0,
        cos(radians(${userLat})) * cos(radians(${hotels.latitude})) *
        cos(radians(${hotels.longitude}) - radians(${userLng})) +
        sin(radians(${userLat})) * sin(radians(${hotels.latitude}))
      ))
    ))
  `;
};

export const buildBaseCondition = (): SQL => {
  return sql`
    ${hotels.deletedAt} IS NULL
    AND ${hotels.status} = 'approved'
  `;
};

export const buildFilterConditions = (query: {
  starRating?: number | undefined;
  facilities?: string[] | undefined;
  priceMin?: number | undefined;
  priceMax?: number | undefined;
  unavailableRoomTypeIds?: number[] | undefined;
}): SQL | undefined => {
  const conditions: string[] = [];

  if (query.starRating !== undefined) {
    conditions.push(`star_rating = ${query.starRating}`);
  }

  if (query.facilities && query.facilities.length > 0) {
    const facStr = query.facilities.map((f) => `'${f}'`).join(', ');
    conditions.push(`facilities && ARRAY[${facStr}]`);
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
    conditions.push(priceCond);
  }

  // 排除已预订的房型对应的酒店（如果有可用房型）
  if (query.unavailableRoomTypeIds && query.unavailableRoomTypeIds.length > 0) {
    const unavailableIds = query.unavailableRoomTypeIds.join(', ');
    conditions.push(`
      NOT EXISTS (
        SELECT 1 FROM room_types rt
        WHERE rt.hotel_id = hotels.id
        AND rt.deleted_at IS NULL
        AND rt.id NOT IN (${unavailableIds})
      )
    `);
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return sql.raw(conditions.join(' AND '));
};

export const applyRoomTypesDiscount = async (
  db: DbInstance,
  hotelId: number,
  roomTypesList: Array<{ id: number; price: unknown }>,
): Promise<RoomTypeWithDiscount[]> => {
  return Promise.all(
    roomTypesList.map(async (rt) => {
      const activePromos = await getActivePromotions(db, hotelId, rt.id);
      let discountedPrice = Number(rt.price);

      for (const promo of activePromos) {
        discountedPrice = calculateDiscountedPrice(discountedPrice, promo);
      }

      return {
        ...rt,
        discountedPrice: Math.max(0, discountedPrice),
      } as RoomTypeWithDiscount;
    }),
  );
};

export type SortBy = 'distance' | 'price' | 'rating' | 'createdAt';

export const sortHotelsByDistance = <T extends { distance: number | null }>(hotelsList: T[]): T[] => {
  return [...hotelsList].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));
};

export type FilterRules = v.InferOutput<typeof HotelFilterRulesSchema>;
export type SortItem = v.InferOutput<typeof HotelSortItemSchema>;

export const buildRulesFilter = (
  rules: FilterRules,
  hasGeoSearch: boolean,
  userLat?: number,
  userLng?: number,
): SQL | undefined => {
  const conditions: string[] = [];

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
    conditions.push(priceCond);
  }

  if (rules.starRating) {
    const [minStar, maxStar] = rules.starRating;
    if (minStar > 0) {
      conditions.push(`star_rating >= ${minStar}`);
    }
    if (maxStar !== Infinity) {
      conditions.push(`star_rating <= ${maxStar}`);
    }
  }

  if (rules.avarageRating) {
    const [minRating, maxRating] = rules.avarageRating;
    if (minRating > 0) {
      conditions.push(`average_rating >= ${minRating}`);
    }
    if (maxRating !== Infinity) {
      conditions.push(`average_rating <= ${maxRating}`);
    }
  }

  if (conditions.length === 0) {
    return undefined;
  }

  return sql.raw(conditions.join(' AND '));
};

type SortableHotel = {
  distance?: number | null | undefined;
  price?: number;
  rating?: number;
  starRating?: number | null;
  averageRating?: number | null;
  createdAt?: Date;
  roomTypes?: Array<Record<string, unknown>> | undefined;
};

export const sortHotelsByMultipleKeys = <T extends SortableHotel>(
  hotelsList: T[],
  sortItems: SortItem[],
): T[] => {
  return [...hotelsList].sort((a, b) => {
    for (const item of sortItems) {
      let aVal: number | Date | undefined;
      let bVal: number | Date | undefined;

      switch (item.key) {
        case 'distance':
          aVal = a.distance ?? Infinity;
          bVal = b.distance ?? Infinity;
          break;
        case 'price':
          aVal = a.price ?? Infinity;
          bVal = b.price ?? Infinity;
          break;
        case 'rating':
        case 'starRating':
          aVal = a.starRating ?? a.averageRating ?? 0;
          bVal = b.starRating ?? b.averageRating ?? 0;
          break;
        case 'createdAt':
          aVal = a.createdAt ?? new Date(0);
          bVal = b.createdAt ?? new Date(0);
          break;
        default:
          continue;
      }

      let comparison = 0;
      if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else if (aVal instanceof Date && bVal instanceof Date) {
        comparison = aVal.getTime() - bVal.getTime();
      }

      if (comparison !== 0) {
        return item.reverse ? -comparison : comparison;
      }
    }
    return 0;
  });
};

export const getHotelMinPrice = (hotel: { roomTypes?: Array<{ discountedPrice?: number | null | undefined }> | undefined }): number => {
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
