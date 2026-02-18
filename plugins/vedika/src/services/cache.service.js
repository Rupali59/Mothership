const crypto = require("crypto");
const { getRedisClient } = require("../config/redis");
const logger = require("../utils/logger");

class CacheService {
  constructor() {
    this.ttl = parseInt(process.env.CACHE_TTL || "604800", 10); // Default 7 days
  }

  generateBirthHash(birthDetails) {
    const data = `${birthDetails.date}|${birthDetails.time}|${birthDetails.latitude}|${birthDetails.longitude}|${birthDetails.timezone}`;
    return crypto.createHash("sha256").update(data).digest("hex");
  }

  async get(key) {
    const client = getRedisClient();
    if (!client || !client.isOpen) return null;

    try {
      const data = await client.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      logger.error(`Redis Get Error: ${error.message}`);
      return null;
    }
  }

  async set(key, value, ttl = this.ttl) {
    const client = getRedisClient();
    if (!client || !client.isOpen) return;

    try {
      await client.set(key, JSON.stringify(value), {
        EX: ttl,
      });
    } catch (error) {
      logger.error(`Redis Set Error: ${error.message}`);
    }
  }
}

module.exports = new CacheService();
