const { store, generateId } = require("../utils/newsroomStore");

function normalizeTags(rawTags) {
  if (!Array.isArray(rawTags)) {
    return [];
  }
  return rawTags.filter(Boolean);
}

function listStories(searchTerm = "") {
  const query = searchTerm.trim().toLowerCase();
  const stories = query
    ? store.stories.filter((story) => {
        const matchesTitle = story.title.toLowerCase().includes(query);
        const matchesTags = story.metadata.tags.some((tag) =>
          tag.toLowerCase().includes(query)
        );
        return matchesTitle || matchesTags;
      })
    : store.stories;

  return stories.slice().sort((a, b) => {
    return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
  });
}

function createStory(payload = {}) {
  if (!payload.title || !payload.title.trim()) {
    throw new Error("Title is required to start a story workspace");
  }

  const now = new Date().toISOString();
  const story = {
    id: generateId("story"),
    title: payload.title.trim(),
    status: payload.status || "draft",
    preview_text: payload.preview_text || "",
    metadata: {
      tags: normalizeTags(payload?.metadata?.tags),
      region: payload?.metadata?.region || "",
    },
    created_at: now,
    updated_at: now,
  };

  store.stories.push(story);
  return story;
}

function getStoryById(storyId) {
  return store.stories.find((story) => story.id === storyId);
}

function deleteStory(storyId) {
  const index = store.stories.findIndex((story) => story.id === storyId);
  if (index === -1) {
    return null;
  }

  store.stories.splice(index, 1);
  store.messages = store.messages.filter((msg) => msg.story_id !== storyId);
  store.artifacts = store.artifacts.filter((artifact) => artifact.story_id !== storyId);
  store.sources = store.sources.filter((source) => source.story_id !== storyId);
  return true;
}

function refreshStoryPreview(storyId) {
  const story = getStoryById(storyId);
  if (!story) return;

  const newestArtifact = store.artifacts
    .filter((artifact) => artifact.story_id === storyId)
    .sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at))[0];

  const newestMessage = store.messages
    .filter((msg) => msg.story_id === storyId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))[0];

  const previewSource = newestArtifact?.content || newestMessage?.content || "";
  story.preview_text = previewSource.slice(0, 280);
  story.updated_at = new Date().toISOString();
}

module.exports = {
  listStories,
  createStory,
  getStoryById,
  deleteStory,
  refreshStoryPreview,
};
