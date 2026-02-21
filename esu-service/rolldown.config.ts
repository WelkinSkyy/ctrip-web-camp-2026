import { defineConfig } from 'rolldown';
import { dts } from 'rolldown-plugin-dts';
import pkg from './package.json' with { type: 'json' };

const config = defineConfig({
  input: pkg.main,
  platform: 'node',
  plugins: [dts()],
});

export default config;
