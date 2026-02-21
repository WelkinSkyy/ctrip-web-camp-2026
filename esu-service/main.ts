// main.ts
import 'dotenv/config';
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import fastifyPrintRoutes from 'fastify-print-routes';
// PostgreSQL 连接池
import { Pool } from 'pg';
// Drizzle ORM PostgreSQL 驱动
import { drizzle } from 'drizzle-orm/node-postgres';
import { relations } from './schema.js';
import { createRouter } from './router-factory.js';

const app = Fastify({ logger: true });

// 注册 JWT 插件
if (process.env.JWT_SECRET === undefined) throw Error('Esu need a valid secret for jwt verification.');

const PORT = parseInt(process.env.ESU_PORT ?? '3000');

app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET,
}); // 生产环境请使用安全的密钥

// 请求钩子：除注册和登录外的所有路由都需要验证 JWT
// app.addHook('onRequest', async (request, reply) => {
//   try {
//     if (
//       !['/users/register', '/users/login'].includes(
//         request.url,
//       )
//     ) {
//       await request.jwtVerify();
//     }
//   } catch (err) {
//     reply.code(401).send({ error: '未授权' });
//   }
// });

/**
 * PostgreSQL 连接池配置
 * 使用环境变量 DATABASE_URL 获取连接字符串
 */
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

/**
 * Drizzle ORM 实例
 * 配置日志输出便于开发调试
 */
const db = drizzle({
  client: pool,
  logger: process.env.NODE_ENV === 'development', // 开发环境启用日志
  relations,
});

// 注册 ts-rest 路由插件
await app.register(fastifyPrintRoutes);
app.register(createRouter(db));

const start = async () => {
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' });
    app.log.info(`服务器已启动，监听端口 ${PORT}`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
