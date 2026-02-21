const axios = require("axios");
const logger = require("../utils/logger");

class JHoraProcessorService {
  constructor() {
    this.defaultApiUrl = process.env.JHORA_API_URL;
  }

  /**
   * @param {object} birthDetails - Validated birth details
   * @param {{ apiUrl: string }} options - Validated API URL (required)
   */
  async fetchHoroscope(birthDetails, options = {}) {
    const { apiUrl = this.defaultApiUrl } = options;

    if (!apiUrl || typeof apiUrl !== "string") {
      throw new Error("JHora API URL is required");
    }

    try {
      logger.info(
        `Calling JHora API at ${apiUrl} for ${birthDetails.date} ${birthDetails.time}`,
      );

      // Call external JHora API
      const response = await axios.post(
        `${apiUrl}/calculate`,
        birthDetails,
        {
          headers: { "Content-Type": "application/json" },
          timeout: 30000, // 30 seconds timeout
        },
      );

      // Handle response data
      let data = response.data;

      // If data is string (potentially malformed), parse it
      if (typeof data === "string") {
        data = this.parseJsonSafe(data);
      }

      return this.processResponse(data);
    } catch (error) {
      if (error.code === "ECONNREFUSED") {
        logger.error("JHora API is unreachable");
        throw new Error("JHora calculation service is unavailable");
      }
      logger.error(`JHora API Error: ${error.message}`);
      throw error;
    }
  }

  processResponse(rawData) {
    // Basic validation
    if (!rawData) {
      throw new Error("Empty response from JHora API");
    }

    // We expect the structure to match what we need or be adjustable
    return rawData;
  }

  // Helper to parse potentially malformed JSON (from Vipin's legacy code)
  parseJsonSafe(jsonString) {
    try {
      return JSON.parse(jsonString);
    } catch (error) {
      logger.warn("JSON parsing failed, attempting repair...");

      const trimmed = jsonString.trim();
      const startIdx = trimmed.indexOf("{");

      if (startIdx === -1) throw new Error("No JSON object found in response");

      // Use the raw string from startIdx
      const jsonStr = trimmed.substring(startIdx);

      // Intelligent brace matching for malformed JSON
      let openBraces = 0;
      for (let i = 0; i < jsonStr.length; i++) {
        if (jsonStr[i] === "{") openBraces++;
        if (jsonStr[i] === "}") openBraces--;

        if (openBraces === 0) {
          try {
            return JSON.parse(jsonStr.substring(0, i + 1));
          } catch (e) {
            continue;
          }
        }
      }

      throw new Error("Could not repair malformed JSON response");
    }
  }
}

module.exports = new JHoraProcessorService();
