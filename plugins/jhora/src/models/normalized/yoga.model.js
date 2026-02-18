const mongoose = require("mongoose");

const YogaSchema = new mongoose.Schema(
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
    name: { type: String, required: true, index: true },
    description: { type: String },
    // Could add category if available (Raja Yoga, Dhana Yoga, etc.)
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("Yoga", YogaSchema);
