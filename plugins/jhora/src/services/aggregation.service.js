const Horoscope = require("../models/horoscope.model");
const Planet = require("../models/normalized/planet.model");
const DivisionalChart = require("../models/normalized/divisional-chart.model");
const DashaSystem = require("../models/normalized/dasha-system.model");
const Yoga = require("../models/normalized/yoga.model");
const Dosha = require("../models/normalized/dosha.model");
const Strength = require("../models/normalized/strength.model");
const AstrologicalPoint = require("../models/normalized/astrological-point.model");

class AggregationService {
  async getFullHoroscope(workspaceId, birthHash) {
    const horoscope = await Horoscope.findOne({
      workspaceId,
      birthHash,
    }).lean();
    if (!horoscope) return null;
    return this._assemble(workspaceId, horoscope);
  }

  async getHoroscopeById(workspaceId, id) {
    const horoscope = await Horoscope.findOne({ _id: id, workspaceId }).lean();
    if (!horoscope) return null;
    return this._assemble(workspaceId, horoscope);
  }

  async _assemble(workspaceId, horoscope) {
    const horoscopeId = horoscope._id;

    // Parallel fetch for valid sections
    const [planets, charts, dashaSystems, yogas, doshas, strengths, points] =
      await Promise.all([
        Planet.find({ workspaceId, horoscopeId }).lean(),
        DivisionalChart.find({ workspaceId, horoscopeId }).lean(),
        DashaSystem.find({ workspaceId, horoscopeId }).lean(),
        Yoga.find({ workspaceId, horoscopeId }).lean(),
        Dosha.find({ workspaceId, horoscopeId }).lean(),
        Strength.find({ workspaceId, horoscopeId }).lean(),
        AstrologicalPoint.find({ workspaceId, horoscopeId }).lean(),
      ]);

    // Reconstruct the monolithic structure expected by the frontend/API
    const reconstructed = {
      birthDetails: horoscope.birthDetails,
      birthHash: horoscope.birthHash,
      metadata: horoscope.metadata,
      horoscopeData: {
        ayanamsa_value: horoscope.metadata?.ayanamsa_value,
        julian_day: horoscope.metadata?.julian_day,

        // Basic / Planets
        planetary_states: this._reconstructPlanetaryStates(planets),
        nakshatra_pada: this._reconstructNakshatras(planets),

        // Charts
        divisional_charts: this._reconstructCharts(charts),

        // Dashas
        graha_dashas: this._reconstructDashas(dashaSystems),

        // Yogas/Doshas
        yogas: { yoga_list: this._reconstructYogas(yogas) },
        doshas: this._reconstructDoshas(doshas),

        // Strengths
        ...this._reconstructStrengths(strengths),

        // Special Points
        ...this._reconstructSpecialPoints(points),
      },
    };

    return reconstructed;
  }

  _reconstructPlanetaryStates(planets) {
    const states = {
      retrograde_planets: [],
      combusted_planets: [],
    };
    planets.forEach((p) => {
      if (p.isRetrograde) states.retrograde_planets.push(p.name);
      if (p.isCombust) states.combusted_planets.push(p.name);
    });
    return states;
  }

  _reconstructNakshatras(planets) {
    const map = {};
    planets.forEach((p) => {
      map[p.name] = { nakshatra: p.nakshatra, pada: p.pada };
    });
    return map;
  }

  _reconstructCharts(charts) {
    const map = {};
    charts.forEach((c) => {
      const key = `${c.division}_chart`; // Approximate key reconstruction
      // But actually JHora sends "D-1_rasi". We stored "D-1".
      // Let's use the stored division as key for now or map it back if we had a mapping.
      // Ideally we should just use the division code.
      map[c.division] = {
        Ascendant: c.ascendant,
        ...c.planets.reduce((acc, p) => ({ ...acc, [p.name]: p }), {}),
      };
    });
    return map;
  }

  _reconstructDashas(systems) {
    const map = {};
    systems.forEach((s) => {
      // Reconstruct array of [ "Planet-Sub", "Date" ]
      map[s.system] = s.periods.map((p) => {
        const name = p.subPlanet ? `${p.planet}-${p.subPlanet}` : p.planet;
        return [name, p.startDate.toISOString()];
      });
    });
    return map;
  }

  _reconstructYogas(yogas) {
    const map = {};
    yogas.forEach((y, i) => {
      map[`Yoga_${i}`] = ["D-1", y.name, "Condition...", y.description];
    });
    return map;
  }

  _reconstructDoshas(doshas) {
    const map = {};
    doshas.forEach((d) => {
      map[d.name] = d.description;
    });
    return map;
  }

  _reconstructStrengths(strengths) {
    const res = {};
    strengths.forEach((s) => {
      if (s.type === "ShadBala") res.shad_bala = s.data;
      if (s.type === "BhavaBala") res.bhava_bala = s.data;
      if (s.type === "Ashtakavarga") res.ashtakavarga = s.data;
    });
    return res;
  }

  _reconstructSpecialPoints(points) {
    const special_lagnas = {};
    const sahams = {};
    // ... others

    points.forEach((p) => {
      if (p.type === "SpecialLagna") {
        special_lagnas[p.name] = { sign: p.sign, longitude: p.longitude };
      }
      if (p.type === "Saham") {
        sahams[p.name] = `${p.sign} ${p.longitude}`; // Approx
      }
    });

    return { special_lagnas, sahams };
  }
}

module.exports = new AggregationService();
