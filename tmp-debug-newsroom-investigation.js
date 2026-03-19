require("dotenv").config({ path: ".env" });
const mongoose = require("mongoose");
const { getStoryById } = require("./src/services/newsroomStoryService");
const { generateAssistantReply } = require("./src/services/newsroomAgentService");

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { autoIndex: false });
  const story = await getStoryById("69bbc68d86d2edeb43f12cb3");
  if (!story) {
    throw new Error("Story not found");
  }

  const response = await generateAssistantReply({
    story,
    prompt: "Help me find latest health investigations in Nigeria",
    contextSummary: "No artifacts yet.\n\nNo sources uploaded.",
    chatHistorySummary: "No prior conversation yet.",
    onStatus: (status) => console.log("STATUS", status),
    onToken: (token) => process.stdout.write(token),
    sourcesOnly: false,
  });

  console.log("\nRESPONSE=" + JSON.stringify(response));
}

main()
  .catch((error) => {
    console.error("\nERR", error.message);
    console.error(error.stack);
    process.exitCode = 1;
  })
  .finally(async () => {
    try {
      await mongoose.disconnect();
    } catch {}
  });
