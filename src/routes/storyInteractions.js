// src/routes/storyInteractions.js
const express = require("express");
const router = express.Router();
const Story = require("../models/Story");
const verifyToken = require("../middlewares/verifyToken");

// Utility: small helper for time decay
function timeDecay(prevDate) {
  if (!prevDate) return 1;
  const HALF_LIFE_DAYS = 14;
  const days = (Date.now() - new Date(prevDate).getTime()) / 86400000;
  return Math.pow(0.5, days / HALF_LIFE_DAYS);
}

/**
 * POST /api/stories/:id/interaction
 * Body: { type: "open" | "click" | "copy" | "export" }
 * Tracks and decays engagement per user-story combo.
 */
router.post("/:id/interaction", verifyToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { type } = req.body;
    const userId = req.user?.id;

    if (!["open", "click", "copy", "export"].includes(type)) {
      return res.status(400).json({ message: "Invalid interaction type." });
    }

    const story = await Story.findById(id);
    if (!story) {
      return res.status(404).json({ message: "Story not found." });
    }

    // ensure ctr exists
    if (!story.ctr) story.ctr = {};

    // apply decay to previous scores
    const decay = timeDecay(story.ctr.lastInteractionAt);
    Object.keys(story.ctr).forEach(key => {
      if (typeof story.ctr[key] === "number") {
        story.ctr[key] = Math.floor(story.ctr[key] * decay);
      }
    });

    // increment the relevant field
    const fieldMap = {
      open: "opens",
      click: "clicks",
      copy: "copies",
      export: "exports"
    };
    const field = fieldMap[type];
    story.ctr[field] = (story.ctr[field] || 0) + 1;
    story.ctr.lastInteractionAt = new Date();

    await story.save();

    // optional: refresh hybrid rec cache for this story
    const { invalidateCache } = require("../utils/cache/invalidate");
    invalidateCache(`recommendations:v2:${userId}:${id}`);

    res.json({ success: true, updatedCTR: story.ctr });
  } catch (err) {
    console.error("❌ Interaction tracking failed:", err.message);
    res.status(500).json({ message: "Failed to record interaction", error: err.message });
  }
});

module.exports = router;
