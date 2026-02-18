const axios = require("axios");
const logger = require("../utils/logger");

/**
 * Middleware to validate Motherboard auth token and extract workspaceId.
 */
async function validateMotherboardToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ success: false, error: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // Verify token with motherboard-server (or auth service)
    // Using MOTHERBOARD_API from env
    const response = await axios.get(
      `${process.env.MOTHERBOARD_API}/api/auth/verify`,
      {
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    // Expected response format from motherboard-server:
    // { success: true, user: { ... }, workspaceId: "..." }
    if (response.data && response.data.success) {
      req.user = response.data.user;
      req.workspaceId = response.data.workspaceId;
      next();
    } else {
      res.status(401).json({ success: false, error: "Invalid token" });
    }
  } catch (error) {
    logger.error(`Auth validation failed: ${error.message}`);
    res.status(401).json({
      success: false,
      error: "Authentication failed",
      details: error.response?.data || error.message,
    });
  }
}

module.exports = { validateMotherboardToken };
