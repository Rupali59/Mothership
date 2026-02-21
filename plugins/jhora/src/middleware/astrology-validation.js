const {
  validateBirthDetails,
  validateJhoraReady,
} = require("@motherboard/astrology-validation");

/**
 * Middleware that validates birth details and Jhora credentials.
 * Only call Jhora external API when both are valid.
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

  const jhoraResult = validateJhoraReady(req);
  if (!jhoraResult.ready) {
    return res
      .status(503)
      .json({
        success: false,
        error: jhoraResult.error,
        code: "CREDENTIALS_NOT_CONFIGURED",
      });
  }

  req.astrologyContext = jhoraResult.credentials;
  next();
}

module.exports = { astrologyValidationMiddleware };
