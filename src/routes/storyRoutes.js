//src/routes/storyroutes
const mongoose = require("mongoose");
const express = require("express");
const Story = require("../models/Story");
const verifyToken = require("../middlewares/verifyToken");
const redis = require("../utils/redis");
const slugify = require("slugify");
const Tag = require("../models/Tag");
const Chat = require("../models/Chats");
const { normalizeTagsToIds } = require("../utils/normalizeTags"); // add at top

const openai = require("../config/openai");
const { getIndex } = require("../utils/pineconeIndex");
const ContentBasedRecommender = require("content-based-recommender");
const recommender = new ContentBasedRecommender({
  minScore: 0.1,
  maxSimilarDocuments: 10,
});

const router = express.Router();

let cacheHits = 0, cacheMisses = 0;

// Utility: Invalidate cache for a given story
async function invalidateCache(userId, storyId) {
  const pattern = `recommendations:${userId}:${storyId}*`;
  const keys = await redis.keys(pattern);
  if (keys.length) {
    await redis.del(...keys);
    console.log(`🧹 Invalidated cache keys: ${keys.join(", ")}`);
  }
}

// ---------- CTR weighting helper ----------
function behaviorScore(ctr = {}) {
  const w = { opens: 1, clicks: 2, copies: 1.5, exports: 2.5 };
  const raw =
    (ctr.opens || 0) * w.opens +
    (ctr.clicks || 0) * w.clicks +
    (ctr.copies || 0) * w.copies +
    (ctr.exports || 0) * w.exports;
  const ageDays = ctr.lastInteractionAt
    ? (Date.now() - new Date(ctr.lastInteractionAt).getTime()) / 86400000
    : 0;
  const decay = Math.pow(0.5, ageDays / 14); // 14-day half-life
  return Math.min(1, (raw / 20) * decay);
}


// Utility: Pre-warm cache for recommendations
async function warmCache(userId, storyId, limit = 5) {
  const stories = await Story.find({ generatedBy: userId }).lean();
  const docs = stories.map(s => ({ id: s._id.toString(), content: s.content }));
  recommender.train(docs);

  const similar = recommender.getSimilarDocuments(storyId.toString(), limit);
  const similarIds = similar.map(r => r.id);
  const recStories = await Story.find({ _id: { $in: similarIds } })
                               .populate("tags")
                               .lean();

  const sortedRecommendations = similar.map(r => ({
    story: recStories.find(s => s._id.toString() === r.id),
    score: r.score
  })).filter(r => r.story);

  const cacheKey = `recommendations:${userId}:${storyId}:${limit}`;
  await redis.set(cacheKey, JSON.stringify({ recommendations: sortedRecommendations }), "EX", 60 * 60 * 24);
  console.log(`💾 Pre-warmed cache: ${cacheKey}`);
}

// Helper to extract quick insights and solution tags via Responses API
// Helper to extract quick insights and solution tags via Responses API
async function analyzeStoryMetadata(storyContent, language = "English") {
  const metaPrompt = `
You are an AI analyst. Respond in **${language}**.

From the following story content, generate:
1. QuickInsights: three concise bullet points summarizing key findings or solutions.
2. SolutionTags: a list of up to 5 descriptive tags (single words or short phrases) highlighting solution-related themes.

Format:

QuickInsights:
- ...
- ...
- ...

SolutionTags: tag1, tag2, tag3

Story:
${storyContent}
  `;

  const resp = await openai.responses.create({
    model: "gpt-5",
    input: metaPrompt,
    reasoning: { effort: "low" },
    text: { verbosity: "low" }
  });

  const output = resp.output_text?.trim() || "";

  const insightsMatch = output.match(/QuickInsights:\s*([\s\S]*?)\nSolutionTags:/);
  const tagsMatch = output.match(/SolutionTags:\s*(.+)$/m);

  const quickInsights = insightsMatch
    ? insightsMatch[1].trim().split("\n").map(line => line.replace(/^- */, ""))
    : [];

  const solutionTags = tagsMatch
    ? tagsMatch[1].split(/,\s*/).map(t => t.trim())
    : [];

  return { quickInsights, solutionTags };
}



router.post("/add", async (req, res) => {
  try {
    let { title, content, keywords, userId, sources = [], quickInsights: clientInsights, language = "English" } = req.body;

    // 🔑 Ensure sources is parsed into array of objects
    if (typeof sources === "string") {
      try {
        sources = JSON.parse(sources);
      } catch (e) {
        console.error("⚠️ Failed to parse sources string, defaulting to []:", e);
        sources = [];
      }
    }

    if (!Array.isArray(sources)) {
      console.warn("⚠️ Sources is not an array, defaulting to []:", sources);
      sources = [];
    }

    if (!title || !content || !keywords || !Array.isArray(keywords) || !userId) {
      return res.status(400).json({
        message: "Title, content, keywords array, and userId are required."
      });
    }
    if (content.trim() === "") {
      return res.status(400).json({ message: "Content cannot be empty." });
    }

    console.log("📝 Saving story with content length:", content.length);

    // Normalize tags from keywords
    
    // Extract metadata
    const { quickInsights, solutionTags } = await analyzeStoryMetadata(content, language);

    const normalizedTags = await normalizeTagsToIds(keywords);
    const solutionTagIDs = await normalizeTagsToIds(solutionTags);

    
    // Convert solution tags to Tag IDs
   
    console.log("✅ Cleaned sources being saved:", sources);

    async function generateCreativeTitle(content, pillar) {
      const titlePrompt = `
    Read the following story and propose a short, creative, constructive title (max 12 words).
    - It should be unique and engaging.
    - Avoid repeating "Story about ${pillar}".
    - Focus on the theme and solutions.
    
    Story Content:
    ${content}
      `;
    
      try {
        const resp = await openai.responses.create({
          model: "gpt-5-mini",
          input: titlePrompt,
          text: { verbosity: "low" }
        });
        return resp.output_text?.trim() || `Story about ${pillar}`;
      } catch (e) {
        console.warn("⚠️ Title generation failed:", e.message);
        return `Story about ${pillar}`;
      }
    }

    // Generate a creative title if default is generic
 let storyTitle = title;
 if (!title || title.startsWith("Story about")) {
   storyTitle = await generateCreativeTitle(content, keywords[0] || pillar );
 }

    
 const allTagIds = [...normalizedTags, ...solutionTagIDs].map(
  id => new mongoose.Types.ObjectId(id)
);
 
 const newStory = new Story({
   title: storyTitle,
   content: content.trim(),
   tags: allTagIds,  // ✅ now safe
   quickInsights: clientInsights || quickInsights.join("\n"),
   generatedBy: new mongoose.Types.ObjectId(userId),
   sources,
 });

    await newStory.save();
    await newStory.populate("tags");

    res.status(201).json(newStory);
  } catch (err) {
    console.error("❌ Error saving story:", err);
    res.status(500).json({ message: "Failed to save story", error: err.message });
  }
});



// GET all stories for user
router.get("/", verifyToken, async (req, res) => {
  try {
    const stories = await Story.find({
      generatedBy: req.user.id,
      $or: [
        { isUploadedStory: { $exists: false } },
        { isUploadedStory: false }
      ]
    }).populate("tags");
    res.status(200).json(stories);
  } catch (error) {
    res.status(500).json({ message: "Error fetching stories", error: error.message });
  }
});

router.get("/uploaded", verifyToken, async (req, res) => {
  try {
    const uploadedStories = await Story.find({
      generatedBy: req.user.id,
      isUploadedStory: true
    }).populate("tags");
    res.status(200).json(uploadedStories);
  } catch (error) {
    res.status(500).json({ message: "Error fetching uploaded stories", error: error.message });
  }
});



// ✅ GET single story
router.get("/:id", verifyToken, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ message: "Story not found" });
    res.status(200).json(story);
  } catch (error) {
    res.status(500).json({ message: "Error fetching story", error: error.message });
  }
});

// ✅ PUT with version tracking
router.put("/:id", verifyToken, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) return res.status(404).json({ message: "Story not found" });

    story.versions.push({ content: story.content, updatedAt: new Date() });
    story.title = req.body.title || story.title;
    story.content = req.body.content || story.content;

    if (req.body.tags) {
      story.tags = await normalizeTagsToIds(req.body.tags);
    }

    await story.save();
    invalidateCache(story.generatedBy.toString(), story._id);
    warmCache(story.generatedBy.toString(), story._id);

    res.status(200).json({ message: "Story updated successfully!", story });
  } catch (error) {
    res.status(500).json({ message: "Error updating story", error: error.message });
  }
});

// DELETE story
router.delete("/:id", verifyToken, async (req, res) => {
  try {
    const deletedStory = await Story.findByIdAndDelete(req.params.id);
    if (!deletedStory) return res.status(404).json({ message: "Story not found" });

    invalidateCache(deletedStory.generatedBy.toString(), deletedStory._id);

    res.status(200).json({ message: "Story deleted successfully!" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting story", error: error.message });
  }
});

// GET /api/stories/:id/recommendations
// GET /api/stories/:id/recommendations


// ---------- HYBRID RECOMMENDATIONS ----------
// router.get("/:id/recommendations", verifyToken, async (req, res) => {
//   try {
//     const userId = req.user.id;
//     const storyId = req.params.id;
//     const limit = parseInt(req.query.limit) || 5;
//     const cacheKey = `recommendations:v2:${userId}:${storyId}:${limit}`;

//     // 1️⃣ Try cache
//     const cached = await redis.get(cacheKey);
//     if (cached) {
//       cacheHits++;
//       return res.status(200).json(JSON.parse(cached));
//     }
//     cacheMisses++;

//     // 2️⃣ Gather user stories for TF-IDF
//     const stories = await Story.find({ generatedBy: userId }).lean();
//     const docs = stories.map(s => ({ id: s._id.toString(), content: s.content }));
//     recommender.train(docs);
//     const tfidf = recommender.getSimilarDocuments(storyId.toString(), limit * 3);

//     // 3️⃣ Get semantic neighbors via Pinecone
//     const index = await getIndex(process.env.PINECONE_INDEX_NAME || "stories");
//     const vectorMatches = await index.query({
//       id: storyId.toString(),
//       topK: limit * 3,
//       includeMetadata: true,
//     });

//     const vectorMap = new Map(
//       vectorMatches.matches.map(m => [m.id, m.score])
//     );

//     // 4️⃣ Merge candidates
//     const candidateIds = [
//       ...new Set([...tfidf.map(r => r.id), ...vectorMap.keys()]),
//     ].filter(id => id !== storyId);

//     const candidates = await Story.find({ _id: { $in: candidateIds } })
//       .populate("tags")
//       .lean();

//     const seed = stories.find(s => s._id.toString() === storyId);
//     const seedTags = new Set((seed?.tags || []).map(t => t.toString()));

//     // 5️⃣ Compute hybrid score
//     const scored = candidates.map(c => {
//       const tf = tfidf.find(r => r.id === c._id.toString())?.score || 0;
//       const vec = vectorMap.get(c._id.toString()) || 0;
//       const tagOverlap = (() => {
//         const t = new Set((c.tags || []).map(x => x._id?.toString?.() || x.toString()));
//         const inter = [...t].filter(x => seedTags.has(x)).length;
//         return inter / (new Set([...t, ...seedTags]).size || 1);
//       })();
//       const beh = behaviorScore(c.ctr);
//       const hybrid = 0.4 * tf + 0.35 * vec + 0.15 * tagOverlap + 0.1 * beh;
//       return { story: c, score: hybrid };
//     });

//     const sorted = scored
//       .sort((a, b) => b.score - a.score)
//       .slice(0, limit)
//       .map(r => ({
//         id: r.story._id,
//         title: r.story.title,
//         summary: r.story.content.replace(/[#*_>\-]/g, "").slice(0, 200),
//         tags: (r.story.tags || []).map(t => t.name || t.slug || t.toString()),
//         createdAt: r.story.createdAt,
//         score: Number(r.score.toFixed(4)),
//       }));

//     const payload = { recommendations: sorted };
//     await redis.set(cacheKey, JSON.stringify(payload), "EX", 60 * 30); // 30 min TTL

//     res.status(200).json(payload);
//   } catch (err) {
//     console.error("❌ Hybrid recommendation failed:", err);
//     res.status(500).json({ message: "Recommendation failed", error: err.message });
//   }
// });

// Temporary placeholder while recommendations are disabled
router.get("/:id/recommendations", verifyToken, async (req, res) => {
  res.status(200).json({ recommendations: [] });
});


// ---------- Cache stats ----------
setInterval(() => {
  const total = cacheHits + cacheMisses;
  const rate = total ? ((cacheHits / total) * 100).toFixed(2) : 0;
  console.log(`📊 Cache hit rate: ${rate}% (${cacheHits}/${total})`);
}, 3600000);

// POST /api/stories/:id/linkChat
router.post("/:id/linkChat", verifyToken, async (req, res) => {
  try {
    const story = await Story.findById(req.params.id);
    if (!story) {
      return res.status(404).json({ message: "Story not found" });
    }

    let chatId = story.linkedChatId;
    let chat = null;

    // If story already has a linkedChatId, verify the chat still exists
    if (chatId) {
      chat = await Chat.findById(chatId);
    }

    // If no valid existing chat, create a fresh one
    if (!chat) {
      const newChat = new Chat({
        userId: new mongoose.Types.ObjectId(req.user.id),
        name: `Discussion: ${story.title}`,
        linkedStoryId: story._id,
        messages: [
          { user: "system", text: story.content }
        ],
      });

      await newChat.save();
      
      story.linkedChatId = newChat._id;
      await story.save();

      chat = newChat;
      chatId = newChat._id;
    }

    res.status(200).json({ linkedChatId: chatId });
  } catch (error) {
    console.error("Error linking chat to story:", error);
    res.status(500).json({ message: "Internal server error", error: error.message });
  }
});


module.exports = router;
