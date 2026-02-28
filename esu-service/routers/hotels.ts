import { SQL, sql, and } from 'drizzle-orm';
import * as v from 'valibot';

import { hotelsContract, HotelWithRelationsSchema, HotelDetailSchema, RoomTypeWithDiscountSchema } from 'esu-types';
import { hotels, roomTypes, promotions } from '../schema.js';
import type { DbInstance } from '../utils/index.js';
import {
  buildSearchFilter,
  buildGeoDistanceSql,
  buildBaseCondition,
  buildFilterConditions,
  applyRoomTypesDiscount,
  sortHotelsByDistance,
  buildRulesFilter,
  getHotelMinPrice,
  normalizeLegacyParams,
  DEFAULT_SEARCH_RADIUS,
} from '../utils/hotel.js';
import type {
  HotelDistanceResult,
  HotelQueryResult,
  HotelQueryPromotion,
  HotelQueryRoomType,
  DrizzleCondition,
} from '../utils/hotel.js';
import { checkPermission, errorResponse } from '../utils/permissions.js';

type HotelWithRelations = v.InferOutput<typeof HotelWithRelationsSchema>;
type HotelDetail = v.InferOutput<typeof HotelDetailSchema>;
type RoomTypeWithDiscount = v.InferOutput<typeof RoomTypeWithDiscountSchema>;

export const createHotelsRouter = (s: ReturnType<typeof import('@ts-rest/fastify').initServer>, db: DbInstance) => {
  return s.router(hotelsContract, {
    create: async ({ body, request }) => {
      const jwt = await checkPermission(request, hotelsContract.create.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      if (jwt.role === 'merchant') {
        body.ownerId = jwt.id;
      }

      const owner = await db.query.users.findFirst({
        where: { id: { eq: body.ownerId } },
      });

      if (!owner || owner.role !== 'merchant') {
        return errorResponse(400, '无效的所有者');
      }

      const [newHotel] = await db
        .insert(hotels)
        .values({
          ...body,
          status: 'pending',
        })
        .returning();

      if (!newHotel) {
        return errorResponse(500, '酒店创建失败');
      }

      return { status: 201, body: newHotel };
    },

    list: async ({ query }) => {
      const page = Number(query.page) || 1;
      const limit = Number(query.limit) || 10;
      const offset = (page - 1) * limit;

      const hasGeoSearch = query.userLat !== undefined && query.userLng !== undefined;
      const userLat = typeof query.userLat === 'number' ? query.userLat : undefined;
      const userLng = typeof query.userLng === 'number' ? query.userLng : undefined;

      const { rules, sortBy, reversed } = normalizeLegacyParams({
        ...query,
        sortBy: query.sortBy,
      });

      const maxRadius = rules.distance?.[1] ?? DEFAULT_SEARCH_RADIUS;
      const minRadius = rules.distance?.[0];

      const searchFilter = buildSearchFilter(typeof query.keyword === 'string' ? query.keyword : undefined);

      let checkDateParam: [string, string] | undefined;
      if (rules.checkDate) {
        const [checkInDate, checkOutDate] = rules.checkDate;
        const checkInStr = String(checkInDate).split('T')[0] ?? '';
        const checkOutStr = String(checkOutDate).split('T')[0] ?? '';
        checkDateParam = [checkInStr, checkOutStr];
      }

      const hasEffectiveGeoSearch = hasGeoSearch || (userLat !== undefined && userLng !== undefined);
      const distanceSql =
        hasEffectiveGeoSearch && userLat !== undefined && userLng !== undefined
          ? buildGeoDistanceSql(userLat, userLng)
          : null;

      const baseCondition = buildBaseCondition();
      const filterConditions = buildFilterConditions({
        facilities: query.facilities,
        checkDate: checkDateParam,
      });
      const rulesFilterResult = buildRulesFilter(rules, hasGeoSearch, userLat, userLng);

      let finalCondition: DrizzleCondition = baseCondition;
      if (searchFilter) {
        finalCondition = and(finalCondition, searchFilter as DrizzleCondition);
      }
      if (filterConditions) {
        finalCondition = and(finalCondition, filterConditions);
      }
      if (rulesFilterResult) {
        finalCondition = and(finalCondition, rulesFilterResult);
      }

      let hotelIdsWithDistance: Array<{ id: number; distance: number | null }> = [];

      const minPriceSubquery = sql`(SELECT MIN(rt.price) FROM room_types rt WHERE rt.hotel_id = hotels.id AND rt.deleted_at IS NULL)`;

      if (hasEffectiveGeoSearch && userLat !== undefined && userLng !== undefined && distanceSql) {
        let geoCondition = finalCondition;
        if (minRadius !== undefined && minRadius > 0) {
          geoCondition = and(geoCondition, sql`${distanceSql} >= ${minRadius}` as DrizzleCondition);
        }
        geoCondition = and(geoCondition, sql`${distanceSql} <= ${maxRadius}` as DrizzleCondition);

        const baseQuery = db
          .select({
            id: hotels.id,
            distance: distanceSql,
            minPrice: minPriceSubquery,
          })
          .from(hotels)
          .where(geoCondition);

        let distanceQuery =
          sortBy === 'distance'
            ? baseQuery.orderBy(reversed ? sql`${distanceSql} DESC` : sql`${distanceSql} ASC`)
            : sortBy === 'price'
              ? baseQuery.orderBy(reversed ? sql`${minPriceSubquery} DESC` : sql`${minPriceSubquery} ASC`)
              : baseQuery;

        try {
          const result = (await distanceQuery) as HotelDistanceResult[];
          hotelIdsWithDistance = result.map((h: HotelDistanceResult) => ({
            id: h.id,
            distance: h.distance,
          }));
        } catch (e: unknown) {
          hotelIdsWithDistance = [];
        }
      } else {
        const orderByClauses: SQL[] = [];

        if (sortBy === 'price') {
          orderByClauses.push(reversed ? sql`${minPriceSubquery} DESC` : sql`${minPriceSubquery} ASC`);
        } else if (sortBy && sortBy !== 'distance') {
          let columnName: string = sortBy;
          if (sortBy === 'rating') {
            columnName = 'average_rating';
          } else if (sortBy === 'createdAt') {
            columnName = 'created_at';
          }
          const direction = reversed ? 'asc' : 'desc';
          orderByClauses.push(sql`${sql.raw(columnName)} ${sql.raw(direction)}`);
        }

        orderByClauses.push(sql`${hotels.id} desc`);

        const filteredIds = await db
          .select({
            id: hotels.id,
            minPrice: minPriceSubquery,
          })
          .from(hotels)
          .where(finalCondition)
          .orderBy(...orderByClauses);

        hotelIdsWithDistance = filteredIds.map((p: { id: number }) => ({ id: p.id, distance: null }));
      }

      const total = hotelIdsWithDistance.length;
      const pageHotels = hotelIdsWithDistance.slice(offset, offset + limit);

      if (pageHotels.length === 0) {
        return { status: 200 as const, body: { hotels: [], total, page } };
      }

      const hotelIds = pageHotels.map((h: { id: number }) => h.id);
      const distanceMap = new Map(pageHotels.map((h: { id: number; distance: number | null }) => [h.id, h.distance]));

      const todayStr = new Date().toISOString().split('T')[0] ?? '';

      const hotelList = await db.query.hotels.findMany({
        where: { id: { in: hotelIds } },
        with: {
          roomTypes: { where: { deletedAt: { isNull: true } } },
          promotions: { where: { deletedAt: { isNull: true } } },
        },
      });

      const hotelsWithDiscount: HotelWithRelations[] = hotelList.map((hotel: HotelQueryResult) => {
        const hotelPromos = (hotel.promotions ?? []).filter((p: HotelQueryPromotion) => {
          if (p.startDate > todayStr || p.endDate < todayStr) return false;
          if (p.hotelId !== null && p.hotelId !== hotel.id) return false;
          return true;
        });

        const roomTypesWithDiscount = (hotel.roomTypes ?? []).map((rt: HotelQueryRoomType) => {
          let price = Number(rt.price);
          const roomTypePromos = hotelPromos.filter(
            (p: HotelQueryPromotion) => p.roomTypeId === null || p.roomTypeId === rt.id,
          );
          for (const promo of roomTypePromos) {
            const promoValue = Number(promo.value);
            if (promo.type === 'percentage') {
              price = price * promoValue;
            } else if (promo.type === 'direct') {
              price = price - promoValue;
            } else if (promo.type === 'spend_and_save') {
              price = price - promoValue;
            }
          }
          return { ...rt, discountedPrice: Math.max(0, price) };
        }) as HotelWithRelations['roomTypes'];

        const hotelWithDistance: HotelWithRelations = {
          ...(hotel as unknown as HotelWithRelations),
          roomTypes: roomTypesWithDiscount,
          distance: distanceMap.get(hotel.id) ?? undefined,
        };

        return hotelWithDistance;
      });

      let sortedResult = hotelIds
        .map((id: number) => hotelsWithDiscount.find((h: HotelQueryResult) => h.id === id))
        .filter((h): h is HotelWithRelations => h !== undefined);

      return { status: 200 as const, body: { hotels: sortedResult, total, page } };
    },

    get: async ({ params }) => {
      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: params.id }, deletedAt: { isNull: true } },
        with: {
          roomTypes: { where: { deletedAt: { isNull: true } } },
          promotions: { where: { deletedAt: { isNull: true } } },
          owner: { columns: { id: true, username: true, role: true } },
        },
      });

      if (!hotel) {
        return errorResponse(404, '酒店不存在');
      }

      const roomTypesWithDiscount = await applyRoomTypesDiscount(db, hotel.id, hotel.roomTypes ?? []);

      const hotelDetail: HotelDetail = {
        ...hotel,
        roomTypes: roomTypesWithDiscount,
      };

      return { status: 200 as const, body: hotelDetail };
    },

    update: async ({ params, body, request }) => {
      const jwt = await checkPermission(request, hotelsContract.update.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const hotel = await db.query.hotels.findFirst({
        where: { id: { eq: params.id } },
      });

      if (!hotel) {
        return errorResponse(404, '酒店不存在');
      }

      if (jwt.role === 'merchant' && hotel.ownerId !== jwt.id) {
        return errorResponse(403, '无权限修改此酒店');
      }

      let newStatus = body.status;
      if (jwt.role === 'merchant' && hotel.status === 'approved') {
        newStatus = 'pending';
      }

      const [updated] = await db
        .update(hotels)
        .set({ ...body, status: newStatus, updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();

      if (!updated) {
        return errorResponse(500, '更新错误');
      }

      return { status: 200 as const, body: updated };
    },

    approve: async ({ params, request }) => {
      const jwt = await checkPermission(request, hotelsContract.approve.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const [updated] = await db
        .update(hotels)
        .set({ status: 'approved', updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();

      if (!updated) {
        return errorResponse(404, '酒店不存在');
      }

      return { status: 200 as const, body: updated };
    },

    reject: async ({ params, body, request }) => {
      const jwt = await checkPermission(request, hotelsContract.reject.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

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
        return errorResponse(404, '酒店不存在');
      }

      return { status: 200 as const, body: updated };
    },

    offline: async ({ params, request }) => {
      const jwt = await checkPermission(request, hotelsContract.offline.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const [updated] = await db
        .update(hotels)
        .set({ status: 'offline', updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();

      if (!updated) {
        return errorResponse(404, '酒店不存在');
      }

      return { status: 200 as const, body: updated };
    },

    online: async ({ params, request }) => {
      const jwt = await checkPermission(request, hotelsContract.online.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const [updated] = await db
        .update(hotels)
        .set({ status: 'approved', updatedAt: new Date() })
        .where(sql`${hotels.id} = ${params.id}`)
        .returning();

      if (!updated) {
        return errorResponse(404, '酒店不存在');
      }

      return { status: 200 as const, body: updated };
    },

    adminList: async ({ query, request }) => {
      const jwt = await checkPermission(request, hotelsContract.adminList.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const page = query.page || 1;
      const limit = query.limit || 10;
      const whereCondition: Record<string, unknown> = { deletedAt: { isNull: true } };

      if (query.status) {
        whereCondition.status = { eq: query.status };
      }

      const hotelList = await db.query.hotels.findMany({
        where: whereCondition,
        with: { owner: { columns: { id: true, username: true } } },
        limit,
        offset: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
      });

      return { status: 200 as const, body: { hotels: hotelList, total: hotelList.length, page } };
    },

    merchantList: async ({ query, request }) => {
      const jwt = await checkPermission(request, hotelsContract.merchantList.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const page = query.page || 1;
      const limit = query.limit || 10;

      const hotelList = await db.query.hotels.findMany({
        where: { ownerId: { eq: jwt.id }, deletedAt: { isNull: true } },
        limit,
        offset: (page - 1) * limit,
        orderBy: { createdAt: 'desc' },
      });

      return { status: 200 as const, body: { hotels: hotelList, total: hotelList.length, page } };
    },

    delete: async ({ params, request }) => {
      const jwt = await checkPermission(request, hotelsContract.delete.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      await db
        .update(hotels)
        .set({ deletedAt: new Date() })
        .where(sql`${hotels.id} = ${Number(params.id)}`);

      return { status: 200 as const, body: { message: 'Deleted' as const } };
    },
  });
};
