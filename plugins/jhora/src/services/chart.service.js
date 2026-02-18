const { PLANETS, getHouse, formatDegree } = require("../utils/astrology");

class ChartService {
  // Process a specific chart
  processChart(horoscopeData, chartKey) {
    const charts = horoscopeData.divisional_charts || {};
    // Find key case-insensitive if needed
    const realKey =
      Object.keys(charts).find((k) =>
        k.toLowerCase().startsWith(chartKey.toLowerCase()),
      ) || chartKey;

    const chartData = charts[realKey];
    if (!chartData) return null;

    // We use D-1 Ascendant for house calculation if D-1 is requested,
    // otherwise we might need that division's Lagna.
    // JHora JSON structure usually includes 'Ascendant' in every divisional chart.
    const lagnaSign =
      (chartData["Ascendant"] && chartData["Ascendant"].sign) || "";

    // Get extra info
    const nakshatraMap = horoscopeData.nakshatra_pada || {};
    const retrogrades = this.getRetrogradeList(horoscopeData);
    const combusts = this.getCombustList(horoscopeData);

    const planets = [];

    for (const planet of PLANETS) {
      const data = chartData[planet];
      if (!data) continue;

      const planetKey = planet === "Ascendant" ? "Lagna" : planet;
      const sign = data.sign || "";
      const longitude = data.longitude || 0;

      // Calculate house based on Lagna of THIS chart
      const house = planet === "Ascendant" ? "1st" : getHouse(sign, lagnaSign);

      // Nakshatra info is usually mainly for D-1 but key exists for planets
      const naks = nakshatraMap[planet] || {};

      planets.push({
        planet: planetKey,
        sign: sign,
        degree: formatDegree(longitude),
        longitude: longitude,
        house: house,
        nakshatra: naks.nakshatra,
        pada: naks.pada,
        retrograde: retrogrades.includes(planet),
        combust: combusts.includes(planet),
      });
    }

    return {
      division: realKey,
      planets,
    };
  }

  getRetrogradeList(horoscopeData) {
    const states = horoscopeData.planetary_states || {};
    let planetList = states.retrograde_planets || [];

    // Fallback to visual check in Bhava chart if array not present
    if (planetList.length === 0 && horoscopeData.bhava_chart) {
      // Very basic check, might look for '℞' symbol
      // But usually planetary_states works
    }

    // Normalize names
    return planetList.map((p) => this.normalizePlanetName(p));
  }

  getCombustList(horoscopeData) {
    const states = horoscopeData.planetary_states || {};
    const planetList = states.combusted_planets || [];
    return planetList.map((p) => this.normalizePlanetName(p));
  }

  normalizePlanetName(name) {
    if (name === "Raagu") return "Rahu";
    if (name === "Kethu") return "Ketu";
    return name;
  }
}

module.exports = new ChartService();
