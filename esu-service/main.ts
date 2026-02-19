// main.ts
import Fastify from 'fastify';
import fastifyJwt from '@fastify/jwt';
import { routerPlugin } from './router.js';

const app = Fastify({ logger: true });

// 注册 JWT 插件
if (process.env.JWT_SECRET === undefined)
  throw Error(
    'Esu need a valid secret for jwt verification.',
  );

const PORT = parseInt(process.env.ESU_PORT ?? '3000');

app.register(fastifyJwt, {
  secret: process.env.JWT_SECRET,
}); // 生产环境请使用安全的密钥

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
    await app.listen({ port: PORT });
    app.log.info(`服务器已启动，监听端口 $PORT`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
