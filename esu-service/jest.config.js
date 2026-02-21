/**
 * Jest 配置文件
 *
 * 使用真实数据库和真实依赖进行集成测试
 */
export default {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { useESM: true }],
  },
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  testTimeout: 30000,
    // 检测未关闭的句柄
  detectOpenHandles: true,
  // 强制退出（确保测试完成后 Jest 能够正常退出）
  forceExit: true,
  // 并发设置为 1，避免数据库连接冲突
  maxWorkers: 1,
};
