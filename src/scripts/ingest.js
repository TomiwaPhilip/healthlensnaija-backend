const scrapeNigeriaHealthWatch = require('./scrapeNigeriaHealthWatch');
const { storeEmbedding } = require('./embedAndStore');

async function ingestAndEmbed() {
  console.log("🚀 Starting fresh ingestion...");
  const fullText = await scrapeNigeriaHealthWatch();

  const chunks = fullText.match(/[\s\S]{1,1000}/g); // split into smaller pieces (~1000 chars)

  for (const chunk of chunks) {
    await storeEmbedding(chunk);
  }
  console.log("✅ Ingestion complete");
}

module.exports = ingestAndEmbed;
