import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const workerPath = fileURLToPath(new URL('./firebase-messaging-sw.js', import.meta.url))

export function notificationServiceWorkerPlugin() {
  return {
    name: 'quiru-notification-service-worker',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const pathname = String(request.url || '').split('?')[0]
        if (pathname !== '/firebase-messaging-sw.js') return next()
        response.statusCode = 200
        response.setHeader('Content-Type', 'application/javascript; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(readFileSync(workerPath, 'utf8'))
      })
    },
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'firebase-messaging-sw.js',
        source: readFileSync(workerPath, 'utf8')
      })
    }
  }
}
