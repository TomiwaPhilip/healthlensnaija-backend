// services/statsService.js
const BaseUser = require("../models/BaseUser");
const Story = require("../models/Story");
const cache = require("../utils/cache");

const getDashboardStats = async () => {
  const cacheKey = "dashboardStats";
  const cached = await cache.get(cacheKey);
  if (cached) {
    return JSON.parse(cached);
  }

  const totalUsers = await BaseUser.countDocuments();
  const activeUsers = await BaseUser.countDocuments({
    lastLogin: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
  });
  const totalStories = await Story.countDocuments();
  const stories = await Story.find({}, { likes: 1 });
  const totalLikes = stories.reduce((sum, story) => sum + (story.likes || 0), 0);
  const avgEngagement = totalStories > 0 ? (totalLikes / totalStories).toFixed(2) : 0;

  const stats = { totalUsers, activeUsers, totalStories, avgEngagement };

  // Cache the stats for 5 minutes (300 seconds)
  await cache.setEx(cacheKey, 300, JSON.stringify(stats));
  return stats;
};

module.exports = { getDashboardStats };
