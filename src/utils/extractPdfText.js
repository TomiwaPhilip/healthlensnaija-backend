//backend/src/utils/extractPdfText
const axios = require('axios');
const pdf = require('pdf-parse');

async function extractPdfText(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    const data = await pdf(response.data);
    return data.text;
  } catch (err) {
    console.error(`Error parsing PDF ${url}`, err.message);
    return '';
  }
}

module.exports = extractPdfText;
