const { createClient } = require("redis");
const logger = require("../utils/logger");

let redisClient;

const connectRedis = async () => {
  redisClient = createClient({
    url: process.env.REDIS_URL,
  });

  redisClient.on("error", (err) => logger.error("Redis Client Error", err));
  redisClient.on("connect", () => logger.info("Redis Client Connected"));

  await redisClient.connect();
};

const getRedisClient = () => redisClient;

module.exports = { connectRedis, getRedisClient };
