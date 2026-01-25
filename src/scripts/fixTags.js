// scripts/fixTags.js
require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const connectDB = require("../config/db");
const mongoose = require("mongoose");
const Story = require("../models/Story");
const Tag = require("../models/Tag");
const slugify = require("slugify");

async function fixTags() {
  try {
    await connectDB();
    console.log("✅ Connected to MongoDB");

    const stories = await Story.find({});
    for (const story of stories) {
      let updated = false;
      const fixedTags = [];

      // Ensure tags is always iterable
      const tags = Array.isArray(story.tags) ? story.tags : (story.tags ? [story.tags] : []);

      for (const t of tags) {
        if (!t) continue;

        // Case 1: Already a valid ObjectId
        if (mongoose.Types.ObjectId.isValid(t)) {
          fixedTags.push(new mongoose.Types.ObjectId(t));
          continue;
        }

        // Case 2: Object with _id
        if (typeof t === "object" && t._id && mongoose.Types.ObjectId.isValid(t._id)) {
          fixedTags.push(new mongoose.Types.ObjectId(t._id));
          continue;
        }

        // Case 3: String name → lookup/create Tag
        if (typeof t === "string") {
          const slug = slugify(t.toLowerCase());
          let tag = await Tag.findOne({ slug });
          if (!tag) {
            tag = new Tag({ name: t, slug, usageCount: 1 });
            await tag.save();
            console.log(`🌱 Created new tag: ${t}`);
          }
          fixedTags.push(tag._id);
          updated = true;
          continue;
        }
      }

      if (updated) {
        // Deduplicate + cast to ObjectIds
        story.tags = [...new Set(fixedTags.map(String))].map(
          id => new mongoose.Types.ObjectId(id)
        );
        await story.save();
        console.log(`🔧 Fixed story ${story._id} → tags: ${story.tags.length}`);
      }
    }

    console.log("🎉 Tag migration complete.");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration error:", err);
    process.exit(1);
  }
}

fixTags();
