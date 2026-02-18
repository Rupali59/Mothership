// Astrology Helper Utilities

const PLANETS = [
  "Ascendant",
  "Sun",
  "Moon",
  "Mars",
  "Mercury",
  "Jupiter",
  "Venus",
  "Saturn",
  "Rahu",
  "Ketu",
];

const ZODIAC_SIGNS = [
  "Aries",
  "Taurus",
  "Gemini",
  "Cancer",
  "Leo",
  "Virgo",
  "Libra",
  "Scorpio",
  "Sagittarius",
  "Capricorn",
  "Aquarius",
  "Pisces",
];

function getHouse(planetSign, lagnaSign) {
  if (!planetSign || !lagnaSign) return "";
  const planetIndex = ZODIAC_SIGNS.indexOf(planetSign);
  const lagnaIndex = ZODIAC_SIGNS.indexOf(lagnaSign);

  if (planetIndex === -1 || lagnaIndex === -1) return "";

  let houseDiff = planetIndex - lagnaIndex + 1;
  if (houseDiff <= 0) houseDiff += 12;

  const ordinals = ["st", "nd", "rd", "th"];
  const suffix = ordinals[(houseDiff - 1) % 10] || ordinals[3];

  // Special cases for 11th, 12th, 13th
  if (houseDiff >= 11 && houseDiff <= 13) return `${houseDiff}th`;

  // Special case for 1st, 2nd, 3rd
  if (houseDiff === 1) return "1st";
  if (houseDiff === 2) return "2nd";
  if (houseDiff === 3) return "3rd";

  return `${houseDiff}th`;
}

function formatDegree(deg) {
  if (deg === undefined || deg === null) return "0° 0' 0\"";
  const d = Math.floor(deg);
  const m = Math.floor((deg - d) * 60);
  const s = Math.floor(((deg - d) * 60 - m) * 60);
  return `${d}° ${m}' ${s}"`;
}

module.exports = {
  PLANETS,
  ZODIAC_SIGNS,
  getHouse,
  formatDegree,
};
