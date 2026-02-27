import { carouselContract } from 'esu-types';
import { hotels } from '../schema.js';
import type { DbInstance } from '../utils/index.js';

export const createCarouselRouter = (s: ReturnType<typeof import('@ts-rest/fastify').initServer>, db: DbInstance) => {
  return s.router(carouselContract, {
    list: async ({ query }) => {
      const limit = query.limit || 10;

      const hotelList = await db.query.hotels.findMany({
        where: {
          deletedAt: { isNull: true },
          status: { eq: 'approved' },
          images: { isNotNull: true },
        },
        columns: { id: true, images: true },
        limit,
        orderBy: { createdAt: 'desc' },
      });

      const carouselItems = hotelList
        .filter((h: any) => h.images && h.images.length > 0 && h.images[0])
        .map((h: any) => ({
          hotelId: h.id,
          image: h.images![0]!,
        }));

      return { status: 200, body: carouselItems };
    },
  });
};
