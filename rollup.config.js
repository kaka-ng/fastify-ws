import TypeScript from '@rollup/plugin-typescript'

export default [
  {
    input: 'lib/index.ts',
    output: [
      { dir: 'lib', format: 'cjs', sourcemap: true },
    ],
    plugins: [TypeScript({ module: 'ESNext', outDir: 'lib', include: ['lib/**/*'] })],
    external: ['@kakang/validator', 'fastify-plugin']
  },
  {
    input: 'lib/index.ts',
    output: [
      { dir: 'lib/mjs', format: 'esm', sourcemap: true },
    ],
    plugins: [TypeScript({ module: 'ESNext', outDir: 'lib/mjs', include: ['lib/**/*'] })],
    external: ['@kakang/validator', 'fastify-plugin']
  },
]