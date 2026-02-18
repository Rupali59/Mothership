const mongoose = require("mongoose");

const DashaSystemSchema = new mongoose.Schema(
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
    system: {
      type: String, // Vimsottari, Yogini, etc.
      required: true,
      index: true,
    },
    // Dasha periods can be nested or flat. A flat structure with level indicator is often easier to query.
    // For Vimsottari, we typically have Mahadasha-Antardasha pairs with start dates.
    periods: [
      {
        planet: { type: String, required: true }, // Main period lord
        subPlanet: { type: String }, // Sub period lord (if applicable)
        startDate: { type: Date, required: true },
        endDate: { type: Date }, // Optional, can be inferred from next start
        level: { type: Number, default: 1 }, // 1=Mahadasha, 2=Antardasha
      },
    ],
  },
  {
    timestamps: true,
  },
);

DashaSystemSchema.index(
  { workspaceId: 1, horoscopeId: 1, system: 1 },
  { unique: true },
);

module.exports = mongoose.model("DashaSystem", DashaSystemSchema);
