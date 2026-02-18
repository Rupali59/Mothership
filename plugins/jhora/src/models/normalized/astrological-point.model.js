const mongoose = require("mongoose");

// Polymorphic collection for Sahams, Upagrahas, Special Lagnas, Arudhas
const AstrologicalPointSchema = new mongoose.Schema(
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
      type: String, // 'Saham', 'Upagraha', 'SpecialLagna', 'Arudha', 'CharaKaraka'
      required: true,
      index: true,
    },
    name: {
      type: String, // 'Punya Saham', 'Gulika', 'Indu Lagna', 'Atma Karaka'
      required: true,
      index: true,
    },
    longitude: { type: Number, required: true },
    sign: { type: String, required: true },
    house: { type: Number },
    // For things like Chara Karakas which are planets
    planetName: { type: String },
  },
  {
    timestamps: true,
  },
);

AstrologicalPointSchema.index({
  workspaceId: 1,
  horoscopeId: 1,
  type: 1,
  name: 1,
});

module.exports = mongoose.model("AstrologicalPoint", AstrologicalPointSchema);
