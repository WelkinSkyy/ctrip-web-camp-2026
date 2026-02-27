import type { FastifyRequest } from 'fastify';
import * as v from 'valibot';

import { roleType, JwtSchema, UserSchema } from 'esu-types';

export type { FastifyRequest };

export type Role = (typeof roleType)[number];

export type JwtPayload = v.InferOutput<typeof JwtSchema>;

export interface PermissionCheckResult {
  error: false;
  id: number;
  role: Role;
}

export interface PermissionErrorResult {
  error: true;
  status: 400 | 401 | 403 | 404 | 500;
  message: string;
}

export type PermissionResult = PermissionCheckResult | PermissionErrorResult;

type HttpStatusCode = 400 | 401 | 403 | 404 | 500;

export const errorResponse = <const T extends HttpStatusCode>(
  status: T,
  message: string,
): { status: T; body: { message: string } } => ({
  status,
  body: { message },
});

export const checkPermission = async (
  request: FastifyRequest,
  permissions: readonly Role[] | null | string[],
): Promise<PermissionResult> => {
  if (permissions === null) return { error: false, id: 0, role: 'customer' as Role };

  await request.jwtVerify();
  const parsed = v.parse(JwtSchema, request.user);
  const perms = permissions as readonly Role[];

  if (!perms.includes(parsed.role)) {
    return {
      error: true,
      status: 403,
      message: '无权限：您的角色无权访问此接口',
    };
  }

  return { ...parsed, error: false };
};

export const omitPassword = <T extends v.InferInput<typeof UserSchema>>(user: T): Omit<T, 'password'> => {
  const { password, ...rest } = user as T & { password?: string };
  return rest;
};
