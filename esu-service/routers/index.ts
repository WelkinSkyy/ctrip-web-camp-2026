import { initServer } from '@ts-rest/fastify';

import { contract } from 'esu-types';
import type { DbInstance } from '../utils/index.js';
import { createUsersRouter } from './users.js';
import { createHotelsRouter } from './hotels.js';
import { createRoomTypesRouter } from './room-types.js';
import { createPromotionsRouter } from './promotions.js';
import { createBookingsRouter } from './bookings.js';
import { createRatingsRouter } from './ratings.js';
import { createCarouselRouter } from './carousel.js';

export const createRouter = (db: DbInstance) => {
  const s = initServer();

  const usersRouter = createUsersRouter(s, db);
  const hotelsRouter = createHotelsRouter(s, db);
  const roomTypesRouter = createRoomTypesRouter(s, db);
  const promotionsRouter = createPromotionsRouter(s, db);
  const bookingsRouter = createBookingsRouter(s, db);
  const ratingsRouter = createRatingsRouter(s, db);
  const carouselRouter = createCarouselRouter(s, db);

  const router = s.router(contract, {
    users: usersRouter,
    hotels: hotelsRouter,
    roomTypes: roomTypesRouter,
    promotions: promotionsRouter,
    bookings: bookingsRouter,
    ratings: ratingsRouter,
    carousel: carouselRouter,
  });

  return s.plugin(router);
};
