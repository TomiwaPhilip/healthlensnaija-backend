// src/models/Story.js
const mongoose = require("mongoose");

// ---------- Angle Schema ----------
const angleSchema = new mongoose.Schema({
  index: Number,
  title: String,
  synopsis: String,
  keyPoints: [String],
  content: String,
  status: { type: String, default: "enriching" }
}, { _id: false });

// ---------- Source Schema ----------
const sourceSchema = new mongoose.Schema({
  id: { type: String },
  title: { type: String },
  summary: { type: String },
  link: { type: String },
  type: { type: String }
}, { _id: false });

// ---------- CTR (user interactions) ----------
const ctrSchema = new mongoose.Schema({
  views: { type: Number, default: 0 },
  opens: { type: Number, default: 0 },
  clicks: { type: Number, default: 0 },
  copies: { type: Number, default: 0 },
  exports: { type: Number, default: 0 },
  lastInteractionAt: { type: Date, default: null }
}, { _id: false });

// ---------- Main Story Schema ----------
const storySchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  quickInsights: { type: String },  // Short bullet summary
  solutionFocused: { type: Boolean, default: false },
  tags: [{ type: mongoose.Schema.Types.ObjectId, ref: "Tag" }],
  linkedChatId: { type: mongoose.Schema.Types.ObjectId, ref: "Chat", default: null },
  generatedBy: { type: mongoose.Schema.Types.ObjectId, ref: "BaseUser", required: true },
  angles: [angleSchema],
  selectedIndex: { type: Number, default: null },
  versions: [{
    content: String,
    updatedAt: { type: Date, default: Date.now }
  }],
  sources: [sourceSchema],
userPrompt: { type: String },

  // ✅ NEW: Embedding vector for Pinecone or Atlas Search
  embedding: {
    type: [Number],
    default: undefined,
    select: false // hide by default in queries
  },

  // ✅ NEW: CTR signals for personalized ranking
  ctr: { type: ctrSchema, default: () => ({}) },

  // ✅ NEW: Flag for user-uploaded stories
  isUploadedStory: { type: Boolean, default: false },

    // ✅ NEW: Determ media mentions insights
    determInsights: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
}, { timestamps: true });


// ---------- Hooks (optional) ----------
storySchema.post("save", async function () {
  // Example: trigger async embedding upsert when content changes
  try {
    if (this.isModified("content") || this.isNew) {
      const { upsertStoryVector } = require("../utils/embeddings/upsertStoryVector");
      await upsertStoryVector(this);
    }
  } catch (err) {
    console.warn("⚠️ Embedding upsert failed:", err.message);
  }
});

storySchema.post("remove", async function () {
  try {
    const { removeStoryVector } = require("../utils/embeddings/upsertStoryVector");
    await removeStoryVector(this._id.toString());
  } catch (err) {
    console.warn("⚠️ Vector removal failed:", err.message);
  }
});

module.exports = mongoose.model("Story", storySchema);
