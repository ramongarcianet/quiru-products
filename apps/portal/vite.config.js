import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root,
  cacheDir: resolve(root, '../../node_modules/.vite/portal'),
  envDir: resolve(root, '../..'),
  plugins: [vue()],
  publicDir: false,
  server: { port: 4170 },
  build: { target: 'es2020', outDir: resolve(root, '../../dist/portal'), emptyOutDir: true }
})
