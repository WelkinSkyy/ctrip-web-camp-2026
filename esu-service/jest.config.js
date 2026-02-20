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
  testTimeout: 30000,
};
