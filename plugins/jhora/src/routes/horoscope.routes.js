const express = require("express");
const router = express.Router();
const horoscopeController = require("../controllers/horoscope.controller");
const { validateMotherboardToken } = require("../middleware/auth");
const { pluginConfigMiddleware } = require("../middleware/plugin-config");
const { astrologyValidationMiddleware } = require("../middleware/astrology-validation");

router.post(
  "/generate",
  validateMotherboardToken,
  pluginConfigMiddleware,
  astrologyValidationMiddleware,
  horoscopeController.generateHoroscope,
);
router.get(
  "/:birthHash",
  validateMotherboardToken,
  horoscopeController.getHoroscope,
);
router.get(
  "/:birthHash/charts/:division",
  validateMotherboardToken,
  horoscopeController.getChart,
);
router.get(
  "/:birthHash/dashas/current",
  validateMotherboardToken,
  horoscopeController.getCurrentDasha,
);

module.exports = router;
