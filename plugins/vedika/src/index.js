require("dotenv").config();
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");
const compression = require("compression");
const { connectDB } = require("./config/database");
const { connectRedis } = require("./config/redis");
const horoscopeRoutes = require("./routes/horoscope.routes");
const healthRoutes = require("./routes/health.routes");
const logger = require("./utils/logger");

const app = express();
const PORT = process.env.PORT || 3140;

// Middleware
app.use(helmet());
app.use(
  cors({
    origin: process.env.CORS_ORIGINS
      ? process.env.CORS_ORIGINS.split(",")
      : "*",
  }),
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(compression());
app.use(morgan("combined", { stream: logger.stream }));

// Database Connections (Optional based on environment)
if (process.env.MONGODB_URI) connectDB();
if (process.env.REDIS_URL) connectRedis();

// Routes
app.use("/api/horoscope", horoscopeRoutes);
app.use("/health", healthRoutes);

// Error Handling
app.use((err, req, res, next) => {
  logger.error(err.stack);
  res.status(500).json({
    success: false,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message:
        process.env.NODE_ENV === "production"
          ? "An unexpected error occurred"
          : err.message,
    },
  });
});

// Start Server
app.listen(PORT, () => {
  logger.info(`Vedika Plugin server running on port ${PORT}`);
});

module.exports = app;
