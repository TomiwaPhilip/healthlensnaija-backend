// backend/src/workers/storyWorker.js
const { Worker } = require("bullmq");
const mongoose = require("mongoose");
const crypto = require("crypto");
const redis = require("../utils/redis");
const openai = require("../config/openai");
const Story = require("../models/Story");
const BaseScrapeUrl = require("../models/BaseScrapeUrl");
const { normalizeTagsToIds } = require("../utils/normalizeTags");
// 🧭 Determ media insights
const { fetchDetermFeeds } = require("../utils/determ");


// 🧠 Load local expert database
const fs = require("fs");
const path = require("path");
const expertsPath = path.join(__dirname, "../data/interview_experts_pillars_final.json");
let interviewExperts = [];

try {
  interviewExperts = JSON.parse(fs.readFileSync(expertsPath, "utf-8"));
  console.log(`📘 Loaded ${interviewExperts.length} interview experts.`);
} catch (err) {
  console.error("⚠️ Could not load interview experts JSON:", err.message);
}

// 🔍 Helper: Match experts by pillar and keyword
function getRelevantExperts(pillar, keywords = []) {
  const lowerKeywords = keywords.map(k => k.toLowerCase());
  return interviewExperts.filter(expert => {
    const matchPillar = expert.pillars?.some(p => p.toLowerCase() === pillar?.toLowerCase());
    const matchKeyword = expert.keywords?.some(k => lowerKeywords.includes(k.toLowerCase()));
    return matchPillar || matchKeyword;
  }).slice(0, 5); // Limit to 5 to avoid clutter
}

// 🔧 Helper: Append experts to "Potential Interviews" section
function appendExpertsToInterviews(output, expertsList) {
  if (!expertsList.length) return output;

  const expertLines = expertsList.map(
    e => `- ${e.name} — ${e.designation}, ${e.organisation}`
  ).join("\n");

  const potentialMatch = output.match(/\*\*Potential Interviews\*\*([\s\S]*?)(?=\n\*\*|$)/i);
  if (potentialMatch) {
    const originalSection = potentialMatch[0];
    const updatedSection = `${originalSection.trim()}\n${expertLines}`;
    return output.replace(potentialMatch[0], updatedSection);
  } else {
    // Add new section if not found
    return output + `\n\n**Potential Interviews**\n${expertLines}`;
  }
}

let ioInstance;
try {
  const app = require("../server");
  ioInstance = app.get("io");
} catch {
  console.warn("⚠️ Socket.io instance not available.");
}

// ---------- helpers ----------
async function factCheckExtractedData(extractedText) {
  const prompt = `
You are an AI assistant responsible for fact-checking extracted content.
Review and correct any factual errors; if accurate, leave unchanged.

---- Extracted Content ----
${extractedText}

---- Fact-checked version ----
`.trim();

  try {
    const resp = await openai.responses.create({
      model: "gpt-5-mini",
      input: prompt,
      reasoning: { effort: "medium" },
      text: { verbosity: "medium" },
    });
    return resp.output_text?.trim() || extractedText;
  } catch (err) {
    console.error("❌ Fact-check failed:", err.message);
    return extractedText;
  }
}

async function generateWithGPT5Mini(inputText, effort = "medium", verbosity = "medium") {
  const resp = await openai.responses.create({
    model: "gpt-5-mini",
    input: inputText,
    reasoning: { effort },
    text: { verbosity },
  });
  return resp.output_text?.trim() || "";
}

async function cacheGet(key) {
  try { return await redis.get(key); } catch { return null; }
}
async function cacheSet(key, value, ttlSec = 86400) {
  try { await redis.set(key, value, "EX", ttlSec); } catch {}
}

function buildPayloadHash(data) {
  const { userId, pillar, theme, language, tone, userPrompt, docs = [] } = data || {};
  const titles = (docs || []).map((d) => d.title || d.id || d._id || "").sort();
  const payload = JSON.stringify({ userId, pillar, theme, language, tone, userPrompt, titles });
  return crypto.createHash("sha1").update(payload).digest("hex");
}

// ---------- worker ----------
const worker = new Worker(
  "storyQueue",
  async (job) => {
    console.log(`🧠 Worker picked up job [${job.id}] - ${job.name}`);

    // ==========================================
// 🧩 0. Handle uploaded PDF story generation (streaming)
// ==========================================
// if (job.name === "processUploadedPDF") {
//   const { userId, ragPrompt, allDocs, analysis, pendingDocId } = job.data;

//   console.log(`📄 Processing uploaded PDF job for user ${userId} | Doc ${pendingDocId}`);

//   try {
//     const PendingDocument = require("../models/PendingDocument");
//     const Tag = require("../models/Tag");
//     const slugify = require("slugify");

//     // 1️⃣ Start streaming GPT generation
//     const completion = await openai.chat.completions.create({
//       model: "gpt-5-mini",
//       stream: true,
//       messages: [{ role: "user", content: ragPrompt }],
//     });

//     let storyContent = "";

//     for await (const chunk of completion) {
//       const token = chunk.choices?.[0]?.delta?.content || "";
//       storyContent += token;
//       if (ioInstance) ioInstance.to(userId).emit("story:stream", { chunk: token });
//     }

//     // 2️⃣ Extract metadata after generation
//     const quickInsightsMatch = storyContent.match(/\*\*Key Insights\*\*([\s\S]*)/i);
//     const quickInsights = quickInsightsMatch
//       ? quickInsightsMatch[1].split(/\r?\n|•|-/).map(s => s.trim()).filter(Boolean)
//       : [];

//     const tagsMatch = storyContent.match(/(?:SolutionTags|Tags)[:\-–]?\s*([^\n]+)$/mi);
//     const solutionTags = tagsMatch ? tagsMatch[1].split(/,\s*/).map(t => t.trim()) : [];

//     // Convert solutionTags to ObjectIds
//     const solutionTagIDs = await Promise.all(
//       (solutionTags || []).map(async (tagName) => {
//         const slug = slugify(tagName.toLowerCase());
//         let tag = await Tag.findOne({ slug });
//         if (!tag) tag = new Tag({ name: tagName, slug, usageCount: 1 });
//         else tag.usageCount += 1;
//         await tag.save();
//         return tag._id;
//       })
//     );

//     // 3️⃣ Save completed Story
//     const story = new Story({
//       title: analysis.angle?.substring(0, 60) || "Generated Story",
//       content: storyContent.trim(),
//       generatedBy: userId,
//       quickInsights: quickInsights.join("\n"),
//       tags: solutionTagIDs,
//       sources: allDocs,
//       isUploadedStory: true,
//       status: "pending_review",
//     });

//     await story.save();

//     // 4️⃣ Update PendingDocument
//     await PendingDocument.findByIdAndUpdate(pendingDocId, {
//       linkedStoryId: story._id,
//       status: "pending_review",
//     });

//     // 5️⃣ Emit completion event
//     if (ioInstance) {
//       ioInstance.to(userId).emit("story:complete", {
//         storyId: story._id,
//         storyContent,
//         quickInsights,
//         tags: solutionTags,
//       });
//     }
//     ioInstance.to(userId).emit("story:status", { stage: "starting" });
//     ioInstance.to(userId).emit("story:status", { stage: "analyzing" });
//     ioInstance.to(userId).emit("story:status", { stage: "generating" });
//     ioInstance.to(userId).emit("story:status", { stage: "saving" });
    
//     console.log(`✅ Story generation complete for user ${userId}`);
//     return story._id;
//   } catch (err) {
//     console.error("💥 processUploadedPDF failed:", err);
//     if (ioInstance)
//       ioInstance.to(userId).emit("story:error", { message: err.message });
//   }
// }


    // ==========================================
    // 🧩 1. Handle multi-angle jobs
    // ==========================================
    if (job.name === "enrichStoryAngle") {
      const { storyId, index, title, synopsis, docs = [], rawText, userPrompt, language, tone, userId, pillar, theme } = job.data;
      console.log(`🧩 Enriching story angle ${index} for story ${storyId}`);
    
      try {
    //     const ragPrompt = `
    // Expand this selected story angle titled "${title}".
    // Synopsis: ${synopsis}
    
    // Use the following verified context:
    // ${rawText}
    
    // Write a full structured story in ${language} with a ${tone} tone.
    // Include the following clearly labeled sections:
    
    // **Story Title**
    // **Synopsis**
    // **Key Data Points (with inline citations)**
    // **Potential Interviews**
    // **Suggested Headlines**
    // **Recommended Tone**
    // **Sources**
    // **Research Sources**
    // **Key Insights**
    // `.trim();
    
    const ragPrompt = `
Expand this selected story angle titled "${title}".
Synopsis: ${synopsis}

Use the following verified context:
${rawText}

Write a full structured story in ${language} with a ${tone} tone.
Include the following clearly labeled sections:

**Story Title**
**Synopsis**
**Key Data Points (with inline citations)**
**Potential Interviews**
**Suggested Headlines**
**Recommended Tone**
**Sources**
**Research Sources**
**Key Insights**
Comma-separated thematic takeaways and keywords.
**SolutionTags**
Comma-separated topical or issue tags derived from the story.

Do not include assistant notes, commentary, or offers to help. 
End your response immediately after the last section.
`.trim();

        const output = await generateWithGPT5Mini(ragPrompt, "medium", "medium");
    

        console.log("🧾 [angle] output (first 600):", output.slice(0, 600));


        // Parse Story Title (optional, keep old if not found)
        const parsedTitle = output.match(/^\s*\*\*?Story Title\*\*?[:\-–]?\s*(.+)$/mi)?.[1]?.trim()
          || output.match(/Story Title[:\-–]\s*(.+)/i)?.[1]?.trim()
          || title;


          
    
        // Build sources similar to legacy path so UI links work
        const internalDocs = (docs || []).map((d) => ({
          id: d._id?.toString?.() || d.id,
          title: d.title,
          summary: d.content_summary || d.full_content?.slice(0, 400) || "",
          link: `/documents/${d._id || d.id}`,
          type: "internal",
        }));
        const scraped = await BaseScrapeUrl.find().lean();
        const externalDocs = scraped.map((s) => ({
          id: s._id.toString(),
          title: s.title || s.url,
          summary: s.description || "",
          link: s.url,
          type: "external",
        }));
        const allDocs = [...internalDocs, ...externalDocs];
        console.log("📚 [angle] sources allDocs count:", allDocs.length);
        // ✅ Extract quick insights (from the "**Key Insights**" section in the output)
        const quickInsightsList =
        (output.match(/\*\*Key Insights\*\*\s*([\s\S]*?)(?=\n\*\*|$)/i)?.[1] || "")
          .split(/\r?\n|•|-/)
          .map(s => s.trim())
          .filter(Boolean);


// ✅ Extract comma-separated tags if present (SolutionTags: ... OR Tags: ...)
const tagLineMatch = output.match(/(?:SolutionTags|Tags)[:\-–]?\s*([^\n]+)$/mi);
const solutionTags = tagLineMatch
  ? tagLineMatch[1].split(",").map(t => t.trim()).filter(Boolean)
  : [];

// ✅ Normalize to Tag ObjectIds; include pillar/theme as fallbacks if present
let normalizedTags = [];
try {
  normalizedTags = await normalizeTagsToIds(
    [...solutionTags, pillar, theme].filter(Boolean)
  );
} catch (e) {
  console.warn("⚠️ normalizeTagsToIds failed:", e?.message);
  normalizedTags = [];
}


// 🧩 Match and append relevant interview experts
const relevantExperts = getRelevantExperts(pillar, solutionTags || []);
const outputWithExperts = appendExpertsToInterviews(output, relevantExperts);
const finalOutput = outputWithExperts.trim();

console.log("🔎 [angle] parsed quickInsightsList:", quickInsightsList);
console.log("🏷️ [angle] parsed solutionTags (raw):", solutionTags);
console.log("🏷️ [angle] normalizedTags (ids):", normalizedTags);

        // Update angle content
        await Story.updateOne(
          { _id: storyId, "angles.index": index },
          {
            $set: {
              "angles.$.content": output,
              "angles.$.status": "enriched",
            },
          }
        );
    
        const angleWrite = await Story.updateOne(
          { _id: storyId, "angles.index": index },
          { $set: { "angles.$.content": output, "angles.$.status": "enriched" } }
        );
        console.log("✍️ [angle] angle update writeResult:", angleWrite);

        
        // Also update parent story so GET /generate-story/:id returns enriched content immediately
        await Story.updateOne(
          { _id: storyId },
          {
            $set: {
              title: parsedTitle || `Story about ${userPrompt || ""}`.trim(),
              content: output,
              status: "enriched",
              sources: allDocs, // ensure type/link present for UI
              language,
              tone,
        
              // ✅ New: persist parsed metadata so the card can show them
              quickInsights: quickInsightsList.join("\n"),
              tags: normalizedTags,
            },
          }
        );
        const parentWrite = await Story.updateOne(
          { _id: storyId },
          {
            $set: {
              title: parsedTitle || `Story about ${userPrompt || ""}`.trim(),
              content: output,
              status: "enriched",
              sources: allDocs,
              language,
              tone,
              quickInsights: quickInsightsList.join("\n"),
              tags: normalizedTags,
            },
          }
        );
        console.log("✍️ [angle] parent story update writeResult:", parentWrite);
        // 🛰️ Fetch Determ media insights (non-blocking, now also for angles)
const DETERMTOKEN = process.env.DETERM_ACCESS_TOKEN;
if (DETERMTOKEN) {
  try {
    const feeds = await fetchDetermFeeds(DETERMTOKEN);
    if (feeds?.mentions?.length) {
      await Story.findByIdAndUpdate(storyId, { $set: { determInsights: feeds } });
      console.log(`✅ Determ insights saved for story ${storyId} (${feeds.mentions.length} mentions)`);
    } else {
      console.log("⚠️ Determ returned no mentions for this topic.");
    }
  } catch (err) {
    console.error("💥 Failed to fetch Determ feeds:", err.message);
  }
}

        // sanity read-back to confirm fields persisted
        const verifyDoc = await Story.findById(storyId).select("quickInsights tags title status").lean();
        console.log("✅ [angle] verify saved story:", {
          title: verifyDoc?.title,
          status: verifyDoc?.status,
          quickInsightsLen: verifyDoc?.quickInsights?.length,
          tags: verifyDoc?.tags,
        });
    
        console.log(`✅ Angle ${index} enriched and saved for story ${storyId}`);
    
        if (ioInstance) {
          ioInstance.to(userId).emit("story:angleUpdated", { storyId, index });
          console.log(`📡 story:angleUpdated emitted for user ${userId}`);
        }
      } catch (err) {
        console.error(`💥 Failed to enrich angle ${index}:`, err.message);
      }
      return;
    }
    

    // ==========================================
    // 🧠 2. Handle legacy single enrichStory jobs
    // ==========================================
    if (job.name !== "enrichStory") return;

    const { storyId, userId, pillar, theme, language, tone, docs = [], rawText, userPrompt } = job.data;

    const hash = buildPayloadHash(job.data);
    const processingKey = `story:processing:${hash}`;
    const doneKey = `story:done:${hash}`;

    if (await redis.get(doneKey)) {
      console.log(`⏭️ Skipping duplicate job for ${pillar}.`);
      return { skipped: true };
    }
    const gotLock = await redis.set(processingKey, "1", "NX", "EX", 15 * 60);
    if (!gotLock) return { skipped: true, reason: "in-progress" };

    try {
      // 1️⃣ Merge internal + external docs
      const internalDocs = (docs || []).map((d) => ({
        id: d._id?.toString?.() || d.id,
        title: d.title,
        summary: d.content_summary || d.full_content?.slice(0, 400) || "",
        type: "internal",
      }));

      const scraped = await BaseScrapeUrl.find().lean();
      const externalDocs = scraped.map((s) => ({
        id: s._id.toString(),
        title: s.title || s.url,
        summary: s.description || "",
        link: s.url,
        type: "external",
      }));

      const allDocs = [...internalDocs, ...externalDocs];
      const extractedText = allDocs.map((d) => `[${d.title}] — ${d.summary}`).join("\n");

      // 2️⃣ Fact-check + cache
      let verifiedText = extractedText;
      if (docs.length) {
        const cacheKey = `fc:${pillar}:${language}:${tone}:${(docs.map((d) => d.title).join("|"))}`;
        const cached = await cacheGet(cacheKey);
        if (cached) {
          verifiedText = cached;
          console.log(`💾 Using cached fact-checked context for ${pillar}.`);
        } else {
          verifiedText = await factCheckExtractedData(extractedText);
          if (verifiedText && verifiedText.length < 50_000)
            await cacheSet(cacheKey, verifiedText, 86400);
        }
      }

// 3️⃣ Longform enrichment with language + tone (mirrors /generate-story route)
const ragPrompt = `
You are a creative story angle generator for stories in **${language}** with a **${tone}** tone.

Verified documents for context:
${verifiedText}

When citing, always use the **document title** in square brackets (e.g. [National Health Act]) 
instead of "Doc 1" or numbers.

Generate a **complete story draft** that includes the following clearly labeled sections:

**Story Title**
A compelling narrative title.

**Synopsis**
A one-paragraph summary explaining the story focus, evidence, and relevance.

**Key Data Points (with inline citations using [Document Title])**
Present important facts or evidence derived from the verified documents.

**Potential Interviews**
List the types of people or institutions to interview.

**Suggested Headlines**
Provide 3–4 headline options for publication.

**Recommended Tone**
State the tone (should align with ${tone}).

**Sources**
List the document titles used exactly as they appear above.

**Research Sources**
Include useful web or platform references such as Nigeria Health Watch or related sites.

**Key Insights**
Comma-separated thematic takeaways and keywords.


Do not include any assistant commentary, suggestions, or offers to help.
End your response immediately after the Key Insights section.

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
        console.warn("⚠️ Empty result, retrying with high effort...");
        storyOutput = await generateWithGPT5Mini(ragPrompt, "high", "high");
      }

     // 🧩 Extract quick insights + tags from the angle output (just like legacy path)
// 4️⃣ Extract metadata (if any)
const quickInsightsList =
  (storyOutput.match(/\*\*Key Insights\*\*\s*([\s\S]*?)(?=\n\*\*|$)/i)?.[1] || "")
    .split(/\r?\n|•|-/)
    .map(s => s.trim())
    .filter(Boolean);

const tagsMatch = storyOutput.match(/(?:SolutionTags|Tags)[:\-–]?\s*([^\n]+)$/mi);
const solutionTags = tagsMatch ? tagsMatch[1].split(/,\s*/).map(t => t.trim()) : [];
const normalizedTags = await normalizeTagsToIds([...solutionTags, pillar, theme].filter(Boolean));



      // 5️⃣ Upsert Story
      let storyDoc = storyId ? await Story.findById(storyId) : null;
      if (!storyDoc) {
        storyDoc = new Story({
          title: `Story about ${pillar}`,
          generatedBy: new mongoose.Types.ObjectId(userId),
        });
      }

      storyDoc.title = storyOutput.match(/Story Title[:\-–]\s*(.+)/i)?.[1]?.trim() ||
                       storyDoc.title.replace(/^Draft:\s*/, "");
      storyDoc.content = storyOutput.trim();
      storyDoc.language = language;
      storyDoc.tone = tone;
      storyDoc.quickInsights = quickInsightsList.join("\n");
      storyDoc.tags = normalizedTags;
      storyDoc.sources = docs;
      storyDoc.status = "enriched";
      storyDoc.payloadHash = hash;


      // 🛰️ Fetch Determ media insights (non-blocking)
const DETERMTOKEN = process.env.DETERM_ACCESS_TOKEN;
if (DETERMTOKEN) {
  fetchDetermFeeds(DETERMTOKEN)
    .then(async (feeds) => {
      console.log("📡 Determ feeds fetched in worker:", feeds);
      await Story.findByIdAndUpdate(storyDoc._id, { $set: { determInsights: feeds } });
      console.log("✅ Determ insights saved for story:", storyDoc._id);
    })
    .catch((err) => console.error("⚠️ Failed to fetch Determ feeds:", err.message));
}


      await storyDoc.save();
      
      console.log(`✅ Enriched story saved for user ${userId} [${storyDoc._id}]`);

      console.log("🧾 [legacy] storyOutput (first 600):", storyOutput.slice(0, 600));
console.log("🔎 [legacy] quickInsightsList:", quickInsightsList);
console.log("🏷️ [legacy] solutionTags (raw):", solutionTags);
console.log("🏷️ [legacy] normalizedTags (ids):", normalizedTags);

await storyDoc.save();
console.log("✍️ [legacy] story saved with:", {
  id: storyDoc._id.toString(),
  quickInsightsLen: storyDoc.quickInsights?.length,
  tags: storyDoc.tags,
  status: storyDoc.status,
});

// after socket emit
const verifyDoc = await Story.findById(storyDoc._id).select("quickInsights tags").lean();
console.log("✅ [legacy] verify saved story:", {
  quickInsightsLen: verifyDoc?.quickInsights?.length,
  tags: verifyDoc?.tags,
});
      // 6️⃣ Socket emit to frontend
      if (ioInstance) {
        ioInstance.to(userId).emit("story:updated", { storyId: storyDoc._id });
        console.log(`📡 story:updated emitted to ${userId}`);
      }

      await redis.set(doneKey, "1", "EX", 86400);
      return { storyId: storyDoc._id };
    } finally {
      await redis.del(processingKey);
    }
  },
  

  {
    connection: {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      username: process.env.REDIS_USER || "default",
      password: process.env.REDIS_PASSWORD,
    },
    concurrency: 3,
    lockDuration: 120_000,
    stalledInterval: 30_000,
  }


);



worker.on("completed", (job) => console.log(`🎯 Job ${job.id} completed successfully.`));
worker.on("failed", (job, err) => console.error(`💥 Job ${job?.id} failed:`, err?.message));
worker.on("error", (err) => console.error("🔌 Worker connection error:", err?.message));

module.exports = worker;
