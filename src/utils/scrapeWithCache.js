//backend/src/utils/scrapeWithcache
const puppeteer = require('puppeteer');
const redis = require('./redis');
const extractPdfText = require('./extractPdfText');
const axios = require('axios');
const cheerio = require('cheerio');

const CACHE_EXPIRY = 60 * 60 * 24; // 24 hours

async function scrapeAndCache(url) {
  const cached = await redis.get(url);
  if (cached) {
    console.log('✅ Cache hit for', url);
    return cached;
  }

  console.log('🌐 Scraping', url);
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle2', timeout: 0 });

  const content = await page.content();
  const $ = cheerio.load(content);
  
  let text = '';
  $('p, h1, h2, h3, li').each((_, el) => {
    text += $(el).text() + '\n';
  });

  const pdfLinks = [];
  $('a').each((_, el) => {
    const href = $(el).attr('href');
    if (href && href.endsWith('.pdf')) {
      if (href.startsWith('http')) pdfLinks.push(href);
      else pdfLinks.push(new URL(href, url).href);
    }
  });

  for (let pdfUrl of pdfLinks) {
    const pdfText = await extractPdfText(pdfUrl);
    text += '\n' + pdfText;
  }

  await browser.close();

  await redis.set(url, text, 'EX', CACHE_EXPIRY);
  return text;
}

module.exports = scrapeAndCache;
