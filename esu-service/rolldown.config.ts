import { defineConfig } from 'rolldown';
import pkg from './package.json' with { type: 'json' };

const config = defineConfig({
  input: pkg.main,
  platform: 'node',
  output: {
    file: 'dist/main.mjs'
  }
});

export default config;
