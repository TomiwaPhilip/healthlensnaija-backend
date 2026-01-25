// // controllers/generateController.js
// const openai = require("../config/openai");
// const Story = require("../models/Story");
// const ExtractedDocument = require("../models/ExtractedDocument");
// const UserActivity = require("../models/UserActivity");

// // Fact-checking function using gpt-5-nano (fallback to GPT-5 mini if needed)
// async function factCheckExtractedData(extractedText) {
//   const verificationPrompt = `
// You are an AI assistant responsible for fact-checking and updating news data.
// Review the provided extracted content and correct any outdated or incorrect information.
// If correct, leave it unchanged. If an error exists, replace only the incorrect parts.
// Maintain professionalism and informativeness.

// ---- Extracted Content ----
// ${extractedText}

// ---- Provide the fact-checked version below ----
// `;

//   try {
//     let response;
//     try {
//       response = await openai.chat.completions.create({
//         model: "gpt-5-nano",
//         messages: [
//           { role: "system", content: "You are a fact-checking AI assistant that verifies and updates extracted data." },
//           { role: "user", content: verificationPrompt }
//         ],
//         max_completion_tokens: 800,
//       });
//     } catch (err) {
//       console.warn("gpt-5-nano not available, falling back to gpt-5-mini:", err.message);
//       response = await openai.chat.completions.create({
//         model: "gpt-5-mini",
//         messages: [
//           { role: "system", content: "You are a fact-checking AI assistant that verifies and updates extracted data." },
//           { role: "user", content: verificationPrompt }
//         ],
//         max_completion_tokens: 800,
//       });
//     }

//     return response.choices[0].message.content.trim();
//   } catch (error) {
//     console.error("❌ Fact-checking failed:", error.message);
//     return extractedText;
//   }
// }

// const generateStory = async (req, res, next) => {
//   const { pillar, theme, keywords, prompt, userId, language, tone, length } = req.body;

//   if (!pillar || !theme || !keywords || keywords.length === 0 || !prompt || !userId) {
//     return res.status(400).json({ message: "Pillar, theme, keywords, prompt, and userId are required." });
//   }

//   try {
//     console.log("✅ Incoming Request Data:", { pillar, theme, keywords, prompt, userId });

//     // Fetch documents for context
//     const extractedDocs = await ExtractedDocument.find({
//       pillar,
//       keywords: { $in: keywords }
//     });

//     const extractedText = extractedDocs.length
//       ? extractedDocs.map(doc => `**${doc.title}**: ${doc.content_summary}`).join("\n")
//       : "No extracted documents found.";

//     // Fact-check using updated function
//     const verifiedExtractedText = await factCheckExtractedData(extractedText);

//     // Construct user message with SoJo format
//     const userMessage = `
// You are a healthcare AI journalist creating detailed, data-driven stories about Nigeria's health sector.
// Use thematic storytelling: educational, engaging, and unique.

// **Pillar**: ${pillar}
// **Theme**: ${theme}
// **Keywords**: ${keywords.join(", ")}
// **User Prompt**: ${prompt}
// **Language**: ${language || "en"}
// **Tone**: ${tone || "formal"}
// **Length**: ${length || "medium"}

// ---- Fact-Checked Reference Data ----
// ${verifiedExtractedText}

// ---- Generate the story in this structured format ----
// Story Title: [Creative and engaging title]
// Story Synopsis: [Brief 2-3 sentence overview]
// Data Points to Reference: [Key statistics and facts from the reference data]
// Potential Interviews: [Relevant experts or stakeholders to interview]
// Full Story: [Detailed narrative incorporating all elements above]
// `;

//     // Attempt generation using GPT-5 mini as primary model
//     let generatedStory = "";
//     let attempts = 0;
//     const maxAttempts = 2;

//     while ((!generatedStory || generatedStory.trim() === '') && attempts < maxAttempts) {
//       attempts++;

//       try {
//         let response;
//         try {
//           response = await openai.chat.completions.create({
//             model: "gpt-5-mini",
//             messages: [
//               { role: "system", content: "You are an AI journalist generating unique, high-quality healthcare stories for Nigeria's health sector." },
//               { role: "user", content: userMessage }
//             ],
//             max_completion_tokens: 500,
//           });
//         } catch (err) {
//           console.warn("gpt-5-mini not available, falling back to gpt-5-nano:", err.message);
//           response = await openai.chat.completions.create({
//             model: "gpt-5-nano",
//             messages: [
//               { role: "system", content: "You are an AI journalist generating unique, high-quality healthcare stories for Nigeria's health sector." },
//               { role: "user", content: userMessage }
//             ],
//             max_completion_tokens: 500,
//           });
//         }

//         generatedStory = response.choices[0].message.content;
//         console.log(`✅ Attempt ${attempts} - Story length:`, generatedStory.length);

//         if (!generatedStory || generatedStory.trim() === '') {
//           console.log("🔄 Empty response, trying fallback prompt...");
//           const fallback = await openai.chat.completions.create({
//             model: "gpt-5-mini",
//             messages: [
//               { role: "user", content: `Write a short healthcare story about ${pillar} focusing on ${keywords[0]}. Keep it concise and informative.` }
//             ],
//             max_completion_tokens: 300,
//           });
//           generatedStory = fallback.choices[0].message.content;
//         }

//       } catch (apiError) {
//         console.error(`❌ Attempt ${attempts} failed:`, apiError.message);
//         if (attempts === maxAttempts) throw apiError;
//         await new Promise(resolve => setTimeout(resolve, 1000));
//       }
//     }

//     if (!generatedStory || generatedStory.trim() === '') {
//       console.log("🔄 Using fallback content...");
//       generatedStory = `
// Story Title: Comprehensive Analysis of ${pillar}
// Story Synopsis: This in-depth analysis explores the ${theme} within Nigeria's ${pillar}, examining current challenges, opportunities, and future directions for healthcare improvement.

// Data Points to Reference: 
// - Key statistics and trends in ${keywords.join(", ")}
// - Policy initiatives and their impacts
// - Comparative regional data

// Potential Interviews:
// - Government health officials
// - Healthcare practitioners
// - Community stakeholders
// - Policy experts

// Full Story: The ${pillar} represents a critical component of Nigeria's healthcare system, with ${theme} serving as a focal point for ongoing development. Through strategic implementation of ${keywords.join(", ")}, significant progress can be achieved.
// `;
//     }

//     const newStory = new Story({
//       title: `Story: ${pillar} - ${theme}`,
//       content: generatedStory,
//       tags: keywords,
//       generatedBy: userId,
//     });
//     await newStory.save();

//     await UserActivity.create({
//       userId,
//       action: "generate_story",
//       language: language || null,
//       tone: tone || null,
//     });

//     res.status(200).json({
//       story: generatedStory,
//       insightsLink: "https://sojoinsights.nigeriahealthwatch.com/guest",
//       storyId: newStory._id
//     });

//   } catch (error) {
//     console.error("❌ Error in generateStory:", error.message);
//     next(error);
//   }
// };

// module.exports = { generateStory };
