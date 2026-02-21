const express = require("express");
const router = express.Router();
const horoscopeController = require("../controllers/horoscope.controller");
const { pluginConfigMiddleware } = require("../middleware/plugin-config");
const { astrologyValidationMiddleware } = require("../middleware/astrology-validation");

router.post(
  "/generate",
  pluginConfigMiddleware,
  astrologyValidationMiddleware,
  horoscopeController.generateHoroscope
);
router.get("/:birthHash", horoscopeController.getHoroscope);
router.get("/:birthHash/charts/:division", horoscopeController.getChart);
router.get("/:birthHash/dashas/current", horoscopeController.getCurrentDasha);

module.exports = router;
