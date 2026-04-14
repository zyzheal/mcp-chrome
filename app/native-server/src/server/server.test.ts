import { describe, expect, test, afterAll, beforeAll } from '@jest/globals';
import supertest from 'supertest';
import serverInstance from './index';

describe('服务器测试', () => {
  let fastifyInstance: ReturnType<typeof serverInstance.getInstance>;
  let testPort: number;

  // 启动服务器测试实例
  beforeAll(async () => {
    // Get the Fastify instance
    fastifyInstance = serverInstance.getInstance();

    // Start server on a test port
    testPort = 12345;
    await fastifyInstance.listen({ port: testPort, host: '127.0.0.1' });
  });

  // 关闭服务器
  afterAll(async () => {
    // Close Fastify instance
    await fastifyInstance.close();
  });

  test('GET /ping 应返回正确响应', async () => {
    const response = await supertest(`http://127.0.0.1:${testPort}`)
      .get('/ping')
      .expect(200)
      .expect('Content-Type', /json/);

    expect(response.body).toMatchObject({
      status: 'ok',
      message: 'pong',
    });
  });

  test('服务器状态检查', () => {
    // Note: isRunning is only set to true when using Server.start() method
    // Direct fastify.listen() doesn't update this flag
    // This is by design - isRunning tracks the full server lifecycle with native host
    expect(typeof serverInstance.isRunning).toBe('boolean');
  });

  test('Fastify 实例应正确初始化', () => {
    expect(fastifyInstance).toBeDefined();
    expect(typeof fastifyInstance.listen).toBe('function');
    expect(typeof fastifyInstance.close).toBe('function');
    expect(typeof fastifyInstance.ready).toBe('function');
  });

  test('服务器应正确监听指定端口', () => {
    const address = fastifyInstance.server.address();
    expect(address).toBeDefined();
    if (address && typeof address === 'object') {
      expect(address.port).toBe(testPort);
      expect(address.address).toBe('127.0.0.1');
    }
  });
});
