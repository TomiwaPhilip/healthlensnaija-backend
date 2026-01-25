// const client = require('./config/opensearch');

// const testConnection = async () => {
//   try {
//     const info = await client.info();
//     console.log('OpenSearch cluster info:', info.body);
//   } catch (error) {
//     console.error('Error connecting to OpenSearch:', error.message);
//   }
// };

// testConnection();

const openai = require("./config/openai");

async function testOpenAI() {
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4",
      messages: [{ role: "user", content: "Say hello to the world!" }],
    });

    console.log("OpenAI Response:", response.choices[0].message.content);
  } catch (error) {
    console.error("Error with OpenAI API:", error.message);
  }
}

testOpenAI();
