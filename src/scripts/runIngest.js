// backend/src/scripts/runIngest.js
const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../../.env'),
  debug: true,
});

const connectDB = require('../config/db'); // Import database connection function
const ingestNigeriaHealthWatch = require('./ingestNigeriaHealthWatch');

console.log('OPENAI_API_KEY:', process.env.OPENAI_API_KEY ? 'Loaded' : 'Missing');
console.log('PINECONE_API_KEY:', process.env.PINECONE_API_KEY ? 'Loaded' : 'Missing');

(async () => {
  try {
    console.log('⏳ Establishing database connection...');
    await connectDB();

    console.log('🚀 Database connected. Starting ingestion...');
    await ingestNigeriaHealthWatch();

    console.log('✅ Seeding completed successfully.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
})();
