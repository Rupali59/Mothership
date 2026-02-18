const express = require("express");
const router = express.Router();
const horoscopeController = require("../controllers/horoscope.controller");
// const { validateBirthDetails } = require('../utils/validators'); // TODO: Implement validator

const { validateMotherboardToken } = require("../middleware/auth");

router.post(
  "/generate",
  validateMotherboardToken,
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
