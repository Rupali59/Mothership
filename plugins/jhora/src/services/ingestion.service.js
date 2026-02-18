const mongoose = require("mongoose");
const Horoscope = require("../models/horoscope.model");
const Planet = require("../models/normalized/planet.model");
const DivisionalChart = require("../models/normalized/divisional-chart.model");
const DashaSystem = require("../models/normalized/dasha-system.model");
const Yoga = require("../models/normalized/yoga.model");
const Dosha = require("../models/normalized/dosha.model");
const Strength = require("../models/normalized/strength.model");
const AstrologicalPoint = require("../models/normalized/astrological-point.model");
const logger = require("../utils/logger");

class IngestionService {
  /**
   * Transacts the entire horoscope ingestion process.
   * Ensures atomicity across all collections.
   */
  async ingestHoroscope(workspaceId, birthHash, birthDetails, rawData) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // 1. Create Root Horoscope
      const horoscope = await Horoscope.create(
        [
          {
            workspaceId,
            birthHash,
            birthDetails,
            metadata: {
              sourceApi: "jhora",
              apiVersion: rawData.apiVersion || "1.0",
              ayanamsa_value: rawData.ayanamsa_value,
              julian_day: rawData.julian_day,
            },
          },
        ],
        { session },
      );
      const horoscopeId = horoscope[0]._id;

      // 2. Process & Insert Planets
      await this.ingestPlanets(workspaceId, horoscopeId, rawData, session);

      // 3. Process & Insert Charts
      await this.ingestCharts(workspaceId, horoscopeId, rawData, session);

      // 4. Process & Insert Dashas
      await this.ingestDashas(workspaceId, horoscopeId, rawData, session);

      // 5. Process & Insert Yogas/Doshas
      await this.ingestYogasAndDoshas(
        workspaceId,
        horoscopeId,
        rawData,
        session,
      );

      // 6. Process & Insert Strengths
      await this.ingestStrengths(workspaceId, horoscopeId, rawData, session);

      // 7. Process & Insert Special Points
      await this.ingestSpecialPoints(
        workspaceId,
        horoscopeId,
        rawData,
        session,
      );

      await session.commitTransaction();
      logger.info(
        `Successfully ingested normalized horoscope for ${birthHash} in workspace ${workspaceId}`,
      );
      return horoscope[0];
    } catch (error) {
      await session.abortTransaction();
      logger.error(`Ingestion failed: ${error.message}`);
      throw error;
    } finally {
      session.endSession();
    }
  }

  async ingestPlanets(workspaceId, horoscopeId, data, session) {
    const planets = [];
    const chartData = data.divisional_charts?.["D-1_rasi"] || {};
    const nakshatraData = data.nakshatra_pada || {};
    const states = data.planetary_states || {};

    // Standard 9 planets + Lagna if needed, but usually we store Lagna in Charts
    const planetNames = [
      "Sun",
      "Moon",
      "Mars",
      "Mercury",
      "Jupiter",
      "Venus",
      "Saturn",
      "Rahu",
      "Ketu",
    ];

    for (const name of planetNames) {
      const pData = chartData[name];
      if (!pData) continue;

      const nData = nakshatraData[name] || {};
      const isRetro = (states.retrograde_planets || []).includes(name);
      const isCombust = (states.combusted_planets || []).includes(name);

      planets.push({
        workspaceId,
        horoscopeId,
        name,
        longitude: pData.longitude,
        sign: pData.sign,
        house: 0, // TODO: calculate house based on Ascendant
        nakshatra: nData.nakshatra,
        pada: nData.pada,
        isRetrograde: isRetro,
        isCombust: isCombust,
        speed: pData.speed || 0,
      });
    }

    if (planets.length > 0) {
      await Planet.insertMany(planets, { session });
    }
  }

  async ingestCharts(workspaceId, horoscopeId, data, session) {
    const charts = [];
    const rawCharts = data.divisional_charts || {};

    for (const [key, chartData] of Object.entries(rawCharts)) {
      // key like "D-1_rasi" or "D-9_navamsa"
      const division = key.split("_")[0]; // "D-1"

      const ascendant = chartData["Ascendant"] || {};
      const planetEntries = [];

      for (const [pName, pData] of Object.entries(chartData)) {
        if (pName === "Ascendant") continue;
        planetEntries.push({
          name: pName,
          sign: pData.sign,
          longitude: pData.longitude,
          house: 0, // Placeholder
        });
      }

      charts.push({
        workspaceId,
        horoscopeId,
        division,
        ascendant: {
          sign: ascendant.sign,
          longitude: ascendant.longitude,
        },
        planets: planetEntries,
      });
    }

    if (charts.length > 0) {
      await DivisionalChart.insertMany(charts, { session });
    }
  }

  async ingestDashas(workspaceId, horoscopeId, data, session) {
    const dashaSystems = [];
    const rawDashas = data.graha_dashas || {};

    for (const [system, periods] of Object.entries(rawDashas)) {
      // periods is typically array of [ "Planet-Sub", "Date" ]
      const formattedPeriods = periods.map((p) => {
        const [lords, dateStr] = p;
        const [main, sub] = lords.split("-");
        return {
          planet: main,
          subPlanet: sub || null,
          startDate: new Date(dateStr),
          level: sub ? 2 : 1,
        };
      });

      dashaSystems.push({
        workspaceId,
        horoscopeId,
        system, // e.g., "vimsottari"
        periods: formattedPeriods,
      });
    }

    if (dashaSystems.length > 0) {
      await DashaSystem.insertMany(dashaSystems, { session });
    }
  }

  async ingestYogasAndDoshas(workspaceId, horoscopeId, data, session) {
    // Yogas
    const yogas = [];
    const yogaList = data.yogas?.yoga_list || {};
    for (const [key, details] of Object.entries(yogaList)) {
      // details is [chart, yogaName, condition, description]
      yogas.push({
        workspaceId,
        horoscopeId,
        name: details[1] || key,
        description: details[3] || details[2],
      });
    }
    if (yogas.length > 0) await Yoga.insertMany(yogas, { session });

    // Doshas
    const doshas = [];
    const rawDoshas = data.doshas || {};
    for (const [name, desc] of Object.entries(rawDoshas)) {
      doshas.push({
        workspaceId,
        horoscopeId,
        name,
        description: desc,
        isPresent: !desc.toLowerCase().includes("no"), // Simple heuristic
      });
    }
    if (doshas.length > 0) await Dosha.insertMany(doshas, { session });
  }

  async ingestStrengths(workspaceId, horoscopeId, data, session) {
    const strengths = [];

    if (data.shad_bala) {
      strengths.push({
        workspaceId,
        horoscopeId,
        type: "ShadBala",
        data: data.shad_bala,
      });
    }

    if (data.bhava_bala) {
      strengths.push({
        workspaceId,
        horoscopeId,
        type: "BhavaBala",
        data: data.bhava_bala,
      });
    }

    if (data.ashtakavarga) {
      strengths.push({
        workspaceId,
        horoscopeId,
        type: "Ashtakavarga",
        data: data.ashtakavarga,
      });
    }

    if (strengths.length > 0) {
      await Strength.insertMany(strengths, { session });
    }
  }

  async ingestSpecialPoints(workspaceId, horoscopeId, data, session) {
    const points = [];

    // Sahams
    const sahams = data.sahams || {};
    for (const [name, val] of Object.entries(sahams)) {
      points.push({
        workspaceId,
        horoscopeId,
        type: "Saham",
        name,
        longitude: 0, // Need parser if data is string "Libra 12deg"
        sign: "Unknown", // Placeholder
      });
    }

    // Special Lagnas
    const lagnas = data.special_lagnas || {};
    for (const [name, details] of Object.entries(lagnas)) {
      points.push({
        workspaceId,
        horoscopeId,
        type: "SpecialLagna",
        name,
        longitude: details.longitude,
        sign: details.sign,
      });
    }

    if (points.length > 0) {
      await AstrologicalPoint.insertMany(points, { session });
    }
  }
}

module.exports = new IngestionService();
