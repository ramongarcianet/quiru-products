const DELAYS_MINUTES = Object.freeze([5, 30, 120])

function retryDelayMinutes(attempt) {
  const index = Math.max(0, Math.min(Number(attempt || 1) - 1, DELAYS_MINUTES.length - 1))
  return DELAYS_MINUTES[index]
}

function shouldRetry(attempt, maxAttempts, permanent = false) {
  return !permanent && Number(attempt || 0) < Number(maxAttempts || 0)
}

module.exports = { DELAYS_MINUTES, retryDelayMinutes, shouldRetry }
