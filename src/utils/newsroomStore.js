const crypto = require("crypto");

const store = {
  stories: [],
  messages: [],
  artifacts: [],
  sources: [],
};

function generateId(prefix = "id") {
  if (typeof crypto.randomUUID === "function") {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now()}_${random}`;
}

module.exports = {
  store,
  generateId,
};
