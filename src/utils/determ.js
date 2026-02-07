const axios = require("axios");
const determCatalog = require("../constants/determ.json");

const DEFAULT_LOOKBACK_DAYS = Number(process.env.DETERM_LOOKBACK_DAYS) || 3;
const DEFAULT_LOOKBACK_SECONDS = Number(process.env.DETERM_LOOKBACK_SECONDS) || DEFAULT_LOOKBACK_DAYS * 86400;
const DEFAULT_MAX_MATCHES = Number(process.env.DETERM_MAX_MATCHES) || 2;
const DEFAULT_MENTIONS_PER_MATCH = Number(process.env.DETERM_MENTIONS_PER_MATCH) || 3;
const DEFAULT_TIMEOUT_MS = Number(process.env.DETERM_TIMEOUT_MS) || 8000;
const BASE_URL = process.env.DETERM_API_BASE_URL || "https://api.mediatoolkit.com";

const KEYWORD_MATCHERS = buildKeywordMatchers(
  Array.isArray(determCatalog?.groups) ? determCatalog.groups : []
);

function escapeRegExp(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function normalizeText(value = "") {
  return value
    .toString()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function buildMatcher(term = "") {
  const normalized = normalizeText(term).trim();
  if (!normalized) {
    return null;
  }

  if (normalized.includes(" ")) {
    return (text) => text.includes(normalized);
  }

  const regex = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(normalized)}(?:$|[^a-z0-9])`, "i");
  return (text) => regex.test(text);
}

function buildKeywordMatchers(groups = []) {
  const entries = [];

  groups.forEach((group) => {
    const groupId = Number(group?.group_id);
    if (!Number.isFinite(groupId)) {
      return;
    }
    const groupName = (group?.name || "").trim();
    const keywords = Array.isArray(group?.keywords) ? group.keywords : [];

    keywords.forEach((keyword) => {
      const keywordId = Number(keyword?.id);
      const keywordName = (keyword?.name || "").trim();
      const matcher = buildMatcher(keywordName);
      if (!keywordId || !matcher) {
        return;
      }
      entries.push({
        groupId,
        groupName,
        keywordId,
        keywordName,
        trigger: keywordName,
        triggerType: "keyword",
        matcher,
      });
    });

    if (groupName && keywords.length) {
      const fallbackKeywordId = Number(keywords[0]?.id);
      const matcher = buildMatcher(groupName);
      if (fallbackKeywordId && matcher) {
        entries.push({
          groupId,
          groupName,
          keywordId: fallbackKeywordId,
          keywordName: groupName,
          trigger: groupName,
          triggerType: "group",
          matcher,
        });
      }
    }
  });

  return entries;
}

function detectDetermMatches(text = "") {
  const normalized = normalizeText(text);
  if (!normalized) {
    return [];
  }

  const seen = new Set();
  const matches = [];

  for (const entry of KEYWORD_MATCHERS) {
    try {
      if (entry.matcher(normalized)) {
        const key = `${entry.groupId}:${entry.keywordId}`;
        if (!seen.has(key)) {
          seen.add(key);
          matches.push({
            groupId: entry.groupId,
            groupName: entry.groupName,
            keywordId: entry.keywordId,
            keywordName: entry.keywordName,
            trigger: entry.trigger,
            triggerType: entry.triggerType,
          });
        }
      }
    } catch (error) {
      // Ignore malformed matchers and keep iterating
    }
  }

  return matches;
}

function buildKeywordUrl({ organizationId, groupId, keywordId }) {
  return `${BASE_URL}/organizations/${organizationId}/groups/${groupId}/keywords/${keywordId}/mentions`;
}

function truncateSnippet(value = "", limit = 320) {
  const text = value.toString().replace(/\s+/g, " ").trim();
  if (!text) {
    return "";
  }
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function normalizeMention(raw = {}) {
  if (!raw || typeof raw !== "object") {
    return null;
  }

  let url = raw.mention_url || raw.url;
  if (!url && raw.type === "twitter" && raw.twid) {
    url = `https://x.com/i/web/status/${raw.twid}`;
  }

  return {
    id: raw.id,
    keywordName: raw.keyword_name || raw.keyword_names?.[0] || null,
    groupName: raw.group_name || null,
    title: raw.title || raw.keyword_name || raw.group_name || "Determ mention",
    url,
    type: raw.type || "web",
    sentiment: raw.auto_sentiment || raw.sentiment || null,
    reach: raw.reach ?? null,
    locations: Array.isArray(raw.locations) ? raw.locations : [],
    influencer: raw.influencer || raw.from || null,
    snippet: truncateSnippet(raw.mention || raw.description || ""),
    insertedAt: raw.insert_time ? new Date(raw.insert_time * 1000).toISOString() : null,
  };
}

async function fetchDetermMentionsForMatch(match, options = {}) {
  const organizationId = options.organizationId || process.env.DETERM_ORGANIZATION_ID;
  const accessToken = options.accessToken || process.env.DETERM_ACCESS_TOKEN;
  if (!organizationId || !accessToken) {
    console.warn("Determ fetch skipped: missing organization id or access token");
    return [];
  }

  const now = Math.floor(Date.now() / 1000);
  const lookbackSeconds = options.lookbackSeconds || DEFAULT_LOOKBACK_SECONDS;
  const params = {
    access_token: accessToken,
    from_time: options.fromTime || now - lookbackSeconds,
    to_time: options.toTime || now,
    count: options.count || DEFAULT_MENTIONS_PER_MATCH,
    sort: options.sort || "insert_time",
    type: options.type,
    offset: options.offset,
    ids_only: false,
  };

  try {
    const url = buildKeywordUrl({
      organizationId,
      groupId: match.groupId,
      keywordId: match.keywordId,
    });

    const response = await axios.get(url, {
      params,
      timeout: options.timeout || DEFAULT_TIMEOUT_MS,
    });

    const payload = response.data?.data?.response || [];
    return payload
      .map((mention) => normalizeMention(mention))
      .filter(Boolean)
      .slice(0, params.count);
  } catch (error) {
    const details = error.response?.data || error.message;
    console.warn(`Determ API fetch failed for keyword ${match.keywordId}`, details);
    return [];
  }
}

function summarizeDetermMentions(entries = []) {
  if (!Array.isArray(entries) || !entries.length) {
    return "";
  }

  const sections = entries.map(({ match, mentions }) => {
    if (!Array.isArray(mentions) || !mentions.length) {
      return null;
    }

    const header = `${match.keywordName || match.groupName || "Determ keyword"} — Determ articles`;
    const lines = mentions.map((mention, index) => {
      const metaParts = [];
      if (mention.type) {
        metaParts.push(mention.type.toUpperCase());
      }
      if (mention.sentiment) {
        metaParts.push(`sentiment: ${mention.sentiment}`);
      }
      if (typeof mention.reach === "number") {
        metaParts.push(`reach: ${mention.reach}`);
      }
      if (mention.locations?.length) {
        metaParts.push(`markets: ${mention.locations.join(", ")}`);
      }

      const metaLine = metaParts.length ? `   ${metaParts.join(" • ")}` : null;
      const snippetLine = mention.snippet ? `   Snippet: ${mention.snippet}` : null;
      const urlLine = mention.url ? `   URL: ${mention.url}` : null;

      return [
        `${index + 1}. ${mention.title}`,
        urlLine,
        metaLine,
        snippetLine,
      ]
        .filter(Boolean)
        .join("\n");
    });

    return `${header}\n${lines.join("\n")}`;
  });

  return sections.filter(Boolean).join("\n\n");
}

async function buildDetermContextSummary(text, options = {}) {
  const matches = detectDetermMatches(text);
  if (!matches.length) {
    return "";
  }

  const organizationId = options.organizationId || process.env.DETERM_ORGANIZATION_ID;
  const accessToken = options.accessToken || process.env.DETERM_ACCESS_TOKEN;
  if (!organizationId || !accessToken) {
    console.warn("Determ context skipped: missing organization id or access token");
    return "";
  }

  const maxMatches = Math.max(1, options.maxMatches || DEFAULT_MAX_MATCHES);
  const mentionCount = Math.max(1, options.count || DEFAULT_MENTIONS_PER_MATCH);
  const lookbackSeconds = options.lookbackSeconds || DEFAULT_LOOKBACK_SECONDS;
  const now = Math.floor(Date.now() / 1000);
  const collected = [];

  for (const match of matches.slice(0, maxMatches)) {
    const mentions = await fetchDetermMentionsForMatch(match, {
      ...options,
      organizationId,
      accessToken,
      count: mentionCount,
      lookbackSeconds,
      toTime: now,
    });

    if (mentions.length) {
      collected.push({ match, mentions });
    }
  }

  if (!collected.length) {
    return "";
  }

  return summarizeDetermMentions(collected);
}

module.exports = {
  detectDetermMatches,
  fetchDetermMentionsForMatch,
  summarizeDetermMentions,
  buildDetermContextSummary,
};
