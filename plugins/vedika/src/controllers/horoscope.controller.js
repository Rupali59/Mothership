const Horoscope = require("../models/horoscope.model");
const vedikaProcessor = require("../services/vedika-processor.service");
const cacheService = require("../services/cache.service");
const chartService = require("../services/chart.service");
const dashaService = require("../services/dasha.service");
const logger = require("../utils/logger");

// Generate or Retrieve Horoscope
exports.generateHoroscope = async (req, res) => {
  try {
    const { birthDetails, sections } = req.body;

    // Basic validation
    if (
      !birthDetails ||
      !birthDetails.date ||
      !birthDetails.time ||
      !birthDetails.latitude ||
      !birthDetails.longitude
    ) {
      return res
        .status(400)
        .json({ success: false, error: "Invalid birth details" });
    }

    const birthHash = cacheService.generateBirthHash(birthDetails);

    // Check Cache
    const cachedId = await cacheService.get(`vedika:birth:${birthHash}`);
    if (cachedId) {
      const horoscope = await Horoscope.findById(cachedId);
      if (horoscope) {
        logger.info(`Cache hit for ${birthHash}`);
        return res.json({
          success: true,
          data: filterSections(horoscope, sections),
          cached: true,
        });
      }
    }

    // Process New Horoscope
    logger.info(`Cache miss for ${birthHash}, fetching from Vedika...`);
    const processedData = await vedikaProcessor.fetchHoroscope(birthDetails);

    // Save to DB
    const newHoroscope = await Horoscope.create({
      birthHash,
      birthDetails,
      horoscopeData: processedData,
    });

    // Update Cache
    await cacheService.set(`vedika:birth:${birthHash}`, newHoroscope._id);

    res.json({
      success: true,
      data: filterSections(newHoroscope, sections),
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

    const horoscope = await Horoscope.findOne({ birthHash });
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

// Get Specific Chart
exports.getChart = async (req, res) => {
  try {
    const { birthHash, division } = req.params;
    const horoscope = await Horoscope.findOne({ birthHash });

    if (!horoscope)
      return res
        .status(404)
        .json({ success: false, error: "Horoscope not found" });

    const chartData = chartService.processChart(
      horoscope.horoscopeData,
      division,
    );

    if (!chartData)
      return res
        .status(404)
        .json({ success: false, error: "Chart division not found" });

    res.json({ success: true, data: chartData });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get Current Dasha
exports.getCurrentDasha = async (req, res) => {
  try {
    const { birthHash } = req.params;
    const date = req.query.date ? new Date(req.query.date) : new Date();
    const system = req.query.system || "vimsottari";

    const horoscope = await Horoscope.findOne({ birthHash });
    if (!horoscope)
      return res
        .status(404)
        .json({ success: false, error: "Horoscope not found" });

    const dashaInfo = dashaService.getCurrentDasha(
      horoscope.horoscopeData,
      date,
      system,
    );

    if (!dashaInfo)
      return res.status(404).json({
        success: false,
        error: "Dasha info not found or invalid dates",
      });

    res.json({ success: true, data: dashaInfo });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Helper to filter response sections (Same logic as JHora)
function filterSections(horoscope, sections) {
  if (!sections || sections.length === 0 || sections.includes("full")) {
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
    };
  }

  if (sections.includes("charts")) {
    result.sections.charts = data.divisional_charts;
  }

  if (sections.includes("dashas")) {
    result.sections.dashas = data.graha_dashas;
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
      vimsopaka_bala: data.vimsopaka_bala,
      ashtakavarga: data.ashtakavarga,
    };
  }

  return result;
}
