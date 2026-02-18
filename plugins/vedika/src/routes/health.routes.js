const express = require("express");
const router = express.Router();

router.get("/", (req, res) => {
  res.json({
    success: true,
    status: "UP",
    plugin: "vedika",
    timestamp: new Date().toISOString(),
  });
});

module.exports = router;
