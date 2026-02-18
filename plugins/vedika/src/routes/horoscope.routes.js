const express = require("express");
const router = express.Router();
const horoscopeController = require("../controllers/horoscope.controller");

router.post("/generate", horoscopeController.generateHoroscope);
router.get("/:birthHash", horoscopeController.getHoroscope);
router.get("/:birthHash/charts/:division", horoscopeController.getChart);
router.get("/:birthHash/dashas/current", horoscopeController.getCurrentDasha);

module.exports = router;
