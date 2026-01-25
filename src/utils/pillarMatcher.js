// utils/pillarMatcher.js
const pillars = require("../constants/pillars.json");


function detectPillarAndKeywords(text) {
  let detectedPillar = null;
  let detectedKeywords = [];

  // Lowercase for easier matching
  const content = text.toLowerCase();

  for (const [pillar, keywords] of Object.entries(pillars)) {
    for (const kw of keywords) {
      if (content.includes(kw.toLowerCase())) {
        detectedPillar = pillar;
        detectedKeywords = keywords; // ✅ auto-fill ALL keywords for this pillar
        break;
      }
    }
    if (detectedPillar) break;
  }

  return { pillar: detectedPillar, keywords: detectedKeywords };
}

module.exports = { detectPillarAndKeywords };
