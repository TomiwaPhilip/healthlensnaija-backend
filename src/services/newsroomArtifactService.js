const mongoose = require("mongoose");
const { chromium } = require("playwright");
const { marked } = require("marked");
const NewsroomArtifact = require("../models/NewsroomArtifact");
const { getStoryById, refreshStoryPreview } = require("./newsroomStoryService");

const PDF_MARGINS = {
  top: "32mm",
  bottom: "32mm",
  left: "20mm",
  right: "20mm",
};

function sanitizeArtifactTitle(title = "") {
  return title.replace(/[^a-z0-9]+/gi, "_").replace(/_+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "artifact";
}

function buildPdfHtmlDocument(title, markdownContent = "") {
  const rendered = marked.parse(markdownContent || "");
  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${title}</title>
      <style>
        :root {
          color-scheme: light;
        }
        body {
          font-family: "Inter", "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
          margin: 0;
          padding: 48px;
          background: #f8fafc;
          color: #0f172a;
          line-height: 1.6;
        }
        main {
          background: #ffffff;
          border-radius: 18px;
          padding: 48px 56px;
          box-shadow: 0 20px 45px rgba(15, 23, 42, 0.08);
          border: 1px solid #e2e8f0;
        }
        h1, h2, h3, h4, h5, h6 {
          font-weight: 600;
          color: #0f172a;
          margin-top: 32px;
          margin-bottom: 16px;
        }
        h1 { font-size: 2rem; }
        h2 { font-size: 1.6rem; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
        h3 { font-size: 1.25rem; }
        p { margin: 16px 0; font-size: 1rem; }
        ul, ol { margin: 16px 0; padding-left: 24px; }
        li { margin-bottom: 8px; }
        blockquote {
          border-left: 4px solid #0ea5e9;
          background: #f0f9ff;
          padding: 16px 24px;
          margin: 24px 0;
          font-style: italic;
        }
        code {
          background: #e2e8f0;
          border-radius: 8px;
          padding: 2px 6px;
          font-size: 0.95rem;
        }
        pre {
          background: #0f172a;
          color: #f8fafc;
          padding: 18px 24px;
          border-radius: 16px;
          overflow-x: auto;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin: 24px 0;
        }
        th, td {
          border: 1px solid #e2e8f0;
          padding: 12px 16px;
          text-align: left;
        }
        th {
          background: #f1f5f9;
          font-weight: 600;
        }
        figure {
          margin: 24px 0;
        }
        figcaption {
          text-align: center;
          font-size: 0.9rem;
          color: #475569;
        }
        .title {
          font-size: 2.4rem;
          font-weight: 700;
          margin-bottom: 8px;
        }
        .subtitle {
          color: #475569;
          margin-bottom: 40px;
        }
      </style>
    </head>
    <body>
      <main>
        <header>
          <div class="title">${title}</div>
          <div class="subtitle">Generated ${new Date().toLocaleString()}</div>
        </header>
        ${rendered}
      </main>
    </body>
  </html>`;
}

async function renderPdfFromMarkdown(title, markdownContent) {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const html = buildPdfHtmlDocument(title, markdownContent);
    await page.setContent(html, { waitUntil: "networkidle" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      margin: PDF_MARGINS,
      printBackground: true,
      preferCSSPageSize: true,
    });
    return pdfBuffer;
  } finally {
    await browser.close().catch(() => {});
  }
}

async function ensureStory(storyId) {
  const story = await getStoryById(storyId);
  if (!story) {
    throw new Error("Story not found");
  }
  return story;
}

async function listArtifacts(storyId) {
  await ensureStory(storyId);
  return NewsroomArtifact.find({ story: storyId }).sort({ createdAt: -1 }).lean();
}

async function createArtifact(storyId, payload = {}) {
  await ensureStory(storyId);
  if (!payload.title || !payload.content) {
    throw new Error("Artifact title and content are required");
  }

  const artifact = await NewsroomArtifact.create({
    story: storyId,
    title: payload.title.trim(),
    type: payload.type || "story",
    content: payload.content,
  });

  await refreshStoryPreview(storyId);
  return artifact.toObject();
}

async function getArtifactById(artifactId) {
  if (!mongoose.Types.ObjectId.isValid(artifactId)) {
    return null;
  }
  return NewsroomArtifact.findById(artifactId);
}

async function updateArtifact(artifactId, payload = {}) {
  const artifact = await getArtifactById(artifactId);
  if (!artifact) {
    throw new Error("Artifact not found");
  }

  if (payload.title) {
    artifact.title = payload.title.trim();
  }
  if (payload.type) {
    artifact.type = payload.type;
  }
  if (payload.content) {
    artifact.content = payload.content;
  }

  await artifact.save();
  await refreshStoryPreview(artifact.story.toString());
  return artifact.toObject();
}

async function deleteArtifact(artifactId) {
  const artifact = await getArtifactById(artifactId);
  if (!artifact) {
    return null;
  }

  await artifact.deleteOne();
  await refreshStoryPreview(artifact.story.toString());
  return artifact.toObject();
}

async function exportArtifact(artifactId, format = "pdf") {
  const artifact = await getArtifactById(artifactId);
  if (!artifact) {
    throw new Error("Artifact not found");
  }

  const normalizedFormat = (format || "pdf").toLowerCase() === "docx" ? "docx" : "pdf";
  const filename = `${sanitizeArtifactTitle(artifact.title)}.${normalizedFormat}`;

  if (normalizedFormat === "pdf") {
    const pdfContent = await renderPdfFromMarkdown(artifact.title, artifact.content || "");
    return {
      filename,
      mimeType: "application/pdf",
      content: pdfContent,
    };
  }

  return {
    filename,
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    content: Buffer.from(artifact.content || "", "utf8"),
  };
}

module.exports = {
  listArtifacts,
  createArtifact,
  updateArtifact,
  deleteArtifact,
  exportArtifact,
};
