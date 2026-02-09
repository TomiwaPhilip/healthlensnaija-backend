const DEFAULT_POINTS = Number(process.env.RATE_LIMIT_POINTS) || 5;
const DEFAULT_DURATION = Number(process.env.RATE_LIMIT_DURATION_SECONDS) || 60;

function createMemoryLimiter({ points = DEFAULT_POINTS, durationSeconds = DEFAULT_DURATION } = {}) {
  const store = new Map();

  async function consume(key = "global") {
    const now = Date.now();
    const ttl = durationSeconds * 1000;
    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = {
        remaining: points,
        resetAt: now + ttl,
      };
    }

    if (entry.remaining <= 0) {
      const error = new Error("Too Many Requests");
      error.msBeforeNext = Math.max(0, entry.resetAt - now);
      error.remainingPoints = 0;
      throw error;
    }

    entry.remaining -= 1;
    store.set(key, entry);

    return {
      remainingPoints: entry.remaining,
      msBeforeNext: Math.max(0, entry.resetAt - now),
    };
  }

  return { consume };
}

const forgotLimiter = createMemoryLimiter({
  points: Number(process.env.FORGOT_EMAIL_POINTS) || DEFAULT_POINTS,
  durationSeconds: Number(process.env.FORGOT_EMAIL_WINDOW_SECONDS) || DEFAULT_DURATION,
});

const forgotIPLimiter = createMemoryLimiter({
  points: Number(process.env.FORGOT_IP_POINTS) || DEFAULT_POINTS,
  durationSeconds: Number(process.env.FORGOT_IP_WINDOW_SECONDS) || DEFAULT_DURATION,
});

module.exports = {
  forgotLimiter,
  forgotIPLimiter,
};
