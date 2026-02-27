import { SQL, sql } from 'drizzle-orm';
import * as v from 'valibot';

import { hotelsContract, HotelWithRelationsSchema, HotelDetailSchema, RoomTypeWithDiscountSchema } from 'esu-types';
import { hotels, roomTypes, promotions, bookings } from '../schema.js';
import type { DbInstance } from '../utils/index.js';
import { checkPermission, errorResponse } from '../utils/permissions.js';
import {
  buildSearchFilter,
  buildGeoDistanceSql,
  buildBaseCondition,
  buildFilterConditions,
  applyRoomTypesDiscount,
  sortHotelsByDistance,
  buildRulesFilter,
  getHotelMinPrice,
  DEFAULT_SEARCH_RADIUS,
} from '../utils/hotel.js';
import type { FilterRules } from '../utils/hotel.js';

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

      const effectiveRadius = query.rules?.distance 
        ? query.rules.distance[1] 
        : (query.radius !== undefined ? Number(query.radius) : DEFAULT_SEARCH_RADIUS);

      const rules: FilterRules = {
        ...query.rules,
        // radius → distance: [0, radius]
        // 冲突处理：rules.distance 优先于 query.radius
        distance: query.rules?.distance ?? (query.radius !== undefined 
          ? [0, Number(query.radius)] 
          : undefined),
        // checkDate: [checkIn, checkOut]
        // 冲突处理：rules.checkDate 优先于 query.checkIn + query.checkOut
        checkDate: query.rules?.checkDate ?? (query.checkIn && query.checkOut 
          ? [query.checkIn, query.checkOut] 
          : undefined),
        price: query.rules?.price ?? (query.priceMin !== undefined || query.priceMax !== undefined
          ? [query.priceMin ?? 0, query.priceMax ?? Infinity]
          : undefined),
        starRating: query.rules?.starRating ?? (query.starRating !== undefined ? [query.starRating, query.starRating] : undefined),
      };

      let unavailableRoomTypeIds: number[] = [];
      if (rules.checkDate) {
        const [checkInDate, checkOutDate] = rules.checkDate;
        const checkInStr = String(checkInDate).split('T')[0];
        const checkOutStr = String(checkOutDate).split('T')[0];

        const bookedRoomTypes = await db.select({ roomTypeId: bookings.roomTypeId }).from(bookings).where(sql`
          ${bookings.status} IN ('pending', 'confirmed')
          AND ${bookings.checkIn} < ${checkOutStr}
          AND ${bookings.checkOut} > ${checkInStr}
        `);

        unavailableRoomTypeIds = bookedRoomTypes.map((b: { roomTypeId: number }) => b.roomTypeId);
      }

      const searchFilter = buildSearchFilter(typeof query.keyword === 'string' ? query.keyword : undefined);
      const filterConditions = buildFilterConditions({
        facilities: query.facilities,
        unavailableRoomTypeIds: unavailableRoomTypeIds.length > 0 ? unavailableRoomTypeIds : undefined,
      });

      const rulesFilter = buildRulesFilter(rules, hasGeoSearch, userLat, userLng);

      const sortBy = typeof query.sortBy === 'string' ? query.sortBy : undefined;
      const reversed = query.reversed ?? false;

      const hasEffectiveGeoSearch = hasGeoSearch || (userLat !== undefined && userLng !== undefined);
      const distanceSql = hasEffectiveGeoSearch && userLat !== undefined && userLng !== undefined
        ? buildGeoDistanceSql(userLat, userLng)
        : null;

      const baseCondition = buildBaseCondition();
      const whereClauses: SQL[] = [baseCondition];

      if (searchFilter) {
        whereClauses.push(searchFilter);
      }
      if (filterConditions) {
        whereClauses.push(filterConditions);
      }
      if (rulesFilter) {
        whereClauses.push(rulesFilter);
      }

      let hotelIdsWithDistance: Array<{ id: number; distance: number | null }> = [];

      if (hasEffectiveGeoSearch && userLat !== undefined && userLng !== undefined && distanceSql) {
        whereClauses.push(sql`${distanceSql} <= ${effectiveRadius}`);

        hotelIdsWithDistance = await db
          .select({
            id: hotels.id,
            distance: sql<number>`${distanceSql}`,
          })
          .from(hotels)
          .where(sql`${sql.join(whereClauses, sql` AND `)}`);

        if (sortBy === 'distance') {
          const direction = reversed ? -1 : 1;
          hotelIdsWithDistance.sort((a, b) => {
            const aDist = a.distance ?? Infinity;
            const bDist = b.distance ?? Infinity;
            return (aDist - bDist) * direction;
          });
        }
      } else {
        const orderByClauses: SQL[] = [];

        if (sortBy && sortBy !== 'price' && sortBy !== 'distance') {
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
          .select({ id: hotels.id })
          .from(hotels)
          .where(sql`${sql.join(whereClauses, sql` AND `)}`)
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

      const hotelList = await db.query.hotels.findMany({
        where: { id: { in: hotelIds } },
        with: {
          roomTypes: { where: { deletedAt: { isNull: true } } },
          promotions: { where: { deletedAt: { isNull: true } } },
        },
      });

      const hotelsWithDiscount: HotelWithRelations[] = await Promise.all(
        hotelList.map(async (hotel: any) => {
          const roomTypesWithDiscount = await applyRoomTypesDiscount(db, hotel.id, hotel.roomTypes ?? []);

          const hotelWithDistance: HotelWithRelations = {
            ...hotel,
            roomTypes: roomTypesWithDiscount,
            distance: distanceMap.get(hotel.id) ?? undefined,
          };

          return hotelWithDistance;
        }),
      );

      let sortedResult = hotelIds
        .map((id: number) => hotelsWithDiscount.find((h: any) => h.id === id))
        .filter((h): h is HotelWithRelations => h !== undefined);

      if (sortBy === 'price') {
        const direction = reversed ? -1 : 1;
        sortedResult.sort((a, b) => {
          const priceA = getHotelMinPrice(a);
          const priceB = getHotelMinPrice(b);
          return (priceA - priceB) * direction;
        });
      }

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

async function handleGeoSearch(
  db: DbInstance,
  userLat: number,
  userLng: number,
  radius: number,
  searchFilter: SQL | undefined,
  filterConditions: SQL | undefined,
  rulesFilter: SQL | undefined,
  sortBy: string | undefined,
  reversed: boolean,
  offset: number,
  limit: number,
  page: number,
) {
  const distanceSql = buildGeoDistanceSql(userLat, userLng);
  const baseCondition = buildBaseCondition();

  const whereClauses: SQL[] = [baseCondition];

  if (searchFilter) {
    whereClauses.push(searchFilter);
  }

  if (filterConditions) {
    whereClauses.push(filterConditions);
  }

  if (rulesFilter) {
    whereClauses.push(rulesFilter);
  }

  whereClauses.push(sql`${distanceSql} <= ${radius}`);

  const hotelsWithDistance: Array<{ id: number; distance: number | null }> = await db
    .select({
      id: hotels.id,
      distance: sql<number>`${distanceSql}`,
    })
    .from(hotels)
    .where(sql`${sql.join(whereClauses, sql` AND `)}`);

  let sortedHotels: Array<{ id: number; distance: number | null }> = hotelsWithDistance;
  if (sortBy === 'distance') {
    const direction = reversed ? -1 : 1;
    sortedHotels = [...hotelsWithDistance].sort((a, b) => {
      const aDist = a.distance ?? Infinity;
      const bDist = b.distance ?? Infinity;
      return (aDist - bDist) * direction;
    });
  }

  const total = sortedHotels.length;
  const pageHotels = sortedHotels.slice(offset, offset + limit);

  if (pageHotels.length === 0) {
    return { status: 200 as const, body: { hotels: [], total, page } };
  }

  const hotelIds = pageHotels.map((h: { id: number }) => h.id);
  const distanceMap = new Map(pageHotels.map((h: { id: number; distance: number | null }) => [h.id, h.distance]));

  const hotelList = await db.query.hotels.findMany({
    where: { id: { in: hotelIds } },
    with: {
      roomTypes: { where: { deletedAt: { isNull: true } } },
      promotions: { where: { deletedAt: { isNull: true } } },
    },
  });

  const hotelsWithDiscount = await Promise.all(
    hotelList.map(async (hotel: any) => {
      const roomTypesWithDiscount = await applyRoomTypesDiscount(db, hotel.id, hotel.roomTypes ?? []);

      const hotelWithDistance: HotelWithRelations = {
        ...hotel,
        roomTypes: roomTypesWithDiscount,
        distance: distanceMap.get(hotel.id) ?? undefined,
      };

      return hotelWithDistance;
    }),
  );

  let finalSortedResult = hotelIds
    .map((id: number) => hotelsWithDiscount.find((h: any) => h.id === id))
    .filter((h): h is HotelWithRelations => h !== undefined);

  return { status: 200 as const, body: { hotels: finalSortedResult, total, page } };
}

async function handleNormalSearch(
  db: DbInstance,
  searchFilter: SQL | undefined,
  filterConditions: SQL | undefined,
  rulesFilter: SQL | undefined,
  sortBy: string | undefined,
  reversed: boolean,
  offset: number,
  limit: number,
  page: number,
) {
  const baseCondition = buildBaseCondition();

  const whereClauses: SQL[] = [baseCondition];

  if (searchFilter) {
    whereClauses.push(searchFilter);
  }

  if (filterConditions) {
    whereClauses.push(filterConditions);
  }

  if (rulesFilter) {
    whereClauses.push(rulesFilter);
  }

  const filteredIds = await db
    .select({ id: hotels.id })
    .from(hotels)
    .where(sql`${sql.join(whereClauses, sql` AND `)}`);

  const total = filteredIds.length;
  const pageIds = filteredIds.slice(offset, offset + limit).map((p: { id: number }) => p.id);

  if (pageIds.length === 0) {
    return { status: 200 as const, body: { hotels: [], total, page } };
  }

  let orderBy: Record<string, 'asc' | 'desc'> = reversed ? { createdAt: 'asc' } : { createdAt: 'desc' };
  if (sortBy === 'rating') {
    orderBy = reversed ? { averageRating: 'asc' } : { averageRating: 'desc' };
  }

  const hotelList = await db.query.hotels.findMany({
    where: { id: { in: pageIds } },
    with: {
      roomTypes: { where: { deletedAt: { isNull: true } } },
      promotions: { where: { deletedAt: { isNull: true } } },
    },
    orderBy,
  });

  const hotelsWithDiscount: HotelWithRelations[] = await Promise.all(
    hotelList.map(async (hotel: any) => {
      const roomTypesWithDiscount = await applyRoomTypesDiscount(db, hotel.id, hotel.roomTypes ?? []);

      return { ...hotel, roomTypes: roomTypesWithDiscount };
    }),
  );

  let sortedResult = hotelsWithDiscount;

  return { status: 200 as const, body: { hotels: sortedResult, total, page } };
}
