const SESSION_KEY = 'quiru-serve-telemetry-v1'

export class ServeTelemetry {
  constructor(enabled = true) { this.enabled = enabled; this.startedAt = Date.now() }

  track(name, data = {}) {
    if (!this.enabled) return
    const allowed = ['mode', 'source', 'itemCount', 'total', 'turns', 'aiCalls', 'toolCalls', 'durationMs', 'reason']
    const safeData = Object.fromEntries(Object.entries(data).filter(([key]) => allowed.includes(key)))
    const event = { name, at: new Date().toISOString(), ...safeData }
    try {
      const stored = JSON.parse(sessionStorage.getItem(SESSION_KEY) || '[]')
      sessionStorage.setItem(SESSION_KEY, JSON.stringify([...stored.slice(-99), event]))
    } catch (cause) {
      console.debug('Telemetría local no disponible', cause)
    }
  }

  summary(metrics = {}) { return { durationMs: Date.now() - this.startedAt, ...metrics } }
}
