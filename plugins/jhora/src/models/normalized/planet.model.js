const mongoose = require("mongoose");

const PlanetSchema = new mongoose.Schema(
  {
    workspaceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Workspace", // Assuming a Workspace model exists in context, or just ObjectId
      required: true,
      index: true,
    },
    horoscopeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Horoscope",
      required: true,
      index: true,
    },
    name: {
      type: String, // Sun, Moon, Mars, etc.
      required: true,
      index: true,
    },
    longitude: { type: Number, required: true },
    sign: { type: String, required: true, index: true },
    house: { type: Number, required: true },
    nakshatra: { type: String },
    pada: { type: Number },
    // Planetary states often queried
    isRetrograde: { type: Boolean, default: false, index: true },
    isCombust: { type: Boolean, default: false, index: true },
    speed: { type: Number },
    // Relationships
    isExalted: { type: Boolean, default: false },
    isDebilitated: { type: Boolean, default: false },
    isInOwnSign: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  },
);

// Compound index for efficient querying like "Mars in Leo for a specific chart"
// Scoped by workspaceId for tenancy isolation
PlanetSchema.index(
  { workspaceId: 1, horoscopeId: 1, name: 1 },
  { unique: true },
);

module.exports = mongoose.model("Planet", PlanetSchema);
