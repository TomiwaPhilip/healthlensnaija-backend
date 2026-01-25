// backend/src/utils/scrapeNigeriaHealthWatch.js
const axios = require("axios");
const cheerio = require("cheerio");
const extractPdfText = require("./extractPdfText");
const BaseScrapeUrl = require("../models/BaseScrapeUrl"); // new model

async function scrapeNigeriaHealthWatch() {
  let combinedText = "";

  // 🔹 Fetch base URLs from DB instead of static list
  const baseUrls = await BaseScrapeUrl.find();
  const urls = baseUrls.map((u) => u.url);

  for (let url of urls) {
    try {
      const response = await axios.get(url, { timeout: 15000 });
      const $ = cheerio.load(response.data);

      // Extract visible text
      $("p, h1, h2, h3, li").each((_, el) => {
        combinedText += $(el).text().trim() + "\n";
      });

      // Extract PDFs on page
      const pdfLinks = [];
      $("a").each((_, el) => {
        const href = $(el).attr("href");
        if (href && href.toLowerCase().endsWith(".pdf")) {
          if (href.startsWith("http")) {
            pdfLinks.push(href);
          } else {
            pdfLinks.push(new URL(href, url).href);
          }
        }
      });

      // Parse PDFs content
      for (let pdfUrl of pdfLinks) {
        try {
          const pdfText = await extractPdfText(pdfUrl);
          combinedText += "\n" + pdfText;
        } catch (pdfErr) {
          console.error(`❌ Failed extracting PDF ${pdfUrl}`, pdfErr.message);
        }
      }
    } catch (err) {
      console.error(`❌ Failed scraping ${url}`, err.message);
    }
  }

  return combinedText;
}

module.exports = scrapeNigeriaHealthWatch;
