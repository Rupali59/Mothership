const mongoose = require("mongoose");

const HoroscopeSchema = new mongoose.Schema(
  {
    birthHash: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },
    birthDetails: {
      date: { type: String, required: true },
      time: { type: String, required: true },
      place: { type: String, required: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      timezone: { type: Number, required: true },
    },
    horoscopeData: {
      calendar_info: mongoose.Schema.Types.Mixed,
      bhava_chart: [String],
      divisional_charts: mongoose.Schema.Types.Mixed,
      nakshatra_pada: mongoose.Schema.Types.Mixed,
      amsa_rulers: mongoose.Schema.Types.Mixed,
      yogas: mongoose.Schema.Types.Mixed,
      doshas: mongoose.Schema.Types.Mixed,
      chara_karakas: mongoose.Schema.Types.Mixed,
      sahams: mongoose.Schema.Types.Mixed,
      upagrahas: mongoose.Schema.Types.Mixed,
      special_lagnas: mongoose.Schema.Types.Mixed,
      house_varnadas: mongoose.Schema.Types.Mixed,
      graha_arudhas: mongoose.Schema.Types.Mixed,
      surya_arudhas: mongoose.Schema.Types.Mixed,
      chandra_arudhas: mongoose.Schema.Types.Mixed,
      house_relationships: mongoose.Schema.Types.Mixed,
      planetary_states: mongoose.Schema.Types.Mixed,
      shad_bala: [[Number]],
      bhava_bala: [String],
      other_bala: mongoose.Schema.Types.Mixed,
      vimsopaka_bala: [mongoose.Schema.Types.Mixed],
      vaiseshikamsa_bala: [mongoose.Schema.Types.Mixed],
      ashtakavarga: mongoose.Schema.Types.Mixed,
      arudha_padhas: mongoose.Schema.Types.Mixed,
      sphuta: mongoose.Schema.Types.Mixed,
      graha_dashas: mongoose.Schema.Types.Mixed,
      asciendantTransits: mongoose.Schema.Types.Mixed,
      ayanamsa_value: Number,
      julian_day: Number,
    },
    metadata: {
      sourceApi: { type: String, default: "vedika" },
      apiVersion: String,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Horoscope", HoroscopeSchema);
