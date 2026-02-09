const { Pinecone } = require("@pinecone-database/pinecone");

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required for Pinecone integration`);
  }
  return value;
}

let pineconeInstance;
let baseIndex;

function getPineconeClient() {
  if (!pineconeInstance) {
    const apiKey = requireEnv("PINECONE_API_KEY");
    pineconeInstance = new Pinecone({ apiKey });
  }
  return pineconeInstance;
}

function getBaseIndex() {
  if (!baseIndex) {
    const client = getPineconeClient();
    const host = process.env.PINECONE_INDEX_HOST;
    const name = process.env.PINECONE_INDEX_NAME;

    if (host && name) {
      baseIndex = client.index(name, host);
    } else if (host) {
      // Use a placeholder name when only host is provided
      baseIndex = client.index("default", host);
    } else if (name) {
      baseIndex = client.index(name);
    } else {
      throw new Error("Set PINECONE_INDEX_HOST or PINECONE_INDEX_NAME to target your index");
    }
  }

  return baseIndex;
}

function buildStoryNamespace(storyId) {
  if (!storyId) {
    throw new Error("storyId is required to derive a namespace");
  }
  return `story-${storyId}`;
}

function getNamespaceIndex(namespace) {
  if (!namespace) {
    throw new Error("Namespace is required");
  }
  return getBaseIndex().namespace(namespace);
}

module.exports = {
  getPineconeClient,
  getBaseIndex,
  getNamespaceIndex,
  buildStoryNamespace,
};
