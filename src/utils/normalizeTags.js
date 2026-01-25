// utils/normalizeTags.js
const mongoose = require("mongoose");
const slugify = require("slugify");
const Tag = require("../models/Tag");

async function normalizeTagsToIds(input) {
  if (!input) return [];

  // Always normalize to an array
  const tags = Array.isArray(input) ? input : [input];
  const results = [];

  for (const t of tags) {
    if (!t) continue;

    // If already a valid ObjectId string
    if (typeof t === "string" && /^[0-9a-fA-F]{24}$/.test(t)) {
      results.push(new mongoose.Types.ObjectId(t));
      continue;
    }

    // If object with _id
    if (typeof t === "object" && t._id && /^[0-9a-fA-F]{24}$/.test(t._id)) {
      results.push(new mongoose.Types.ObjectId(t._id));
      continue;
    }

    // Otherwise treat as a name
    const name = typeof t === "string" ? t : (t.name || "");
    if (!name) continue;

    const slug = slugify(name.toLowerCase());
    let tag = await Tag.findOne({ slug });
    if (!tag) {
      tag = new Tag({ name, slug, usageCount: 1 });
    } else {
      tag.usageCount += 1;
    }
    await tag.save();

    results.push(tag._id); // Already an ObjectId
  }

  // Remove duplicates
  return [...new Set(results.map(String))].map(id => new mongoose.Types.ObjectId(id));
}

module.exports = { normalizeTagsToIds };
