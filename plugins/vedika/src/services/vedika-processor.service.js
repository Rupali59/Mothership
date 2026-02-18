const axios = require("axios");
const logger = require("../utils/logger");

class VedikaProcessorService {
  constructor() {
    this.apiUrl =
      process.env.VEDIKA_API_URL || "https://api.vedika.io/v2/astrology";
    this.apiKey = process.env.VEDIKA_API_KEY;
  }

  async fetchHoroscope(birthDetails) {
    try {
      logger.info(
        `Calling Vedika API for ${birthDetails.date} ${birthDetails.time}`,
      );

      const requestBody = {
        datetime: `${birthDetails.date}T${birthDetails.time}`,
        latitude: birthDetails.latitude,
        longitude: birthDetails.longitude,
        timezone: this.formatTimezone(birthDetails.timezone),
      };

      const headers = {
        "Content-Type": "application/json",
        "X-API-Key": this.apiKey,
      };

      // 1. Fetch Kundli (Base data, Yogas, Houses)
      const kundliRes = await axios.post(`${this.apiUrl}/kundli`, requestBody, {
        headers,
      });

      // 2. Fetch Dashas
      const dashaRes = await axios.post(
        `${this.apiUrl}/vimshottari-dasha`,
        requestBody,
        { headers },
      );

      // 3. Fetch Doshas
      const doshaRes = await axios.post(
        `${this.apiUrl}/all-doshas`,
        requestBody,
        { headers },
      );

      return this.transformToUniformModel(
        kundliRes.data,
        dashaRes.data,
        doshaRes.data,
        birthDetails,
      );
    } catch (error) {
      logger.error(`Vedika API Error: ${error.message}`);
      throw error;
    }
  }

  formatTimezone(tz) {
    if (typeof tz !== "number") return tz;
    const sign = tz >= 0 ? "+" : "-";
    const absTz = Math.abs(tz);
    const hours = Math.floor(absTz);
    const minutes = Math.floor((absTz - hours) * 60);
    return `${sign}${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
  }

  transformToUniformModel(kundli, dashas, doshas, birthDetails) {
    // Transform Vedika's response into the uniform Motherboard Astrology Model
    // consistent with what JHora provides.

    const uniformData = {
      calendar_info: kundli.panchang || {},
      bhava_chart: this.mapBhavaChart(kundli.houses),
      divisional_charts: {
        "D-1_rasi": this.mapDivisionalChart(kundli.planets, kundli.houses),
      },
      nakshatra_pada: this.mapNakshatras(kundli.planets),
      yogas: kundli.yogas || [],
      doshas: doshas || {},
      graha_dashas: {
        vimsottari: this.mapDashas(dashas),
      },
      planetary_states: this.mapPlanetaryStates(kundli.planets),
      ayanamsa_value: kundli.ayanamsa,
    };

    return uniformData;
  }

  mapBhavaChart(houses) {
    if (!houses || !Array.isArray(houses)) return [];
    // JHora format is usually array of signs in order for 12 houses
    return houses.map((h) => h.sign);
  }

  mapDivisionalChart(planets, houses) {
    const chart = {};
    if (planets && Array.isArray(planets)) {
      planets.forEach((p) => {
        chart[p.name] = {
          sign: p.sign,
          longitude: p.degree,
        };
      });
    }
    // Add Ascendant (Lagna) from houses
    if (houses && houses.length > 0) {
      chart["Ascendant"] = {
        sign: houses[0].sign,
        longitude: houses[0].degree,
      };
    }
    return chart;
  }

  mapNakshatras(planets) {
    const naks = {};
    if (planets && Array.isArray(planets)) {
      planets.forEach((p) => {
        naks[p.name] = {
          nakshatra: p.nakshatra,
          pada: p.nakshatra_pada,
        };
      });
    }
    return naks;
  }

  mapDashas(dashas) {
    if (!dashas || !dashas.periods) return [];
    // Convert to [name, dateString] format used by DashaService
    return dashas.periods.map((p) => [p.planet, p.start_date]);
  }

  mapPlanetaryStates(planets) {
    const retrograde = planets
      ? planets.filter((p) => p.is_retrograde).map((p) => p.name)
      : [];
    return {
      retrograde_planets: retrograde,
      combusted_planets: [], // Vedika might have this elsewhere
    };
  }
}

module.exports = new VedikaProcessorService();
