import {
  readdirSync,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
} from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = resolve(__dirname, "../../"); // Motherboard root

const QUEUE_DIR = join(__dirname, "antigravity-queue");
const PROCESSING_INTERVAL = 2000;

// Simple in-memory context (resets on restart)
const contextStore = new Map();

console.log("🧠 Antigravity Advanced Processor Started");
console.log(`📂 Watching queue: ${QUEUE_DIR}`);
console.log(`🏠 Project Root: ${PROJECT_ROOT}`);

/**
 * Advanced Logic Handlers
 */

// 1. System Diagnostics
function getSystemStatus() {
  const uptime = Math.floor(os.uptime() / 60); // minutes
  const load = os.loadavg();
  const mem = process.memoryUsage();

  return `🖥️ **System Diagnostics**
- **OS**: ${os.type()} ${os.release()}
- **Uptime**: ${uptime} minutes
- **Load Avg**: ${load[0].toFixed(2)}, ${load[1].toFixed(2)}, ${load[2].toFixed(2)}
- **Memory**: ${(mem.heapUsed / 1024 / 1024).toFixed(1)} MB used
- **Project Root**: \`${PROJECT_ROOT}\`
`;
}

// 2. Project Explorer
function listProjectFiles(dir = "") {
  try {
    const targetDir = join(PROJECT_ROOT, dir);
    if (!existsSync(targetDir)) return `❌ Directory not found: ${dir}`;

    const items = readdirSync(targetDir);
    const summary = items
      .slice(0, 15)
      .map((item) => {
        const isDir = statSync(join(targetDir, item)).isDirectory();
        return isDir ? `📂 ${item}/` : `📄 ${item}`;
      })
      .join("\n");

    const more = items.length > 15 ? `\n...and ${items.length - 15} more` : "";

    return `📂 **Contents of ${dir || "root"}**:\n${summary}${more}`;
  } catch (err) {
    return `❌ Error listing files: ${err.message}`;
  }
}

// 3. File Reader
function readFileContent(filename) {
  try {
    // Security: Prevent breaking out of project root
    const targetPath = resolve(PROJECT_ROOT, filename);
    if (!targetPath.startsWith(PROJECT_ROOT)) {
      return "🚫 Access Denied: Cannot read files outside project root.";
    }

    if (!existsSync(targetPath)) return `❌ File not found: ${filename}`;

    // Check size
    const stats = statSync(targetPath);
    if (stats.size > 5000) {
      // Too big for text, send as file upload
      return {
        text: `📄 File \`${filename}\` is too large to display inline (${stats.size} bytes). Sending as attachment.`,
        files: [{ path: targetPath, filename: filename.split("/").pop() }],
      };
    }

    // Read text
    const content = readFileSync(targetPath, "utf-8");
    const ext = filename.split(".").pop();

    return `📄 **File Content**: \`${filename}\`\n\`\`\`${ext}\n${content}\n\`\`\``;
  } catch (err) {
    return `❌ Error reading file: ${err.message}`;
  }
}

/**
 * Intelligent Query Processor
 */
async function processQuery(query, userContext) {
  const q = query.toLowerCase();

  // --- Conversational Checks ---
  if (["hello", "hi", "hey"].some((w) => q === w || q.startsWith(w + " "))) {
    return "👋 Hello! I am the Advanced Motherboard Assistant. I can check system status, list files, and read code for you.";
  }

  // --- Feature: System Status ---
  if (
    q.includes("status") ||
    q.includes("diagnostics") ||
    q.includes("uptime")
  ) {
    return getSystemStatus();
  }

  // --- Feature: List Files ---
  if (
    q.includes("list files") ||
    q.includes("ls ") ||
    q.includes("show contents")
  ) {
    // Extract format: "list files in core" -> "core"
    const match = q.match(/in\s+([a-zA-Z0-9_\-\/]+)/);
    const dir = match ? match[1] : "";
    return listProjectFiles(dir);
  }

  // --- Feature: Read File ---
  if (
    q.includes("read file") ||
    q.includes("cat ") ||
    q.includes("show code")
  ) {
    // Extract filename
    // Matches: "read file README.md" or "cat package.json"
    const match = q.split(/\s+/).pop(); // Naive extraction: get last word
    if (match && match.includes(".")) {
      return readFileContent(match);
    }
    return "❓ Which file? Usage: `read file README.md`";
  }

  // --- Feature: Documentation ---
  if (q.includes("documentation") || q.includes("docs")) {
    return {
      text: "📚 **Project Documentation**\nHere are the key documentation files for Motherboard.",
      files: [
        {
          path: join(PROJECT_ROOT, "TECHNICAL_DOCUMENTATION.md"),
          filename: "Technical_Docs.md",
        },
        {
          path: join(PROJECT_ROOT, "tools/slack-antigravity-bridge/README.md"),
          filename: "Slack_Bridge_Docs.md",
        },
      ],
    };
  }

  // Default Fallback
  return null;
}

/**
 * Main Loop
 */
async function processQueue() {
  try {
    if (!existsSync(QUEUE_DIR)) return;

    const files = readdirSync(QUEUE_DIR);
    const requestFiles = files.filter(
      (f) => f.startsWith("request-") && f.endsWith(".json"),
    );

    for (const file of requestFiles) {
      const requestId = file.replace("request-", "").replace(".json", "");
      const responseFile = join(QUEUE_DIR, `response-${requestId}.json`);

      if (existsSync(responseFile)) continue;

      try {
        const filepath = join(QUEUE_DIR, file);
        const request = JSON.parse(readFileSync(filepath, "utf-8"));

        console.log(`👀 Processing: ${request.query}`);

        const result = await processQuery(request.query, request.context);

        if (result) {
          console.log(`⚡️ Responding to ${requestId}`);

          let response = {
            channel: request.channel,
            thread_ts: request.context?.timestamp || request.id,
          };

          if (typeof result === "string") {
            response.text = result;
          } else {
            response.text = result.text;
            response.files = result.files;
          }

          writeFileSync(responseFile, JSON.stringify(response, null, 2));
        }
      } catch (err) {
        console.error(`Error processing ${file}:`, err.message);
      }
    }
  } catch (error) {
    console.error("Fatal loop error:", error);
  }
}

setInterval(processQueue, PROCESSING_INTERVAL);
