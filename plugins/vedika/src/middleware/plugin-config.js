const mongoose = require("mongoose");
const logger = require("../utils/logger");

const PLUGIN_ID = "astrology-vedika";
const CONFIG_COLLECTION = "plugin_configurations";

/**
 * Middleware that fetches Vedika plugin config from MongoDB (plugin_configurations)
 * and injects vedika_api_key and vedika_api_url as request headers.
 * Must run before astrologyValidationMiddleware.
 */
async function pluginConfigMiddleware(req, res, next) {
  const workspaceId = req.get("X-Workspace-ID");

  if (!workspaceId || typeof workspaceId !== "string") {
    logger.debug("pluginConfigMiddleware: no X-Workspace-ID, skipping config fetch");
    return next();
  }

  if (mongoose.connection.readyState !== 1) {
    logger.warn("pluginConfigMiddleware: MongoDB not connected, cannot fetch plugin config");
    return next();
  }

  try {
    const doc = await mongoose.connection.db
      .collection(CONFIG_COLLECTION)
      .findOne({ plugin_id: PLUGIN_ID, workspace_id: workspaceId });

    if (doc && doc.config) {
      const { vedika_api_key, vedika_api_url } = doc.config;

      if (vedika_api_key) {
        req.headers["x-vedika-api-key"] = vedika_api_key;
      }
      if (vedika_api_url) {
        req.headers["x-vedika-api-url"] = vedika_api_url;
      }
    }
  } catch (err) {
    logger.error(`pluginConfigMiddleware: failed to fetch config: ${err.message}`);
  }

  next();
}

module.exports = { pluginConfigMiddleware };
