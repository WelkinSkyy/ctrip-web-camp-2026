// main.ts
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { routerPlugin } from './router.js';

const app = Fastify({ logger: true });

// 注册 JWT 插件
app.register(fastifyJwt, { secret: 'supersecret' }); // 生产环境请使用安全的密钥

// 请求钩子：除注册和登录外的所有路由都需要验证 JWT
app.addHook('onRequest', async (request, reply) => {
  try {
    if (
      !['/users/register', '/users/login'].includes(
        request.url,
      )
    ) {
      await request.jwtVerify();
    }
  } catch (err) {
    reply.code(401).send({ error: '未授权' });
  }
});

// 注册 ts-rest 路由插件
app.register(routerPlugin);

const start = async () => {
  try {
    await app.listen({ port: 3000 });
    app.log.info('服务器已启动，监听端口 3000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
