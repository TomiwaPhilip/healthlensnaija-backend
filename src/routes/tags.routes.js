const express = require("express");
const Tag = require("../models/Tag");
const router = express.Router();

// GET /api/tags?query=UHC
router.get("/", async (req, res) => {
  const query = req.query.query?.toLowerCase() || "";
  const tags = await Tag.find({
    $or: [
      { name: new RegExp(query, "i") },
      { synonyms: new RegExp(query, "i") },
    ],
  })
    .sort({ usageCount: -1 })
    .limit(20);
  res.json(tags);
});

module.exports = router;
