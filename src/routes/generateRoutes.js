const express = require("express");
const openai = require("../config/openai");
const { storyQueue } = require("../queues/storyQueue");
const Story = require("../models/Story");
const mongoose = require("mongoose");
const ExtractedDocument = require("../models/ExtractedDocument");
const UserActivity = require("../models/UserActivity");
const verifyToken = require("../middlewares/verifyToken");
const BaseScrapeUrl = require("../models/BaseScrapeUrl");
const redis = require("../utils/redis"); // ← cache for fact-check
const router = express.Router();

const ALLOWED_LANGUAGES = ["English", "Yoruba", "Igbo", "Hausa", "French", "Spanish"];
const ALLOWED_TONES = ["neutral", "formal", "casual", "inspirational", "storytelling"];


// ---------- Helpers ----------

// 1) Fact-checking via GPT-5-mini (Responses API)
async function factCheckExtractedData(extractedText) {
  const verificationPrompt = `
You are an AI assistant responsible for fact-checking extracted content.
Review and correct any errors; if it's accurate, leave it unchanged.

---- Extracted Content ----
${extractedText}

---- Fact-checked version below ----
`.trim();

  try {
    const resp = await openai.responses.create({
      model: "gpt-5-mini",
      input: verificationPrompt,
      reasoning: { effort: "medium" },
      text: { verbosity: "medium" }
    });
    return resp.output_text?.trim() || extractedText;
  } catch (err) {
    console.error("❌ Fact-checking failed:", err.message);
    return extractedText;
  }
}

// 2) Generate story via GPT-5-mini (Responses API)
async function generateWithGPT5Mini(inputText, effort = "medium", verbosity = "medium") {
  const resp = await openai.responses.create({
    model: "gpt-5-mini",
    input: inputText,
    reasoning: { effort },
    text: { verbosity }
  });
  return resp.output_text?.trim() || "";
}

// Small safe Redis helpers
async function cacheGet(key) {
  try { return await redis.get(key); } catch { return null; }
}
async function cacheSet(key, value, ttlSec = 86400) {
  try { await redis.set(key, value, "EX", ttlSec); } catch {}
}


// ------------------------------------------------------------
// ⚡ /api/generate-story/instant
// Generates a lightweight idea in <2s and queues enrichment
// ------------------------------------------------------------
// put near the top of this file (under imports)
const SEARCH_INDEX = "default"; // change if your Atlas Search index has a different name

function buildSearchPipeline({
  pillar,
  keywords = [],
  limit = 5,
  withHighlights = false,
  projectFullContent = false, // keep false to avoid heavy payloads
}) {
  const terms = (Array.isArray(keywords) ? keywords : []).filter(Boolean);
  const queryString = terms.join(" ").trim() || pillar;

  const searchStage = {
    $search: {
      index: SEARCH_INDEX,
      compound: {
        must: [
          // pillar is an array of strings; equals matches any element
          { equals: { path: "pillar", value: pillar } }
        ],
        should: [
          {
            text: {
              path: ["title", "content_summary", "full_content"],
              query: queryString,
              score: { boost: { value: 3 } }
            }
          },
          ...(terms.length
            ? [{
                text: {
                  path: ["title", "content_summary", "full_content"],
                  query: terms
                }
              }]
            : [])
        ],
        minimumShouldMatch: 0
      },
      ...(withHighlights
        ? { highlight: { path: ["content_summary", "full_content"] } }
        : {})
    }
  };

  const projectStage = {
    $project: {
      title: 1,
      content_summary: 1,
      ...(projectFullContent ? { full_content: 1 } : {}),
      updatedAt: 1,
      source: 1,
      metadata: 1,
      score: { $meta: "searchScore" },
      ...(withHighlights ? { highlights: { $meta: "searchHighlights" } } : {})
    }
  };

  return [searchStage, projectStage, { $sort: { score: -1, updatedAt: -1 } }, { $limit: limit }];
}

// ------------------------------------------------------------
// ⚡ /api/generate-story/instant  (with draft + queue)
// ------------------------------------------------------------

router.post("/instant", verifyToken, async (req, res) => {
  const {
    pillar,
    theme,
    prompt: userPrompt,
    language = "English",
    tone = "neutral",
    keywords = []
  } = req.body;
  const userId = req.user?.id;

  // --- validation ---
  if (!pillar || !userPrompt) {
    return res.status(400).json({
      message: "Missing required fields: 'pillar' and 'prompt' are required."
    });
  }
  if (!ALLOWED_LANGUAGES.includes(language) || !ALLOWED_TONES.includes(tone)) {
    return res.status(400).json({
      message: `Invalid language or tone. Allowed languages: ${ALLOWED_LANGUAGES.join(", ")}, tones: ${ALLOWED_TONES.join(", ")}`,
    });
  }

  try {
    const kwList = Array.isArray(keywords) ? keywords.slice(0, 12).filter(Boolean) : [];

    // --- fetch context docs via Atlas Search ---
    let docs = await ExtractedDocument.aggregate(
      buildSearchPipeline({ pillar, keywords: kwList, limit: 5, withHighlights: false, projectFullContent: false })
    );

    // fallback: pillar-only
    if (!docs.length) {
      console.warn(`⚠️ No matches for pillar=${pillar} keywords=${kwList.join(",")}. Falling back.`);
      docs = await ExtractedDocument.aggregate(
        buildSearchPipeline({ pillar, keywords: [], limit: 5, withHighlights: false, projectFullContent: false })
      );
    }

    console.log(`📚 Extracted ${docs.length} docs for pillar=${pillar}, keywords=${kwList.join(",")}`);

    const extractedText = (docs || [])
      .map(d => `[${d.title}] — ${d.content_summary || ""}`)
      .join("\n");

    const ideaPrompt = `
Generate 2–3 short story angles based on the following context.
Each should include:
- Title
- Synopsis (2–3 sentences)
- 3 Key Points (bullet list)

Context:
${extractedText}

User Prompt: ${userPrompt}
Language: ${language}
Tone: ${tone}
`.trim();

    // --- quick OpenAI idea generation ---
    let ideaText = "No ideas generated.";
    let ideaObjects = [];

    try {
      const fastIdeas = await openai.responses.create({
        model: "gpt-5-mini",
        input: ideaPrompt,
        reasoning: { effort: "low" },
        text: { verbosity: "low" },
      });

      ideaText =
        fastIdeas?.output_text?.trim() ||
        fastIdeas?.content?.map?.(c => c?.text).filter(Boolean).join("\n").trim() ||
        fastIdeas?.choices?.map?.(ch => ch?.message?.content).filter(Boolean).join("\n").trim() ||
        ideaText;

      // 🔍 Parse into array of structured angles
    // 🔍 Parse into array of structured angles (tolerant version)
const angleRegex =
/(?:\*\*?\s*)?(?:\d+[\.\)]\s*)?(?:Title|Story Title)[:\-–]?\s*(.*?)\n[\s\S]*?(?:Synopsis|Summary)[:\-–]?\s*(.*?)\n[\s\S]*?(?:Key Points|Key Takeaways|Highlights)[:\-–]?\s*([\s\S]*?)(?=\n(?:\*\*?\s*)?(?:\d+[\.\)]|Title|Story Title)|$)/gi;

let match;
while ((match = angleRegex.exec(ideaText)) !== null) {
const [, title, synopsis, keyPts] = match;
ideaObjects.push({
  index: ideaObjects.length,
  title: title?.trim() || "Untitled Idea",
  synopsis: synopsis?.trim() || "",
  keyPoints: keyPts
    .split(/\n|[-•]/)
    .map((p) => p.trim())
    .filter(Boolean),
  status: "enriching",
});
}

// ✅ fallback: single story angle if GPT returned generic text
if (ideaObjects.length === 0 && ideaText) {
ideaObjects.push({
  index: 0,
  title: ideaText.match(/Title[:\-–]?\s*(.+)/i)?.[1]?.trim() || "Generated Story",
  synopsis: ideaText.match(/Synopsis[:\-–]?\s*(.+)/i)?.[1]?.trim() || "No synopsis found.",
  keyPoints: ideaText.match(/[-•].+/g)?.map((p) => p.replace(/[-•]/, "").trim()) || [],
  status: "enriching",
});
}

    } catch (llmErr) {
      console.error("⚠️ OpenAI fast-ideas failed:", llmErr);
    }

    // --- create DRAFT story immediately ---
    const draft = await Story.create({
      title: `Draft: ${pillar} — ${new Date().toISOString().slice(0, 10)}`,
      content: ideaText,
      status: "draft",
      generatedBy: new mongoose.Types.ObjectId(userId),
      pillar,
      theme,
      language,
      tone,
      angles: ideaObjects, // ✅ store structured angles
      sources: docs.map(d => ({ id: d._id, title: d.title })),
      userPrompt,
    });

    // --- enqueue background enrichment jobs ---
    let queued = false;
    try {
      if (ideaObjects.length > 0) {
        for (const [index, idea] of ideaObjects.entries()) {
          await storyQueue.add("enrichStoryAngle", {
            storyId: draft._id.toString(),
            index,
            userId,
            pillar,
            theme,
            language,
            tone,
            docs,
            rawText: extractedText,
            userPrompt,
            title: idea.title,
            synopsis: idea.synopsis,
          });
        }
        queued = true;
      } else {
        // fallback to legacy enrichStory job
        await storyQueue.add("enrichStory", {
          storyId: draft._id.toString(),
          userId,
          pillar,
          theme,
          language,
          tone,
          docs,
          rawText: extractedText,
          userPrompt,
        });
        queued = true;
      }
    } catch (qErr) {
      console.error("⚠️ Failed to enqueue enrichment job:", qErr);
    }

    // --- respond instantly ---
    return res.status(200).json({
      message: "Instant story ideas ready",
      storyId: draft._id,
      ideas: ideaText,
      angles: ideaObjects, // ✅ new structured output for new UI
      status: queued ? "queued_for_enrichment" : "enrichment_queue_failed",
      meta: {
        docs_used: docs.length,
        pillar,
        keywords: kwList,
        language,
        tone,
      },
    });
  } catch (err) {
    console.error("❌ Instant generation failed:", err);
    return res.status(500).json({
      message: "Failed to generate instant story",
      error: err.message,
    });
  }
});


// ---------- Route ----------

router.post("/", verifyToken, async (req, res) => {
  const {
    pillar,
    theme,
    prompt: userPrompt,
    tone = "neutral",
    language = "English",
    keywords = [],
    fast = false, // ← allow client to skip fact-check & use cache
  } = req.body;

  const userId = req.user?.id || null;

  if (!pillar || !theme || !userPrompt) {
    return res.status(400).json({ message: "Please provide pillar, theme, and prompt." });
  }
  if (!ALLOWED_LANGUAGES.includes(language) || !ALLOWED_TONES.includes(tone)) {
    return res.status(400).json({
      message: `Invalid language or tone. Allowed languages: ${ALLOWED_LANGUAGES.join(", ")}, tones: ${ALLOWED_TONES.join(", ")}`,
    });
  }

  try {
    // --- 1) Retrieve a small, indexed, lean set of docs (fast) ---
    // Make sure you add the index in the schema (see below).
    const docs = await ExtractedDocument.find({
      pillar,
      keywords: { $in: keywords },
    })
    .select("title content_summary updatedAt source metadata") // keep payload tiny
      .lean()
      .limit(8);                                  // predictable context size

    // Internal documents (from DB)
const docMap = docs.map((d) => ({
  id: d._id.toString(),
  title: d.title,
  summary: d.content_summary || "",
  link: `/documents/${d._id}`, // ✅ internal route
  type: "internal",
}));

// External scraped docs (from your scraping utils)
const scrapedUrls = await BaseScrapeUrl.find().lean();
const externalDocs = scrapedUrls.map((s) => ({
  id: s._id.toString(),
  title: s.title || s.url, // fallback to URL if no title
  summary: s.description || "",
  link: s.url, // ✅ actual external URL
  type: "external",
}));
      
// Merge them
const allDocs = [...docMap, ...externalDocs];

const extractedText = allDocs
.map((d) => `[${d.title}] — ${d.summary}`)
.join("\n");

    // --- 2) Optional fact-check (skip in fast mode) + cache by (pillar, keywords) ---
    let verifiedText = extractedText;

    if (!fast && docs.length) {
      const key = `fc:${pillar}:${keywords.slice().sort().join("|")}`;
      const cached = await cacheGet(key);
      if (cached) {
        verifiedText = cached;
      } else {
        verifiedText = await factCheckExtractedData(extractedText);
        if (verifiedText && verifiedText.length < 50_000) {
          await cacheSet(key, verifiedText, 60 * 60 * 24); // 24h
        }
      }
    }

    // --- 3) Single LLM generation (retry only if empty) ---
    const ragPrompt = `
You are a creative story angle generator for stories in **${language}** with a **${tone}** tone.

Verified documents for context:
${verifiedText}

When citing, always use the **document title** in square brackets (e.g. [National Health Act]) 
instead of "Doc 1" or numbers.


Generate a **story angle** that includes:
- **Story Title**
- **Synopsis**
- **Key Data Points (with inline citations using [Document Title])
- **Potential Interviews**
- **Suggested Headlines**
- **Recommended Tone** (must match the chosen tone)
- **Sources** Sources (list the document titles used, match them exactly)

Context:
- Pillar: "${pillar}"
- Theme: "${theme}"
- User Prompt: "${userPrompt}"
`.trim();

    let storyOutput = await generateWithGPT5Mini(ragPrompt, "medium", "medium");
    // 🧹 Cleanup: remove trailing "assistant offers" or meta sentences
if (storyOutput) {
  storyOutput = storyOutput
    .replace(/If you would like[,:\s].*?(useful\?|helpful\.)/gis, "")
    .replace(/I can (?:also )?(help|assist|provide).*/gis, "")
    .replace(/(?:Would you like|Do you want) me to.*/gis, "")
    .replace(/(?:Let me know|Please tell me).*$/gis, "")
    .trim();
}

    if (!storyOutput) {
      console.warn("Empty result; retrying with high settings…");
      storyOutput = await generateWithGPT5Mini(ragPrompt, "high", "high");
    }
    if (!storyOutput) throw new Error("GPT-5-mini returned empty output.");

    // --- 4) Log activity (non-blocking is okay if you prefer) ---
    await UserActivity.create({
      userId,
      action: "generate_story",
      language,
      tone,
    });

    // --- 5) Done ---
    res.status(200).json({
      story: storyOutput,
      sources: allDocs,
      insightsLink: "https://sojoinsights.nigeriahealthwatch.com/guest",
    });
  } catch (err) {
    console.error("Error generating story:", err);
    res.status(500).json({
      message: "An error occurred while generating the story.",
      error: err.message,
    });
  }
});

// router.post("/", verifyToken, async (req, res) => {


//   const {
//     pillar,
//     theme,
//     prompt: userPrompt,
//     tone = "neutral",
//     language = "English",
//     keywords = [],
//     fast = false,
//   } = req.body;

//   const userId = req.user?.id || null;

//   if (!pillar || !theme || !userPrompt) {
//     return res.status(400).json({ message: "Please provide pillar, theme, and prompt." });
//   }
//   if (!ALLOWED_LANGUAGES.includes(language) || !ALLOWED_TONES.includes(tone)) {
//     return res.status(400).json({
//       message: `Invalid language or tone. Allowed languages: ${ALLOWED_LANGUAGES.join(", ")}, tones: ${ALLOWED_TONES.join(", ")}`,
//     });
//   }

//   try {
//     // --- 1️⃣ Build flexible keyword regex ---
//     const keywordSearch = keywords?.length ? keywords.join(" ") : "";
//     const pillarRegex = new RegExp(pillar, "i");

//     // --- 2️⃣ Try keyword match first ---
//     let docs = await ExtractedDocument.find({
//       pillar: { $in: [pillarRegex] },
//       ...(keywordSearch ? { $text: { $search: keywordSearch } } : {})
//     })
//     .select({
//       title: 1, content_summary: 1, full_content: 1,
//       updatedAt: 1, source: 1, metadata: 1,
//       score: { $meta: "textScore" }
//     })
//     .sort({ score: { $meta: "textScore" } })
//     .limit(8)
//     .lean();

//     console.log(`📚 Primary fetch: ${docs.length} docs for pillar="${pillar}", keywords=${keywords.join(", ")}`);

//     // --- 3️⃣ Fallback if none found ---
//     if (!docs.length) {
//       docs = await ExtractedDocument.find({
//         pillar: { $in: [pillarRegex] },
//         $or: [
//           { keywords: { $in: keywords.map(k => new RegExp(k, "i")) } },
//           { title:    { $in: keywords.map(k => new RegExp(k, "i")) } },
//           { content_summary: { $in: keywords.map(k => new RegExp(k, "i")) } },
//           { full_content: { $in: keywords.map(k => new RegExp(k, "i")) } },
//         ],
//       })
//       .select("title content_summary full_content updatedAt source metadata")
//       .sort({ updatedAt: -1 })
//       .limit(8)
//       .lean();
//     }

//     // --- 4️⃣ Log titles to confirm grounding ---
//     console.log("📖 Docs fetched:");
//     docs.forEach((d, i) => {
//       console.log(`   ${i + 1}. ${d.title}`);
//     });

//     // --- 5️⃣ Merge with external scraped URLs ---
//     const scrapedUrls = await BaseScrapeUrl.find().lean();
//     const externalDocs = scrapedUrls.map(s => ({
//       id: s._id.toString(),
//       title: s.title || s.url,
//       summary: s.description || "",
//       link: s.url,
//       type: "external",
//     }));

//     const internalDocs = docs.map(d => ({
//       id: d._id.toString(),
//       title: d.title,
//       summary: d.content_summary || d.content?.slice(0, 400) || "",
//       link: `/documents/${d._id}`,
//       type: "internal",
//     }));

//     const allDocs = [...internalDocs, ...externalDocs];

//     // --- 6️⃣ Construct extracted context text ---
//     const extractedText = allDocs.map(d => `[${d.title}] — ${d.summary}`).join("\n");
//     console.log("🧩 Extracted context sample:", extractedText.slice(0, 300), "...");

//     // --- 7️⃣ Optional fact-checking & cache ---
//     let verifiedText = extractedText;
//     if (!fast && docs.length) {
//       const key = `fc:${pillar}:${keywords.slice().sort().join("|")}`;
//       const cached = await cacheGet(key);
//       if (cached) {
//         console.log(`💾 Using cached fact-checked version for ${key}`);
//         verifiedText = cached;
//       } else {
//         console.log("🧠 Fact-checking new context...");
//         verifiedText = await factCheckExtractedData(extractedText);
//         if (verifiedText && verifiedText.length < 50_000) {
//           await cacheSet(key, verifiedText, 60 * 60 * 24);
//         }
//       }
//     }

//     // --- 8️⃣ Generate story ---
//     const ragPrompt = `
// You are a creative story angle generator for stories in **${language}** with a **${tone}** tone.

// Verified documents for context:
// ${verifiedText}

// When citing, always use the **document title** in square brackets (e.g. [National Health Act]).

// Generate a **story angle** that includes:
// - Story Title
// - Synopsis
// - Key Data Points (with inline citations)
// - Potential Interviews
// - Suggested Headlines
// - Recommended Tone
// - Sources

// Context:
// - Pillar: "${pillar}"
// - Theme: "${theme}"
// - User Prompt: "${userPrompt}"
// `.trim();

//     let storyOutput = await generateWithGPT5Mini(ragPrompt, "medium", "medium");
//     if (!storyOutput) {
//       console.warn("⚠️ Empty result; retrying with high settings…");
//       storyOutput = await generateWithGPT5Mini(ragPrompt, "high", "high");
//     }
//     if (!storyOutput) throw new Error("GPT-5-mini returned empty output.");

//     // --- 9️⃣ Log user activity ---
//     await UserActivity.create({
//       userId,
//       action: "generate_story",
//       language,
//       tone,
//     });

//     // --- 🔟 Respond ---
//     res.status(200).json({
//       story: storyOutput,
//       sources: allDocs,
//       insightsLink: "https://sojoinsights.nigeriahealthwatch.com/guest",
//     });
//   } catch (err) {
//     console.error("❌ Error generating story:", err);
//     res.status(500).json({ message: "Error generating story", error: err.message });
//   }
// });


// ------------------------------------------------------------
// 🧩 /api/generate-story/full
// Manually triggers enrichment (normally background only)
// ------------------------------------------------------------




router.post("/full", verifyToken, async (req, res) => {
  const { pillar, theme, language, tone, docs = [], rawText = "", userPrompt } = req.body;
  const userId = req.user?.id;

  await storyQueue.add("enrichStory", { userId, pillar, theme, language, tone, docs, rawText, userPrompt });
  res.status(202).json({ message: "Full enrichment job queued." });
});

router.post("/select", verifyToken, async (req, res) => {
  const { storyId, selectedIndex } = req.body;
  const story = await Story.findById(storyId);
  if (!story) return res.status(404).json({ message: "Story not found" });

  story.selectedIndex = selectedIndex;
  await story.save();

  // Return current snapshot (client can still re-fetch)
  const fresh = await Story.findById(storyId)
    .select("angles selectedIndex content title createdAt sources quickInsights tags status")
    .populate("tags", "name slug")
    .lean();

    console.log("📤 [/select] returning story snapshot:", {
      id: fresh?._id?.toString(),
      quickInsightsLen: fresh?.quickInsights?.length,
      tagsType: Array.isArray(fresh?.tags) ? typeof fresh.tags[0] : typeof fresh?.tags,
      tagsPreview: Array.isArray(fresh?.tags) ? fresh.tags.slice(0, 5) : fresh?.tags,
    });
    
  res.json({ message: "Story selection saved", story: fresh });
});


// ------------------------------------------------------------
// ⚡ GET /api/generate-story/pending
// Returns any unchosen story drafts with generated angles
// ------------------------------------------------------------
router.get("/pending", verifyToken, async (req, res) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const drafts = await Story.find({
      generatedBy: userId,
      status: "draft",
      angles: { $exists: true, $not: { $size: 0 } },
      $or: [{ selectedIndex: { $exists: false } }, { selectedIndex: null }],
    })
      .select("_id title angles createdAt updatedAt userPrompt")
      .sort({ updatedAt: -1 })
      .lean();

    // Optional: prune angles content (keep small)
    const sanitized = drafts.map((d) => ({
      storyId: d._id,
      title: d.title,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      angles: d.angles.map((a) => ({
        index: a.index,
        title: a.title,
        synopsis: a.synopsis,
        keyPoints: a.keyPoints,
        status: a.status,
      })),
    }));

    res.status(200).json({
      message: "Pending story drafts fetched successfully",
      pending: sanitized,
    });
  } catch (err) {
    console.error("❌ Error fetching pending stories:", err);
    res.status(500).json({
      message: "Failed to fetch pending story drafts",
      error: err.message,
    });
  }
});

// ✅ Always keep dynamic route LAST
router.get("/:id", verifyToken, async (req, res) => {
  const story = await Story.findById(req.params.id)
    .select("angles selectedIndex content title createdAt sources quickInsights tags status userPrompt")
    .populate("tags", "name slug")
    .lean();
  if (!story) return res.status(404).json({ message: "Not found" });

  // prefer selected angle’s content if available
  let derivedContent = story.content;
  let derivedTitle = story.title;
  if (
    Number.isInteger(story.selectedIndex) &&
    story.angles?.length &&
    story.angles[story.selectedIndex]?.content
  ) {
    derivedContent = story.angles[story.selectedIndex].content || story.content;
    // Try to parse "Story Title" from the angle content if present; otherwise keep title
    const parsedTitle = derivedContent.match(/^\s*\*\*?Story Title\*\*?[:\-–]?\s*(.+)$/mi)?.[1]?.trim()
      || derivedContent.match(/Story Title[:\-–]\s*(.+)/i)?.[1]?.trim();
    derivedTitle = parsedTitle || story.title;
  }

  console.log("📤 [/id] returning derived story:", {
    id: story?._id?.toString(),
    derivedTitle,
    quickInsightsLen: story?.quickInsights?.length,
    tagsPreview: Array.isArray(story?.tags) ? story.tags.slice(0, 5) : story?.tags,
  });
  
  // Return with derived fields
  res.json({
    ...story,
    content: derivedContent,
    title: derivedTitle,
  });
});


router.patch("/:id/mark-used", verifyToken, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ message: "Story not found" });

    story.status = "used";
    await story.save();

    res.json({ message: "Draft marked as used" });
  } catch (err) {
    res.status(500).json({ message: "Failed to update story", error: err.message });
  }
});



module.exports = router;
