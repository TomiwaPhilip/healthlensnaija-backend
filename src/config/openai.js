const path = require("path");
const OpenAI = require("openai");

// Explicitly load .env from the src folder
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY, // Load API key from .env
});

module.exports = openai;
