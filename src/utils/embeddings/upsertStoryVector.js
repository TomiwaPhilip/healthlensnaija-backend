// src/utils/embeddings/upsertStoryVector.js
const openai = require("../../config/openai");
const { getIndex } = require("../pineconeIndex");
const Story = require("../../models/Story");

async function generateEmbedding(text) {
  const trimmed = text.slice(0, 6000);
  const resp = await openai.embeddings.create({
    model: "text-embedding-3-large",
    input: trimmed
  });
  return resp.data?.[0]?.embedding || resp.data?.[0]?.embedding || resp.data?.[0];
}

async function upsertStoryVector(story) {
  try {
    if (!story?.content || !story._id) return;

    const index = await getIndex(process.env.PINECONE_INDEX_NAME || "stories");
    const vector = story.embedding?.length ? story.embedding : await generateEmbedding(story.content);

    await index.upsert([
      {
        id: story._id.toString(),
        values: vector,
        metadata: {
          userId: story.generatedBy.toString(),
          title: story.title,
          tags: (story.tags || []).map(t => t.toString()),
          createdAt: new Date(story.createdAt || Date.now()).toISOString()
        }
      }
    ]);

    // Optionally store locally in Mongo for hybrid TF-IDF + vector search
    if (!story.embedding?.length) {
      story.embedding = vector;
      await Story.updateOne({ _id: story._id }, { embedding: vector });
    }

    console.log(`✅ Pinecone vector upserted for story ${story._id}`);
  } catch (err) {
    console.error("❌ upsertStoryVector failed:", err.message);
  }
}

async function removeStoryVector(storyId) {
  try {
    const index = await getIndex(process.env.PINECONE_INDEX_NAME || "stories");
    await index.deleteOne(storyId);
    console.log(`🧹 Removed vector for story ${storyId}`);
  } catch (err) {
    console.error("❌ removeStoryVector failed:", err.message);
  }
}

module.exports = { upsertStoryVector, removeStoryVector };
