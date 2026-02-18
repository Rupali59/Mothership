import pkg from "@slack/bolt";
const { App } = pkg;
import dotenv from "dotenv";
import { readdirSync, existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Initialize Slack app with Socket Mode
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true,
});

// Queue directory for Antigravity commands
const QUEUE_DIR = join(__dirname, "antigravity-queue");

// Ensure queue directory exists
if (!existsSync(QUEUE_DIR)) {
  const mkdirSync = (await import("fs")).mkdirSync;
  mkdirSync(QUEUE_DIR, { recursive: true });
}

// Store conversation context
const conversationContext = new Map();

/**
 * Queue a message for Antigravity to process
 */
function queueForAntigravity(message) {
  const timestamp = Date.now();
  const filename = join(QUEUE_DIR, `request-${timestamp}.json`);

  writeFileSync(filename, JSON.stringify(message, null, 2));
  console.log(`✅ Queued message for Antigravity: ${filename}`);

  return filename;
}

/**
 * Check for Antigravity responses
 */
function checkForResponse(requestId) {
  const responseFile = join(QUEUE_DIR, `response-${requestId}.json`);

  if (existsSync(responseFile)) {
    const response = JSON.parse(readFileSync(responseFile, "utf-8"));
    return response;
  }

  return null;
}

/**
 * Listen for app mentions (@antigravity)
 */
app.event("app_mention", async ({ event, client, say }) => {
  try {
    console.log("📨 Received app mention:", event.text);

    // Remove the bot mention from the text
    const query = event.text.replace(/<@[A-Z0-9]+>/g, "").trim();

    if (!query) {
      await say({
        text: "👋 Hi! I'm the Antigravity bridge. Mention me with a question or command!",
        thread_ts: event.ts,
      });
      return;
    }

    // Store context
    conversationContext.set(event.ts, {
      channel: event.channel,
      user: event.user,
      timestamp: event.ts,
      query: query,
    });

    // Send thinking message
    await say({
      text: "🤔 Processing your request...",
      thread_ts: event.ts,
    });

    // Queue for Antigravity
    const requestData = {
      id: event.ts,
      channel: event.channel,
      user: event.user,
      query: query,
      timestamp: new Date().toISOString(),
      context: conversationContext.get(event.ts),
    };

    queueForAntigravity(requestData);

    // Inform user about manual processing
    await say({
      text: `📋 *Request queued for Antigravity*\n\nYour query: _"${query}"_\n\n*How it works:*\n1. Your request is saved to: \`antigravity-queue/request-${event.ts}.json\`\n2. Process it in Antigravity (copy the query and work on it)\n3. Save the response to: \`antigravity-queue/response-${event.ts}.json\`\n4. The bot will automatically post the response here\n\n*Or use the automated workflow (if configured)*`,
      thread_ts: event.ts,
    });
  } catch (error) {
    console.error("❌ Error handling app mention:", error);
    await say({
      text: `⚠️ Error processing request: ${error.message}`,
      thread_ts: event.ts,
    });
  }
});

/**
 * Listen for direct messages
 */
app.message(async ({ message, say }) => {
  // Only process DMs (not channel messages)
  if (message.channel_type !== "im") {
    return;
  }

  try {
    console.log("📨 Received DM:", message.text);

    const query = message.text.trim();

    // Store context
    conversationContext.set(message.ts, {
      channel: message.channel,
      user: message.user,
      timestamp: message.ts,
      query: query,
      isDM: true,
    });

    // Queue for Antigravity
    const requestData = {
      id: message.ts,
      channel: message.channel,
      user: message.user,
      query: query,
      timestamp: new Date().toISOString(),
      context: conversationContext.get(message.ts),
      isDM: true,
    };

    queueForAntigravity(requestData);

    await say({
      text: `📋 Request queued for Antigravity!\n\n*Your query:* _"${query}"_\n\nProcessing... I'll respond here once complete.`,
    });
  } catch (error) {
    console.error("❌ Error handling DM:", error);
    await say(`⚠️ Error: ${error.message}`);
  }
});

/**
 * Slash command: /antigravity
 */
app.command("/antigravity", async ({ command, ack, respond }) => {
  await ack();

  try {
    const query = command.text.trim();

    if (!query) {
      await respond({
        text: "❓ Usage: `/antigravity <your question or command>`\n\nExample: `/antigravity explain the notification service`",
        response_type: "ephemeral",
      });
      return;
    }

    // Queue for Antigravity
    const requestData = {
      id: `cmd-${Date.now()}`,
      channel: command.channel_id,
      user: command.user_id,
      query: query,
      timestamp: new Date().toISOString(),
      isCommand: true,
    };

    queueForAntigravity(requestData);

    await respond({
      text: `✅ *Request sent to Antigravity*\n\n*Query:* ${query}\n\n_Processing..._`,
      response_type: "in_channel",
    });
  } catch (error) {
    console.error("❌ Error handling slash command:", error);
    await respond({
      text: `⚠️ Error: ${error.message}`,
      response_type: "ephemeral",
    });
  }
});

/**
 * Poll for responses from Antigravity
 */
function pollForResponses() {
  try {
    const files = readdirSync(QUEUE_DIR);
    const responseFiles = files.filter((f) => f.startsWith("response-"));

    responseFiles.forEach(async (file) => {
      const filepath = join(QUEUE_DIR, file);
      const response = JSON.parse(readFileSync(filepath, "utf-8"));

      // Post response to Slack
      if (response.channel && (response.text || response.files)) {
        try {
          // If files are specified, upload them first
          if (response.files && response.files.length > 0) {
            console.log(`📎 Uploading ${response.files.length} file(s)...`);

            for (const fileToUpload of response.files) {
              const { readFileSync: readFileSyncFS } = await import("fs");
              const { createReadStream } = await import("fs");

              // Check if file exists
              if (!existsSync(fileToUpload.path)) {
                console.error(`❌ File not found: ${fileToUpload.path}`);
                continue;
              }

              await app.client.files.uploadV2({
                channel_id: response.channel,
                file: createReadStream(fileToUpload.path),
                filename:
                  fileToUpload.filename || fileToUpload.path.split("/").pop(),
                initial_comment: response.text || fileToUpload.comment || "",
                thread_ts: response.thread_ts,
              });

              console.log(
                `✅ Uploaded file: ${fileToUpload.filename || fileToUpload.path}`,
              );
            }
          } else if (response.text) {
            // Post text message only
            await app.client.chat.postMessage({
              channel: response.channel,
              text: response.text,
              thread_ts: response.thread_ts,
            });
          }

          console.log(`✅ Posted response to Slack: ${file}`);

          // Archive the processed response
          const fs = await import("fs");
          const processedDir = join(QUEUE_DIR, "processed");
          if (!existsSync(processedDir)) {
            fs.mkdirSync(processedDir, { recursive: true });
          }
          fs.renameSync(filepath, join(processedDir, file));
        } catch (error) {
          console.error(`❌ Error posting response: ${error.message}`);
        }
      }
    });
  } catch (error) {
    console.error("❌ Error polling responses:", error);
  }
}

// Poll every 5 seconds for responses
setInterval(pollForResponses, 5000);

/**
 * Start the app
 */
(async () => {
  const port = process.env.PORT || 3001;
  await app.start();

  console.log("⚡️ Slack-Antigravity Bridge is running!");
  console.log(`📡 Socket Mode enabled`);
  console.log(`📂 Queue directory: ${QUEUE_DIR}`);
  console.log("");
  console.log("✅ Ready to receive messages!");
  console.log("");
  console.log("📝 How to use:");
  console.log("  1. Mention @antigravity in a channel");
  console.log("  2. Send a DM to the bot");
  console.log("  3. Use /antigravity command");
  console.log("");
  console.log("🔄 The bot will queue requests and poll for responses.");
})();

// Error handling
app.error(async (error) => {
  console.error("❌ App error:", error);
});

process.on("unhandledRejection", (error) => {
  console.error("❌ Unhandled rejection:", error);
});
