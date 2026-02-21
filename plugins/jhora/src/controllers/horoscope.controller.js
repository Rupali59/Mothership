const jhoraProcessor = require("../services/jhora-processor.service");
const cacheService = require("../services/cache.service");
const chartService = require("../services/chart.service");
const dashaService = require("../services/dasha.service");
const logger = require("../utils/logger");

// New Normalized Services & Models
const ingestionService = require("../services/ingestion.service");
const aggregationService = require("../services/aggregation.service");
const DivisionalChart = require("../models/normalized/divisional-chart.model");
const DashaSystem = require("../models/normalized/dasha-system.model");
const Horoscope = require("../models/horoscope.model");

// Generate or Retrieve Horoscope
exports.generateHoroscope = async (req, res) => {
  try {
    const { birthDetails, sections } = req.body;
    const workspaceId = req.workspaceId;

    if (!workspaceId) {
      return res
        .status(403)
        .json({ success: false, error: "Workspace ID required" });
    }

    // birthDetails validated by astrologyValidationMiddleware
    const birthHash = cacheService.generateBirthHash(birthDetails);

    // Check Cache (L1: Redis) - Scoped by workspace
    let cachedId = await cacheService.get(
      `jhora:ws:${workspaceId}:birth:${birthHash}`,
    );

    // If Redis miss, Check Database (L2: MongoDB) - Scoped by workspace
    if (!cachedId) {
      const existingHoroscope = await Horoscope.findOne({
        workspaceId,
        birthHash,
      }).select("_id");
      if (existingHoroscope) {
        cachedId = existingHoroscope._id.toString();
        // Populate L1 Cache
        await cacheService.set(
          `jhora:ws:${workspaceId}:birth:${birthHash}`,
          cachedId,
        );
        logger.info(
          `L2 Cache (MongoDB) hit for ${birthHash} in workspace ${workspaceId}`,
        );
      }
    }

    if (cachedId) {
      // Fetch using AggregationService which reconstructs from normalized tables
      const horoscope = await aggregationService.getHoroscopeById(
        workspaceId,
        cachedId,
      );
      if (horoscope) {
        logger.info(
          `Cache hit for ${birthHash} in workspace ${workspaceId} (ID: ${cachedId})`,
        );
        return res.json({
          success: true,
          data: filterSections(horoscope, sections),
          cached: true,
        });
      }
    }

    // Process New Horoscope (credentials validated by middleware)
    const { apiUrl } = req.astrologyContext;
    logger.info(
      `Cache miss for ${birthHash} in workspace ${workspaceId}, fetching from JHora...`,
    );
    const rawData = await jhoraProcessor.fetchHoroscope(birthDetails, { apiUrl });

    // Ingest into Normalized Schema
    // This uses transactions to save to Planets, Charts, etc. atomicallly
    const normalizedHoroscope = await ingestionService.ingestHoroscope(
      workspaceId,
      birthHash,
      birthDetails,
      rawData,
    );

    // Verify it saved effectively by re-fetching full object
    const fullHoroscope = await aggregationService.getHoroscopeById(
      workspaceId,
      normalizedHoroscope._id,
    );

    // Update Cache
    await cacheService.set(
      `jhora:ws:${workspaceId}:birth:${birthHash}`,
      normalizedHoroscope._id.toString(),
    );

    res.json({
      success: true,
      data: filterSections(fullHoroscope, sections),
      cached: false,
    });
  } catch (error) {
    logger.error(`Generate Horoscope Error: ${error.message}`);
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get Full Horoscope by Hash
exports.getHoroscope = async (req, res) => {
  try {
    const { birthHash } = req.params;
    const { sections } = req.query;
    const workspaceId = req.workspaceId;

    if (!workspaceId) {
      return res
        .status(403)
        .json({ success: false, error: "Workspace ID required" });
    }

    const horoscope = await aggregationService.getFullHoroscope(
      workspaceId,
      birthHash,
    );
    if (!horoscope) {
      return res
        .status(404)
        .json({ success: false, error: "Horoscope not found" });
    }

    res.json({
      success: true,
      data: filterSections(horoscope, sections ? sections.split(",") : null),
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get Specific Chart - Optimized for Normalized Schema
exports.getChart = async (req, res) => {
  try {
    const { birthHash, division } = req.params;
    const workspaceId = req.workspaceId;

    if (!workspaceId) {
      return res
        .status(403)
        .json({ success: false, error: "Workspace ID required" });
    }

    // 1. Resolve birthHash to Horoscope ID
    const root = await Horoscope.findOne({ workspaceId, birthHash }).select(
      "_id",
    );
    if (!root)
      return res
        .status(404)
        .json({ success: false, error: "Horoscope not found" });

    // 2. Query DivisionalChart collection directly
    const chart = await DivisionalChart.findOne({
      workspaceId,
      horoscopeId: root._id,
      division: division,
    });

    if (!chart)
      return res
        .status(404)
        .json({ success: false, error: "Chart division not found" });

    // Format to match old chartService output if needed
    // chartService.processChart output: { division, planets: [...] }
    // Our DB model: { division, ascendant, planets: [...] }
    // It's close enough, but let's conform.
    const formatted = {
      division: chart.division,
      planets: chart.planets.map((p) => ({
        planet: p.name,
        sign: p.sign,
        longitude: p.longitude,
        degree: `${Math.floor(p.longitude)}°`, // Simple formatter
        house: p.house || 0, // If we store house properly
      })),
    };

    // TODO: Use chartService if complex formatting needed
    // const formatted = chartService.formatFromNormalized(chart);

    res.json({ success: true, data: formatted });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get Current Dasha
exports.getCurrentDasha = async (req, res) => {
  try {
    const { birthHash } = req.params;
    const workspaceId = req.workspaceId;
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const system = req.query.system || "vimsottari";

    if (!workspaceId) {
      return res
        .status(403)
        .json({ success: false, error: "Workspace ID required" });
    }

    const root = await Horoscope.findOne({ workspaceId, birthHash }).select(
      "_id",
    );
    if (!root)
      return res
        .status(404)
        .json({ success: false, error: "Horoscope not found" });

    // Query DashaSystem collection directly
    const dashaSystem = await DashaSystem.findOne({
      workspaceId,
      horoscopeId: root._id,
      system: system,
    });

    if (!dashaSystem)
      return res
        .status(404)
        .json({ success: false, error: "Dasha system not found" });

    // Use dashaService to find logic because logic is complex (date ranges)
    // We might need to refactor dashaService to accept the normalized structure
    // which is { periods: [{ planet, subPlanet, startDate, level }] }
    // versus old { system: [ ["Mercury-Mercury", "1977..."] ] }

    // For now, let's just return the raw find result or a simple finder
    // Real implementation would adapt dashaService
    const currentPeriod = dashaSystem.periods.find((p, i, arr) => {
      const next = arr[i + 1];
      return date >= p.startDate && (!next || date < next.startDate);
    });

    if (!currentPeriod)
      return res
        .status(404)
        .json({ success: false, error: "Current dasha not found" });

    res.json({ success: true, data: currentPeriod });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Helper to filter response sections
function filterSections(horoscope, sections) {
  if (
    !sections ||
    sections.length === 0 ||
    sections.includes("full") ||
    sections.includes("all")
  ) {
    return horoscope;
  }

  const result = {
    birthDetails: horoscope.birthDetails,
    birthHash: horoscope.birthHash,
    sections: {},
  };

  const data = horoscope.horoscopeData;

  if (sections.includes("basic")) {
    result.sections.basic = {
      calendar_info: data.calendar_info,
      bhava_chart: data.bhava_chart,
      planetary_states: data.planetary_states,
      nakshatra_pada: data.nakshatra_pada,
      ayanamsa_value: data.ayanamsa_value,
      julian_day: data.julian_day,
    };
  }

  if (sections.includes("charts")) {
    result.sections.charts = {
      divisional_charts: data.divisional_charts,
    };
  }

  if (sections.includes("dashas")) {
    result.sections.dashas = {
      graha_dashas: data.graha_dashas,
      asciendantTransits: data.asciendantTransits,
    };
  }

  if (sections.includes("yogas")) {
    result.sections.yogas = data.yogas;
  }

  if (sections.includes("doshas")) {
    result.sections.doshas = data.doshas;
  }

  if (sections.includes("strengths")) {
    result.sections.strengths = {
      shad_bala: data.shad_bala,
      bhava_bala: data.bhava_bala,
      other_bala: data.other_bala,
      vimsopaka_bala: data.vimsopaka_bala,
      vaiseshikamsa_bala: data.vaiseshikamsa_bala,
      ashtakavarga: data.ashtakavarga,
    };
  }

  if (sections.includes("special")) {
    result.sections.special = {
      chara_karakas: data.chara_karakas,
      sahams: data.sahams,
      upagrahas: data.upagrahas,
      special_lagnas: data.special_lagnas,
      house_varnadas: data.house_varnadas,
      graha_arudhas: data.graha_arudhas,
      surya_arudhas: data.surya_arudhas,
      chandra_arudhas: data.chandra_arudhas,
      house_relationships: data.house_relationships,
      arudha_padhas: data.arudha_padhas,
      sphuta: data.sphuta,
      amsa_rulers: data.amsa_rulers,
    };
  }

  return result;
}
