const {
  validateBirthDetails,
  validateVedikaReady,
} = require("@motherboard/astrology-validation");

/**
 * Middleware that validates birth details and Vedika credentials.
 * Only call Vedika external API when both are valid.
 * Attaches validated context to req.astrologyContext.
 */
function astrologyValidationMiddleware(req, res, next) {
  const { birthDetails } = req.body;

  const birthResult = validateBirthDetails(birthDetails);
  if (!birthResult.valid) {
    return res
      .status(400)
      .json({ success: false, error: birthResult.error });
  }

  const vedikaResult = validateVedikaReady(req);
  if (!vedikaResult.ready) {
    return res
      .status(503)
      .json({
        success: false,
        error: vedikaResult.error,
        code: "CREDENTIALS_NOT_CONFIGURED",
      });
  }

  req.astrologyContext = vedikaResult.credentials;
  next();
}

module.exports = { astrologyValidationMiddleware };
