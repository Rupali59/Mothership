const mongoose = require("mongoose");

/**
 * Root Horoscope Model
 * Acts as the entry point for metadata and birth identity.
 * Related data is stored in normalized collections (Planets, Charts, etc.)
 */
const HoroscopeSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      index: true,
    },
    birthHash: {
      type: String,
      required: true,
      index: true,
    },
    birthDetails: {
      date: { type: String, required: true },
      time: { type: String, required: true },
      latitude: { type: Number, required: true },
      longitude: { type: Number, required: true },
      timezone: { type: String, required: true },
      location: { type: String },
    },
    metadata: {
      sourceApi: { type: String, default: "jhora" },
      apiVersion: { type: String },
      ayanamsa_value: { type: Number },
      julian_day: { type: Number },
    },
  },
  {
    timestamps: true,
  },
);

// Compound unique index for workspace isolation + birthHash uniqueness
HoroscopeSchema.index({ workspaceId: 1, birthHash: 1 }, { unique: true });

module.exports = mongoose.model("Horoscope", HoroscopeSchema);
