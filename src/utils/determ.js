// backend/src/utils/determ.js
const axios = require("axios");

/**
 * Fetch Determ mentions for a given topic
 * @param {string} topic - e.g. "Lassa fever"
 * @param {string} token - Determ access token (from env)
 */
async function fetchDetermMentions(topic, token) {
  const DETERMB_API_URL = "https://api.determ.io/v2/mentions"; // ✅ Fixed domain

  try {
    console.log(`📡 Fetching Determ mentions for topic: ${topic}`);

    const response = await axios.get(DETERMB_API_URL, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
      params: {
        query: topic,
        limit: 5,
        sort: "date",
        order: "desc",
      },
      timeout: 10000,
    });

    const results = response.data?.mentions || [];

    console.log(`✅ Retrieved ${results.length} Determ mentions for ${topic}`);

    return results.map((m) => ({
      title: m.title || "Untitled mention",
      url: m.url,
      source: m.source?.name || "Unknown Source",
      sentiment: m.sentiment || "neutral",
      date: m.date,
      summary: m.snippet || "",
    }));
  } catch (err) {
    console.error(
      `⚠️ Determ API fetch failed for ${topic}:`,
      err.response?.data || err.message
    );
    return [];
  }
}

/**
 * Fetch feeds for selected health topics (Lassa, Malaria, Health Insurance)
 */
async function fetchDetermFeeds(token) {
  const topics = ["Lassa Fever", "Malaria", "Health Insurance"];

  const allFeeds = {};
  for (const topic of topics) {
    allFeeds[topic] = await fetchDetermMentions(topic, token);
  }

  return allFeeds;
}

module.exports = { fetchDetermFeeds, fetchDetermMentions };
