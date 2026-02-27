import bcrypt from 'bcryptjs';

import { usersContract } from 'esu-types';
import { users } from '../schema.js';
import type { DbInstance } from '../utils/index.js';
import { checkPermission, errorResponse, omitPassword } from '../utils/index.js';

export const createUsersRouter = (s: ReturnType<typeof import('@ts-rest/fastify').initServer>, db: DbInstance) => {
  return s.router(usersContract, {
    register: async ({ body }) => {
      const hashedPassword = await bcrypt.hash(body.password, 10);
      const [newUser] = await db
        .insert(users)
        .values({
          ...body,
          password: hashedPassword,
        })
        .returning();

      if (!newUser) {
        return errorResponse(500, '用户创建失败');
      }

      return { status: 201, body: omitPassword(newUser) };
    },

    login: async ({ body, request }) => {
      const app = request.server;
      const user = await db.query.users.findFirst({
        where: { username: { eq: body.username } },
      });

      if (!user || !(await bcrypt.compare(body.password, user.password))) {
        return errorResponse(401, '用户名或密码错误');
      }

      if (user.deletedAt) {
        return errorResponse(403, '该账号已被禁用');
      }

      const token = app.jwt.sign({ id: user.id, role: user.role });
      return { status: 200, body: { token, user: omitPassword(user) } };
    },

    me: async ({ request }) => {
      const jwt = await checkPermission(request, usersContract.me.metadata.permission);

      if ('error' in jwt && jwt.error) {
        return errorResponse(jwt.status, jwt.message);
      }

      const user = await db.query.users.findFirst({
        where: { id: { eq: jwt.id } },
      });

      if (!user) {
        return errorResponse(404, '用户不存在');
      }

      if (user.deletedAt) {
        return errorResponse(403, '该账号已被禁用');
      }

      return { status: 200, body: omitPassword(user) };
    },
  });
};
