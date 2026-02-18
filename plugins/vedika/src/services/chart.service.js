const { PLANETS, getHouse, formatDegree } = require("../utils/astrology");

class ChartService {
  processChart(horoscopeData, chartKey) {
    const charts = horoscopeData.divisional_charts || {};
    const realKey =
      Object.keys(charts).find((k) =>
        k.toLowerCase().startsWith(chartKey.toLowerCase()),
      ) || chartKey;

    const chartData = charts[realKey];
    if (!chartData) return null;

    const lagnaSign =
      (chartData["Ascendant"] && chartData["Ascendant"].sign) || "";

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

      const house = planet === "Ascendant" ? "1st" : getHouse(sign, lagnaSign);
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
