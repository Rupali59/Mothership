const express = require("express");
const router = express.Router();
const mongoose = require("mongoose");
const { getRedisClient } = require("../config/redis");

router.get("/", async (req, res) => {
  const redisClient = getRedisClient();
  const redisStatus =
    redisClient && redisClient.isOpen ? "connected" : "disconnected";
  const dbStatus =
    mongoose.connection.readyState === 1 ? "connected" : "disconnected";

  res.status(200).json({
    status: "healthy",
    services: {
      mongodb: dbStatus,
      redis: redisStatus,
    },
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
