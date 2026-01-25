require("dotenv").config({ path: require("path").resolve(__dirname, "../../.env") });
const connectDB = require("../config/db"); 
const ExtractedDocument = require("../models/ExtractedDocument");

// Map of old pillar values → new enum values
const pillarMap = {
  "Efficient": "Efficient, Equitable, and Quality Health System",
  "Equitable and Quality Health Systems": "Efficient, Equitable, and Quality Health System",
  "Equitable and Quality Health System": "Efficient, Equitable, and Quality Health System",
};

async function migratePillars() {
  try {
    await connectDB(); // ✅ uses your central db.js

    const docs = await ExtractedDocument.find({
      pillar: { $in: Object.keys(pillarMap) },
    });

    if (!docs.length) {
      console.log("ℹ️ No documents found that need migration.");
      return process.exit(0);
    }

    console.log(`🔍 Found ${docs.length} documents to migrate.`);

    // Update them in bulk instead of one by one
    for (const [oldPillar, newPillar] of Object.entries(pillarMap)) {
      const result = await ExtractedDocument.updateMany(
        { pillar: oldPillar },
        { $set: { pillar: newPillar } }
      );
      if (result.modifiedCount > 0) {
        console.log(`✔️ Updated ${result.modifiedCount} docs: ${oldPillar} → ${newPillar}`);
      }
    }

    console.log("🎉 Migration complete!");
    process.exit(0);
  } catch (err) {
    console.error("❌ Migration failed:", err);
    process.exit(1);
  }
}

migratePillars();
