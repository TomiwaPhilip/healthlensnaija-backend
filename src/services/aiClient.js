const { createOpenAI } = require("@ai-sdk/openai");

function assertEnvVar(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to run the newsroom agent`);
  }
  return value;
}

let cachedClient;

function getOpenAIClient() {
  if (!cachedClient) {
    const apiKey = assertEnvVar("OPENAI_API_KEY");
    cachedClient = createOpenAI({ apiKey });
  }
  return cachedClient;
}

module.exports = {
  getOpenAIClient,
};
