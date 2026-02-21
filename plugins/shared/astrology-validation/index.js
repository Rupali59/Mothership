/**
 * Shared astrology validation for Vedika and Jhora plugins.
 * Provides input validation and credential gating.
 */

/**
 * Validates birth details required for horoscope generation.
 * @param {object} birthDetails - { date, time, latitude, longitude, timezone? }
 * @returns {{ valid: boolean, error?: string }}
 */
function validateBirthDetails(birthDetails) {
  if (!birthDetails || typeof birthDetails !== "object") {
    return { valid: false, error: "Birth details are required" };
  }

  const { date, time, latitude, longitude } = birthDetails;

  if (!date || typeof date !== "string") {
    return { valid: false, error: "Birth date is required (YYYY-MM-DD)" };
  }
  if (!time || typeof time !== "string") {
    return { valid: false, error: "Birth time is required (HH:MM or HH:MM:SS)" };
  }
  if (latitude == null || typeof latitude !== "number") {
    return { valid: false, error: "Latitude is required (number)" };
  }
  if (longitude == null || typeof longitude !== "number") {
    return { valid: false, error: "Longitude is required (number)" };
  }

  if (latitude < -90 || latitude > 90) {
    return { valid: false, error: "Latitude must be between -90 and 90" };
  }
  if (longitude < -180 || longitude > 180) {
    return { valid: false, error: "Longitude must be between -180 and 180" };
  }

  return { valid: true };
}

/**
 * Resolves Vedika credentials from request headers (MongoDB plugin_config).
 * @param {object} req - Express request
 * @returns {{ apiKey?: string, apiUrl?: string }}
 */
function getVedikaCredentials(req) {
  const apiKey = req && req.get && req.get("X-Vedika-API-Key");
  const apiUrl =
    (req && req.get && req.get("X-Vedika-Api-Url")) ||
    "https://api.vedika.io/v2/astrology";

  return { apiKey, apiUrl };
}

/**
 * Resolves Jhora credentials from request headers (MongoDB plugin_config).
 * @param {object} req - Express request
 * @returns {{ apiUrl?: string }}
 */
function getJhoraCredentials(req) {
  const apiUrl = req && req.get && req.get("X-Jhora-Api-Url");

  return { apiUrl };
}

/**
 * Validates that Vedika is ready to make API calls.
 * @param {object} req - Express request
 * @returns {{ ready: boolean, error?: string, credentials?: { apiKey, apiUrl } }}
 */
function validateVedikaReady(req) {
  const { apiKey, apiUrl } = getVedikaCredentials(req);

  if (!apiKey || typeof apiKey !== "string") {
    return { ready: false, error: "Vedika API key is not configured" };
  }

  const trimmed = apiKey.trim();
  if (!trimmed) {
    return { ready: false, error: "Vedika API key is empty" };
  }

  // Basic format: non-empty, reasonable length
  if (trimmed.length < 8) {
    return { ready: false, error: "Vedika API key appears invalid" };
  }

  return {
    ready: true,
    credentials: { apiKey: trimmed, apiUrl },
  };
}

/**
 * Validates that Jhora is ready to make API calls.
 * @param {object} req - Express request
 * @returns {{ ready: boolean, error?: string, credentials?: { apiUrl } }}
 */
function validateJhoraReady(req) {
  const { apiUrl } = getJhoraCredentials(req);

  if (!apiUrl || typeof apiUrl !== "string") {
    return { ready: false, error: "JHora API URL is not configured" };
  }

  const trimmed = apiUrl.trim();
  if (!trimmed) {
    return { ready: false, error: "JHora API URL is empty" };
  }

  // Basic URL validation
  try {
    const parsed = new URL(trimmed);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { ready: false, error: "JHora API URL must be http or https" };
    }
  } catch {
    return { ready: false, error: "JHora API URL is not a valid URL" };
  }

  return {
    ready: true,
    credentials: { apiUrl: trimmed },
  };
}

module.exports = {
  validateBirthDetails,
  getVedikaCredentials,
  getJhoraCredentials,
  validateVedikaReady,
  validateJhoraReady,
};
