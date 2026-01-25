const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/verifyToken");
const pdf = require("pdf-parse");
const openai = require("../config/openai");
const Story = require("../models/Story");
const ExtractedDocument = require("../models/ExtractedDocument");
const Tag = require("../models/Tag");
const slugify = require("slugify");
const BaseScrapeUrl = require("../models/BaseScrapeUrl");
const PendingDocument = require("../models/PendingDocument"); // ← new collection
const { storyQueue } = require("../queues/storyQueue");

// --- Helpers ---

// Extract quick insights + tags from generated story text
async function analyzeStoryMetadata(storyContent) {
  const prompt = `
From the following story content, extract two things in JSON:
- quickInsights: a concise list of 3-5 bullet points summarizing the main insights
- solutionTags: 3-5 thematic tags (like "governance", "financing", "health systems") for categorization

Return EXACT JSON only.

Story:
${storyContent.substring(0, 2000)}
`;

  const resp = await openai.responses.create({
    model: "gpt-5-mini",
    input: prompt,
    reasoning: { effort: "minimal" },
    text: { verbosity: "low" },
  });

  const raw = resp.output_text?.trim() || "";
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return { quickInsights: [], solutionTags: [] };

  try {
    const parsed = JSON.parse(raw.slice(start, end + 1));
    return {
      quickInsights: parsed.quickInsights || [],
      solutionTags: parsed.solutionTags || [],
    };
  } catch {
    return { quickInsights: [], solutionTags: [] };
  }
}


// Analyze PDF content into structured JSON
async function analyzeContent(text) {
  const prompt = `
Analyze this PDF content and produce EXACT JSON with keys: angle, pillars, keywords, dataPoints, interviews.

Content:
${text.substring(0, 3000)}
`;
  const resp = await openai.responses.create({
    model: "gpt-5-mini",
    input: prompt,
    reasoning: { effort: "minimal" },
    text: { verbosity: "low" }
  });
  const raw = resp.output_text?.trim() || "";
  const start = raw.indexOf("{"), end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("Invalid JSON from LLM");
  const parsed = JSON.parse(raw.slice(start, end + 1));
  return parsed;
}

// Call GPT-5-mini with flexible effort/verbosity
async function generateWithGPT5Mini(inputText, effort = "medium", verbosity = "medium") {
  const resp = await openai.responses.create({
    model: "gpt-5-mini",
    input: inputText,
    reasoning: { effort },
    text: { verbosity }
  });
  return resp.output_text?.trim() || "";
}

// --- Upload PDF route ---

// --- Upload PDF route (Async Streaming Version) ---
// router.post("/process-pdf", verifyToken, async (req, res) => {
//   try {
//     if (!req.files?.pdf) {
//       return res.status(400).json({ message: "No PDF uploaded" });
//     }

//     const pdfFile = req.files.pdf;
//     const { text } = await pdf(pdfFile.data);
//     if (!text?.trim()) throw new Error("Empty PDF text");

//     // 1️⃣ Analyze uploaded PDF content (fast)
//     const analysis = await analyzeContent(text);

//     // 2️⃣ Fetch similar extracted docs for context (for RAG)
//     const extractedDocs = await ExtractedDocument.find({
//       keywords: { $in: analysis.keywords || [] },
//     }).select("title content_summary metadata").lean();

//     const internalDocs = extractedDocs.map((d) => ({
//       id: d._id.toString(),
//       title: d.title,
//       summary: d.content_summary || "",
//       link: `/documents/${d._id}`,
//       type: "internal",
//     }));

//     const scrapedUrls = await BaseScrapeUrl.find().lean();
//     const externalDocs = scrapedUrls.map((s) => ({
//       id: s._id.toString(),
//       title: s.title || s.url,
//       summary: s.description || "",
//       link: s.url,
//       type: "external",
//     }));

//     const allDocs = [...internalDocs, ...externalDocs];
//     const extractedText = allDocs.map((d) => `[${d.title}] — ${d.summary}`).join("\n");

//     // 3️⃣ Construct the exact same RAG prompt
//     const ragPrompt = `
// You are a creative story angle generator for stories in **English** with a **neutral** tone.

// Verified internal documents for context:
// ${extractedText}

// Uploaded PDF content (for reference):
// ${text.substring(0, 2000)}

// When citing, always use the **document title** in square brackets (e.g. [National Health Act])
// instead of "Doc 1" or numbers.

// Generate a **story angle** that includes:
// - **Story Title**
// - **Synopsis**
// - **Key Data Points (with inline citations using [Document Title])**
// - **Potential Interviews**
// - **Suggested Headlines**
// - **Recommended Tone**
// - **Sources** (list the document titles used, match them exactly)

// Context:
// - Pillar: "${analysis.pillars?.[0] || "Unknown"}"
// - Theme: "${analysis.angle || "General"}"
// - User Prompt: "Generated from uploaded PDF"
// `.trim();

//     // 4️⃣ Create PendingDocument for admin tracking
//     const pendingDoc = new PendingDocument({
//       title: pdfFile.name,
//       source: "User Upload",
//       pillar: analysis.pillars || [],
//       keywords: analysis.keywords || [],
//       content_summary: analysis.angle,
//       full_content: text,
//       metadata: {
//         uploaded_by: req.user.id,
//         file_type: "PDF",
//         size: `${Math.round(pdfFile.size / 1024)} KB`,
//       },
//       status: "processing",
//     });

//     await pendingDoc.save();

//     // 5️⃣ Queue async streaming job handled by worker
//     const job = await storyQueue.add("processUploadedPDF", {
//       userId: req.user.id,
//       pendingDocId: pendingDoc._id.toString(),
//       ragPrompt,
//       allDocs,
//       analysis,
//     });

//     // 6️⃣ Respond immediately
//     return res.status(202).json({
//       message: "PDF queued for story generation",
//       jobId: job.id,
//       pendingDocId: pendingDoc._id,
//       status: "processing",
//     });
//   } catch (err) {
//     console.error("Upload error:", err);
//     return res.status(500).json({
//       message: "Failed to process PDF",
//       error: err.message,
//     });
//   }
// });



router.post("/process-pdf", verifyToken, async (req, res) => {
  console.log("🟢 Incoming PDF upload:", {
    hasFile: !!req.files?.pdf,
    fileName: req.files?.pdf?.name,
    size: req.files?.pdf?.size,
  });
  try {
    if (!req.files?.pdf) {
      return res.status(400).json({ message: "No PDF uploaded" });
    }

    const pdfFile = req.files.pdf;
    const { text } = await pdf(pdfFile.data);
    if (!text?.trim()) throw new Error("Empty PDF text");

    // 1️⃣ Analyze uploaded PDF content
    const analysis = await analyzeContent(text);

    // 2️⃣ Fetch similar extracted docs for RAG context (from trusted DB only)
    const extractedDocs = await ExtractedDocument.find({
      keywords: { $in: analysis.keywords || [] },
    })
      .select("title content_summary metadata")
      .lean();

    const docMap = extractedDocs.map((d) => ({
      id: d._id.toString(),
      title: d.title,
      summary: d.content_summary || "",
      link: `/documents/${d._id}`,
      type: "internal",
    }));

    // 3️⃣ Include external scraped URLs for broader context
    const scrapedUrls = await BaseScrapeUrl.find().lean();
    const externalDocs = scrapedUrls.map((s) => ({
      id: s._id.toString(),
      title: s.title || s.url,
      summary: s.description || "",
      link: s.url,
      type: "external",
    }));

    const allDocs = [...docMap, ...externalDocs];
    const extractedText = allDocs
      .map((d) => `[${d.title}] — ${d.summary}`)
      .join("\n");

    // 4️⃣ Construct RAG prompt
    const ragPrompt = `
You are a creative story angle generator for stories in **English** with a **neutral** tone.

Verified internal documents for context:
${extractedText}

Uploaded PDF content (for reference):
${text.substring(0, 2000)}

When citing, always use the **document title** in square brackets (e.g. [National Health Act]) 
instead of "Doc 1" or numbers.

Generate a **story angle** that includes:
- **Story Title**
- **Synopsis**
- **Key Data Points (with inline citations using [Document Title])**
- **Potential Interviews**
- **Suggested Headlines**
- **Recommended Tone**
- **Sources** (list the document titles used, match them exactly)

Context:
- Pillar: "${analysis.pillars?.[0] || "Unknown"}"
- Theme: "${analysis.angle || "General"}"
- User Prompt: "Generated from uploaded PDF"
`.trim();

    // 5️⃣ Generate story with GPT-5-mini (retry if needed)
    let storyContent = await generateWithGPT5Mini(ragPrompt, "medium", "medium");
    if (!storyContent) {
      storyContent = await generateWithGPT5Mini(ragPrompt, "high", "high");
    }

    // 6️⃣ Extract metadata (quick insights + solution tags)
    const { quickInsights, solutionTags } = await analyzeStoryMetadata(storyContent);

    // Convert solutionTags → ObjectIds
    const solutionTagIDs = await Promise.all(
      (solutionTags || []).map(async (tagName) => {
        const slug = slugify(tagName.toLowerCase());
        let tag = await Tag.findOne({ slug });
        if (!tag) {
          tag = new Tag({ name: tagName, slug, usageCount: 1 });
        } else {
          tag.usageCount += 1;
        }
        await tag.save();
        return tag._id;
      })
    );

    // 7️⃣ Create story (but do NOT store user file into main ExtractedDocument)
    const newStory = new Story({
      title: analysis.angle?.substring(0, 60) || "Generated Story",
      content: storyContent,
      generatedBy: req.user.id,
      tags: solutionTagIDs,
      quickInsights: (quickInsights || []).join("\n"),
      sources: allDocs,
      isUploadedStory: true,
    });

    // 8️⃣ Save uploaded file into PendingDocument for admin review
    const pendingDoc = new PendingDocument({
      title: pdfFile.name,
      source: "User Upload",
      pillar: analysis.pillars || [],
      keywords: analysis.keywords || [],
      content_summary: analysis.angle,
      full_content: text,
      linkedStoryId: newStory._id, // optional link for traceability
      metadata: {
        uploaded_by: req.user.id,
        file_type: "PDF",
        size: `${Math.round(pdfFile.size / 1024)} KB`,
      },
      status: "pending", // admin can later approve or reject
    });

    await Promise.all([newStory.save(), pendingDoc.save()]);

    // 9️⃣ Respond to client
    return res.status(200).json({
      message: "PDF processed successfully",
      analysis,
      story: storyContent,
      storyId: newStory._id,
      savedDocumentId: pendingDoc._id,
      documentStatus: "pending_admin_review",
      sources: allDocs,
      quickInsights,
      tags: solutionTags,
    });
  } catch (err) {
    console.error("❌ [process-pdf] Fatal error:", err);
  return res.status(500).json({
    message: "Failed to process PDF",
    error: err.message,
    stack: err.stack,
  });
  }
});




router.get("/documents", verifyToken, async (req, res) => {
  try {
    // Fetch both PendingDocument (user uploads awaiting admin) and ExtractedDocument (approved ones)
    const [pendingDocs, extractedDocs] = await Promise.all([
      PendingDocument.find({ "metadata.uploaded_by": req.user.id })
        .select("title pillar keywords content_summary linkedStoryId metadata status")
        .sort({ "metadata.upload_date": -1 })
        .lean(),
      ExtractedDocument.find({ "metadata.uploaded_by": req.user.id })
        .select("title pillar keywords content_summary linkedStoryId metadata")
        .sort({ "metadata.upload_date": -1 })
        .lean(),
    ]);

    // Merge both sets
    const docs = [...pendingDocs, ...extractedDocs];

    // Preload stories for any with linkedStoryId
    const storyIds = docs
      .map((d) => d.linkedStoryId)
      .filter((id) => id != null);

    let storyMap = {};
    if (storyIds.length > 0) {
      const stories = await Story.find({ _id: { $in: storyIds } })
        .select("content quickInsights")
        .lean();

      storyMap = stories.reduce((acc, s) => {
        acc[s._id.toString()] = {
          preview: s.content?.substring(0, 400) || "",
          quickInsights: s.quickInsights || "",
        };
        return acc;
      }, {});
    }

    // Merge story preview into document list
    const enrichedDocs = docs.map((doc) => ({
      ...doc,
      storyPreview: doc.linkedStoryId
        ? storyMap[doc.linkedStoryId?.toString()] || null
        : null,
    }));

    return res.status(200).json({ documents: enrichedDocs });
  } catch (err) {
    console.error("❌ Error fetching user documents:", err);
    return res.status(500).json({
      message: "Failed to fetch uploaded documents",
      error: err.message,
    });
  }
});



router.get("/documents/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 1️⃣ Try to find the document in both PendingDocument and ExtractedDocument
    let doc =
      (await PendingDocument.findOne({
        _id: id,
        "metadata.uploaded_by": userId,
      })
        .lean()
        .exec()) ||
      (await ExtractedDocument.findOne({
        _id: id,
        "metadata.uploaded_by": userId,
      })
        .lean()
        .exec());

    if (!doc) {
      return res.status(404).json({ message: "Document not found or unauthorized" });
    }

    // 2️⃣ Try to fetch the full linked story if available
    let story = null;
    if (doc.linkedStoryId) {
      const storyDoc = await Story.findById(doc.linkedStoryId)
        .populate("tags")
        .lean();

      if (storyDoc) {
        story = {
          id: storyDoc._id,
          title: storyDoc.title || "Generated Story",
          content: storyDoc.content || "",
          quickInsights: storyDoc.quickInsights || "",
          sources: storyDoc.sources || [],
          tags: storyDoc.tags || [],
        };
      }
    }

    // 3️⃣ Fallback: if no story found but doc has a summary or full_content
    if (!story) {
      story = {
        id: null,
        title: doc.title,
        content:
          doc.content_summary ||
          doc.full_content?.substring(0, 1500) ||
          "No generated story available yet.",
        quickInsights: "",
        sources: [],
        tags: [],
      };
    }

    // 4️⃣ Return combined payload
    return res.status(200).json({
      document: {
        ...doc,
        type: doc.status ? "pending" : "approved", // ✅ helpful for UI
      },
      story,
    });
  } catch (err) {
    console.error("❌ Error fetching document with story:", err);
    return res.status(500).json({
      message: "Failed to fetch document and story details",
      error: err.message,
    });
  }
});



router.delete("/documents/:id", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // 1️⃣ Try to find document in both PendingDocument and ExtractedDocument
    let doc =
      (await PendingDocument.findOne({
        _id: id,
        "metadata.uploaded_by": userId,
      })) ||
      (await ExtractedDocument.findOne({
        _id: id,
        "metadata.uploaded_by": userId,
      }));

    if (!doc) {
      return res
        .status(404)
        .json({ message: "Document not found or unauthorized" });
    }

    // 2️⃣ Delete linked story if it exists and belongs to user
    let deletedStoryId = null;
    if (doc.linkedStoryId) {
      const story = await Story.findOne({
        _id: doc.linkedStoryId,
        generatedBy: userId,
      });

      if (story) {
        await Story.deleteOne({ _id: story._id });
        deletedStoryId = story._id;
        console.log(`🗑️ Deleted linked story: ${story._id}`);
      } else {
        console.warn(
          `⚠️ Linked story ${doc.linkedStoryId} not found or not owned by user ${userId}`
        );
      }
    }

    // 3️⃣ Delete from the appropriate collection
    if (doc.status) {
      // If it has a "status" field, it’s from PendingDocument
      await PendingDocument.deleteOne({ _id: id });
      console.log(`🗑️ Deleted pending document: ${id}`);
    } else {
      await ExtractedDocument.deleteOne({ _id: id });
      console.log(`🗑️ Deleted extracted document: ${id}`);
    }

    // 4️⃣ Return consistent payload
    return res.json({
      success: true,
      message: "Document and linked story deleted successfully",
      deletedDocumentId: id,
      deletedStoryId: deletedStoryId,
      collection: doc.status ? "PendingDocument" : "ExtractedDocument",
    });
  } catch (err) {
    console.error("❌ Delete error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to delete document",
      error: err.message,
    });
  }
});



module.exports = router;
