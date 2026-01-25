// backend/src/scripts/ingestNigeriaHealthWatch.js
// require('dotenv').config({ debug: true, override: true });

const scrapeNigeriaHealthWatch = require('../utils/scrapeNigeriaHealthWatch');
const { chunkText } = require('../utils/chunkText');
const { getIndex } = require('../utils/pineconeIndex');
const crypto = require('crypto');

async function ingestNigeriaHealthWatch() {
  console.log('🚀 Starting integrated ingestion using llama-text-embed-v2...');

  const fullText = await scrapeNigeriaHealthWatch();
  
  // Log a preview of the full text for sanity check
  console.log('--- Full Text Preview (first 500 chars) ---');
  console.log(fullText.slice(0, 500));
  console.log('--- End of Full Text Preview ---');

  const chunks = chunkText(fullText, 800);
  console.log(`ℹ Retrieved and chunked content into ${chunks.length} segments`);

  // Log the first few chunks to inspect them
  console.log('--- Chunk Samples ---');
  chunks.slice(0, 3).forEach((chunk, i) => {
    console.log(`Chunk ${i + 1} (first 300 chars):\n${chunk.slice(0, 300)}\n---`);
  });

  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME);
  const namespace = index.namespace("default");
  
  const records = chunks.map((chunk) => ({
    id: crypto.createHash("sha256").update(chunk).digest("hex"),
    text: chunk, // this is the main field Pinecone embeds
  }));
  

  console.log('Serialized sample record JSON:', JSON.stringify(records[0], null, 2));

  // Log one record for debugging
  // console.log('--- Sample Record ---');
  // console.log(records[0]);

  // console.log('↗ Upserting records into Pinecone with integrated embedding...');
  await namespace.upsertRecords(records);
  // console.log('  Upsert completed successfully.');

  // console.log('⏳ Waiting 15 seconds for index consistency...');
  await new Promise(resolve => setTimeout(resolve, 15000));

  // console.log('✅ Integrated data ingestion completed.');
}

module.exports = ingestNigeriaHealthWatch;
