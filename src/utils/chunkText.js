const { encode } = require('gpt-3-encoder');  // You may need to install: npm install gpt-3-encoder

// Max token length per chunk (safe for embeddings)
const MAX_TOKENS = 800;

// Helper function: count tokens for a given text
function countTokens(text) {
  return encode(text).length;
}

// Clean splitting into sentences & paragraphs
function chunkText(text, maxTokens = MAX_TOKENS) {
  const sentences = text.split(/(?<=[.?!])\s+/); // split at sentence boundaries
  const chunks = [];
  let currentChunk = '';

  for (const sentence of sentences) {
    const sentenceTokens = countTokens(sentence);
    const currentTokens = countTokens(currentChunk);

    if (currentTokens + sentenceTokens <= maxTokens) {
      currentChunk += sentence + ' ';
    } else {
      if (currentChunk) {
        chunks.push(currentChunk.trim());
      }
      if (sentenceTokens > maxTokens) {
        // Sentence too long, split hard
        const words = sentence.split(' ');
        let subChunk = '';

        for (const word of words) {
          if (countTokens(subChunk + ' ' + word) <= maxTokens) {
            subChunk += ' ' + word;
          } else {
            chunks.push(subChunk.trim());
            subChunk = word;
          }
        }
        if (subChunk) chunks.push(subChunk.trim());
      } else {
        currentChunk = sentence + ' ';
      }
    }
  }

  if (currentChunk) {
    chunks.push(currentChunk.trim());
  }

  return chunks;
}

module.exports = { chunkText, countTokens };
