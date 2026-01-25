// cron/alertsCron.js
const Parser = require("rss-parser");
const Notification = require("../models/Notification");

const parser = new Parser();

const WHO_FEEDS = [
  {
    url: "https://www.who.int/feeds/entity/csr/don/en/rss.xml",
    source: "WHO Global – Disease Outbreak News"
  },
  {
    url: "https://www.afro.who.int/rss/outbreaks",
    source: "WHO AFRO – Emergencies & Outbreaks"
  },
  {
    url: "https://www.afro.who.int/rss/press-releases",
    source: "WHO AFRO – Press Releases"
  },
  {
    url: "https://www.afro.who.int/rss/rd-messages",
    source: "WHO AFRO – RD Speeches & Messages"
  }
];

async function fetchAlerts() {
  for (const { url, source } of WHO_FEEDS) {
    try {
      const feed = await parser.parseURL(url);
      for (const item of feed.items.slice(0, 5)) {
        const exists = await Notification.findOne({ link: item.link });
        if (!exists) {
          await Notification.create({
            title: item.title,
            message: item.contentSnippet || item.title,
            type: "alert",
            source,
            link: item.link,
          });
        }
      }
    } catch (err) {
      console.error(`Failed to fetch alerts from '${source}':`, err.message);
    }
  }
}

module.exports = async function runAlertsCron() {
  await fetchAlerts();
};
