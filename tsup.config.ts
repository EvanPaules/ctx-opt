import { defineConfig } from 'tsup';

export default defineConfig({
  entry: {
    index: 'src/index.ts',
    'adapters/openai': 'src/adapters/openai.ts',
    'adapters/anthropic': 'src/adapters/anthropic.ts',
    'adapters/ai-sdk': 'src/adapters/ai-sdk.ts',
    'scorers/index': 'src/scorers/index.ts',
  },
  format: ['esm', 'cjs'],
  dts: true,
  clean: true,
  sourcemap: true,
  target: 'node18',
  splitting: false,
  external: ['openai', '@anthropic-ai/sdk', 'ai'],
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
