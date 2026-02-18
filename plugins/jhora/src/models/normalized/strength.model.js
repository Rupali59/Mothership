const mongoose = require("mongoose");

const StrengthSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    horoscopeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Horoscope",
      required: true,
      index: true,
    },
    type: {
      type: String, // 'ShadBala', 'BhavaBala', 'Ashtakavarga'
      required: true,
      index: true,
    },
    // Flexible structure depending on the strength type
    // Usage:
    // ShadBala: { Sun: 450, Moon: 380... }
    // BhavaBala: { House1: 400, House2: 350... }
    data: { type: mongoose.Schema.Types.Mixed },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Strength", StrengthSchema);
