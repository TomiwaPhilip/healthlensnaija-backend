const trustedCatalog = require("../constants/validWebsites.json");

function normalizeUrl(url) {
  if (!url) {
    return null;
  }
  try {
    const parsed = new URL(url);
    return parsed.href;
  } catch (error) {
    return null;
  }
}

function stripWww(hostname = "") {
  return hostname.replace(/^www\./i, "");
}

function getTrustedWebsites() {
  if (!Array.isArray(trustedCatalog)) {
    return [];
  }

  return trustedCatalog
    .map((entry) => {
      const name = (entry?.name || "").trim();
      const urls = Array.isArray(entry?.urls)
        ? entry.urls.map((url) => normalizeUrl(url)).filter(Boolean)
        : [];

      if (!name || !urls.length) {
        return null;
      }

      return { name, urls };
    })
    .filter(Boolean);
}

function getTrustedDomains() {
  const seen = new Set();
  const domains = [];

  for (const website of getTrustedWebsites()) {
    for (const url of website.urls) {
      try {
        const { hostname } = new URL(url);
        const clean = stripWww(hostname.toLowerCase());
        if (clean && !seen.has(clean)) {
          seen.add(clean);
          domains.push(clean);
        }
      } catch (error) {
        // Ignore malformed URLs
      }
    }
  }

  return domains;
}

module.exports = {
  getTrustedWebsites,
  getTrustedDomains,
};
