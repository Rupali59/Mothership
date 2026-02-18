const mongoose = require("mongoose");

const DivisionalChartSchema = new mongoose.Schema(
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
    division: {
      type: String, // D-1, D-9, D-60, etc.
      required: true,
      index: true,
    },
    ascendant: {
      sign: String,
      longitude: Number,
    },
    // We store planets in an array here because typically we fetch the entire chart
    // If we need to query "Sun in Leo in D-9", we can use the planets array
    planets: [
      {
        name: { type: String, required: true },
        sign: { type: String, required: true },
        longitude: { type: Number, required: true },
        house: { type: Number }, // Calculated house in this division
      },
    ],
  },
  {
    timestamps: true,
  },
);

// Unique constraint: One chart type per horoscope per workspace
DivisionalChartSchema.index(
  { workspaceId: 1, horoscopeId: 1, division: 1 },
  { unique: true },
);

module.exports = mongoose.model("DivisionalChart", DivisionalChartSchema);
