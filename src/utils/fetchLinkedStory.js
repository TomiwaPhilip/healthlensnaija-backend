const Story = require("../models/Story");
const redis = require("./redis");

async function fetchLinkedStory(linkedStoryId) {
  if (!linkedStoryId) return "";

  const cacheKey = `linkedStory:${linkedStoryId}`;

  const cached = await redis.get(cacheKey);
  if (cached) {
    console.log("✅ Cache hit for linked story");
    return cached;
  }

  const story = await Story.findById(linkedStoryId);
  if (!story) return "";

  const storyData = `Story Title: ${story.title}\n\nStory Content:\n${story.content}`;
  await redis.set(cacheKey, storyData, 'EX', 60 * 60 * 24);

  return storyData;
}

module.exports = fetchLinkedStory;
