const express = require("express");
const crypto = require("crypto");
const openai = require("../config/openai");
const UserActivity = require("../models/UserActivity");
const Story = require("../models/Story");
const verifyToken = require("../middlewares/verifyToken");
const redis = require("../utils/redis"); // ← caching
const router = express.Router();

const ALLOWED_LANGUAGES = ["English", "Yoruba", "Igbo", "Hausa"];
const ALLOWED_TONES = ["neutral", "formal", "casual", "inspirational", "storytelling"];

// ---- small cache helpers ----
async function cacheGet(key) { try { return await redis.get(key); } catch { return null; } }
async function cacheSet(key, val, ttl = 60 * 60 * 24) { try { await redis.set(key, val, "EX", ttl); } catch {} }

// ---- single-call generator ----
async function generateWithGPT5Mini(systemPrompt, userPrompt, effort = "medium", verbosity = "medium") {
  const resp = await openai.responses.create({
    model: "gpt-5-mini",
    input: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    reasoning: { effort },
    text: { verbosity }
  });
  return resp.output_text?.trim() || "";
}

// Robust QuickInsights extractor
function extractQuickInsights(text) {
  if (!text) return "";
  // capture everything after "QuickInsights" until a blank line or next heading
  const m = text.match(/QuickInsights\s*:\s*([\s\S]*?)(?:\n\s*\n|^#{1,6}\s|\n[A-Z][^\n]*:|\Z)/i);
  if (!m) return "";
  return m[1].trim();
}

router.post("/generate-story", verifyToken, async (req, res) => {
  const {
    pillar,
    theme,
    prompt: userPrompt,
    tone = "neutral",
    language = "English",
    keywords = [],
    fast = false,                 // ← client can opt-in to pure fast mode
  } = req.body;

  const userId = req.user?.id || null;

  // --- validation ---
  if (!pillar || !theme || !userPrompt) {
    return res.status(400).json({ message: "Please provide pillar, theme, and prompt." });
  }
  if (!ALLOWED_LANGUAGES.includes(language) || !ALLOWED_TONES.includes(tone)) {
    return res.status(400).json({
      message: `Invalid language or tone. Allowed languages: ${ALLOWED_LANGUAGES.join(", ")}, tones: ${ALLOWED_TONES.join(", ")}`,
    });
  }

  try {
    // --- cache key over the exact generation inputs ---
    const cacheKey = "gen:" + crypto
      .createHash("sha1")
      .update(JSON.stringify({ pillar, theme, userPrompt, tone, language }))
      .digest("hex");

    const cached = fast ? await cacheGet(cacheKey) : null;
    if (cached) {
      const parsed = JSON.parse(cached);
      return res.status(200).json(parsed);
    }

    // --- system instruction (solutions journalism + constraints) ---
    const systemPrompt = `
You are a creative story generator for the "${pillar}" pillar.
Always respond in ${language} with a ${tone} tone.

Integrate Solutions Journalism (SoJo) principles:
- Highlight solutions (not only problems)
- Provide evidence/data
- Mention who is responding effectively
- Acknowledge challenges/limitations

Also append at the end:
- QuickInsights: (3 concise bullet points)
- Add subtle solution-focused cues in tags if relevant
`.trim();

    const userText = `${theme}: ${userPrompt}`.trim();

    // --- single LLM pass (retry only if empty) ---
    let story = await generateWithGPT5Mini(systemPrompt, userText, "medium", "medium");
    if (!story) {
      story = await generateWithGPT5Mini(systemPrompt, userText, "high", "high");
    }
    if (!story) {
      return res.status(500).json({ message: "Failed to generate story." });
    }

    // --- parse insights & tags ---
    const quickInsights = extractQuickInsights(story);
    const normalizedKeywords = (keywords || []).map(k => String(k || "").toLowerCase());
    const solutionTags = normalizedKeywords.filter(k => /(solution|response|initiative|program|policy|innovation)/i.test(k));

    // --- save story (title defaults to theme) ---
    const newStory = new Story({
      title: theme,
      content: story,
      tags: [...new Set([...normalizedKeywords, ...solutionTags])],
      quickInsights,
      pillar,
      theme,
      tone,
      language,
      generatedBy: userId
    });
    await newStory.save();

    // non-blocking activity log (OK to await; cheap)
    await UserActivity.create({ userId, action: "generate_story", language, tone });

    const payload = {
      story,
      quickInsights,
      solutionTags,
      storyId: newStory._id,
    };

    // cache full payload for 24h (helps repeated prompts)
    await cacheSet(cacheKey, JSON.stringify(payload));

    res.status(200).json(payload);
  } catch (err) {
    console.error("Error generating story:", err);
    res.status(500).json({
      message: "An error occurred while generating the story.",
      error: err.message,
    });
  }
});

module.exports = router;
