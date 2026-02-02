const { URL } = require("url");

function buildConnectionFromUrl(redisUrl) {
  if (!redisUrl) {
    return null;
  }

  try {
    const parsed = new URL(redisUrl);
    return {
      host: parsed.hostname,
      port: parsed.port ? Number(parsed.port) : 6379,
      username: parsed.username || undefined,
      password: parsed.password || undefined,
      tls: parsed.protocol === "rediss:" ? {} : undefined,
    };
  } catch (error) {
    console.warn("Invalid REDIS_URL provided", error.message);
    return null;
  }
}

function buildConnectionFromParts() {
  const host = process.env.REDIS_HOST || "127.0.0.1";
  const port = process.env.REDIS_PORT ? Number(process.env.REDIS_PORT) : 6379;
  const username = process.env.REDIS_USER || undefined;
  const password = process.env.REDIS_PASSWORD || undefined;
  const tls = process.env.REDIS_TLS === "true" ? {} : undefined;
  const db = process.env.REDIS_DB ? Number(process.env.REDIS_DB) : undefined;

  return {
    host,
    port,
    username,
    password,
    tls,
    db,
  };
}

const redisConnection = buildConnectionFromUrl(process.env.REDIS_URL) || buildConnectionFromParts();

module.exports = redisConnection;
