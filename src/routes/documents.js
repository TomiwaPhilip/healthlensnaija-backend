const express = require("express");
const router = express.Router();
const verifyToken = require("../middlewares/verifyToken");
const ExtractedDocument = require("../models/ExtractedDocument");
const openai = require("../config/openai");

// Helper: get related summaries
async function summarizeDocumentForStory(fullText, storyAngleTitle = "") {
  const prompt = `
Summarize the following document briefly (max 150 words)
in relation to the story angle titled "${storyAngleTitle}".

Focus on insights, data, or context that support or connect to that theme.
Avoid repeating the full document text; highlight only what's relevant.

---- Document Text ----
${fullText.slice(0, 4000)}  # limit for safety

---- Focused Summary ----
  `.trim();

  try {
    const resp = await openai.responses.create({
      model: "gpt-5-mini",
      input: prompt,
      reasoning: { effort: "medium" },
      text: { verbosity: "medium" },
    });
    return resp.output_text?.trim() || "(No summary generated)";
  } catch (err) {
    console.error("❌ Summarization failed:", err.message);
    return "(Summary unavailable)";
  }
}

// GET single internal document
router.get("/:id", verifyToken, async (req, res) => {
  const { storyTitle = "" } = req.query; // optional query param
  try {
    const doc = await ExtractedDocument.findById(req.params.id)
      .select("title content_summary full_content pillar keywords source");
    if (!doc) return res.status(404).json({ message: "Document not found" });

    const summary = await summarizeDocumentForStory(
      doc.full_content || doc.content_summary || "",
      storyTitle
    );

    // 🔍 find similar titles (basic text search)
    const related = await ExtractedDocument.find({
      _id: { $ne: doc._id },
      title: new RegExp(doc.title.split(" ")[0], "i"),
    })
      .select("title _id")
      .limit(3)
      .lean();

    res.json({
      id: doc._id,
      title: doc.title,
      summary,
      related,
      source: doc.source,
    });
  } catch (err) {
    console.error("❌ Error fetching document:", err.message);
    res.status(500).json({ message: "Failed to fetch document" });
  }
});

module.exports = router;
