import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'

const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root,
  cacheDir: resolve(root, '../../node_modules/.vite/serve-ai'),
  envDir: resolve(root, '../..'),
  plugins: [vue()],
  publicDir: false,
  server: { port: 4174 },
  build: { target: 'es2020', outDir: resolve(root, '../../dist/serve-ai'), emptyOutDir: true }
})
