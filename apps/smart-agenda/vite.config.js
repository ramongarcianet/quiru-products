import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { fileURLToPath } from 'node:url'
import { resolve } from 'node:path'
import { notificationServiceWorkerPlugin } from '../../packages/notification-core/vite-plugin.js'

const root = fileURLToPath(new URL('.', import.meta.url))
export default defineConfig({
  root,
  cacheDir: resolve(root, '../../node_modules/.vite/smart-agenda'),
  envDir: resolve(root, '../..'),
  plugins: [vue(), notificationServiceWorkerPlugin()],
  publicDir: resolve(root, 'public'),
  server: { port: 4173 },
  build: { target: 'es2020', outDir: resolve(root, '../../dist/smart-agenda'), emptyOutDir: true }
})
