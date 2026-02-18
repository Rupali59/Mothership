#!/usr/bin/env node

/**
 * Helper script to create Slack responses from Antigravity
 * Usage:
 *   node respond.js <request-id> "Your response text"
 *   node respond.js <request-id> --file <filepath> [--comment "text"]
 */

import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname, resolve } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const QUEUE_DIR = join(__dirname, "antigravity-queue");

const args = process.argv.slice(2);

if (args.length === 0) {
  console.log("📋 Slack Response Helper\n");
  console.log("Usage:");
  console.log('  node respond.js <request-id> "Your response text"');
  console.log(
    '  node respond.js <request-id> --file <filepath> [--comment "text"]',
  );
  console.log(
    '  node respond.js <request-id> --files <file1> <file2> ... [--comment "text"]',
  );
  console.log("  node respond.js list           # List all pending requests");
  console.log("  node respond.js view <id>      # View a specific request");
  console.log("\nExamples:");
  console.log(
    '  node respond.js 1705678901234 "The billing service runs on port 8090"',
  );
  console.log(
    "  node respond.js 1705678901234 --file ./TECHNICAL_DOCUMENTATION.md",
  );
  console.log(
    '  node respond.js 1705678901234 --file ./README.md --comment "Here\'s the docs"',
  );
  console.log("  node respond.js 1705678901234 --files ./file1.md ./file2.pdf");
  console.log("  node respond.js list");
  console.log("  node respond.js view 1705678901234");
  process.exit(0);
}

// List all pending requests
if (args[0] === "list") {
  const { readdirSync } = await import("fs");
  const files = readdirSync(QUEUE_DIR);
  const requests = files.filter((f) => f.startsWith("request-"));

  if (requests.length === 0) {
    console.log("✅ No pending requests");
    process.exit(0);
  }

  console.log(`\n📬 ${requests.length} Pending Request(s):\n`);

  requests.forEach((file) => {
    const filepath = join(QUEUE_DIR, file);
    const request = JSON.parse(readFileSync(filepath, "utf-8"));
    const id = file.replace("request-", "").replace(".json", "");

    console.log(`ID: ${id}`);
    console.log(`Query: "${request.query}"`);
    console.log(`Channel: ${request.channel}`);
    console.log(`User: ${request.user}`);
    console.log(`Time: ${request.timestamp}`);
    console.log("─".repeat(50));
  });

  console.log("\nTo respond:");
  console.log('  node respond.js <ID> "Your response"');
  console.log("  node respond.js <ID> --file <filepath>\n");

  process.exit(0);
}

// View a specific request
if (args[0] === "view") {
  if (!args[1]) {
    console.error("❌ Please provide a request ID");
    process.exit(1);
  }

  const requestFile = join(QUEUE_DIR, `request-${args[1]}.json`);

  if (!existsSync(requestFile)) {
    console.error(`❌ Request not found: ${args[1]}`);
    process.exit(1);
  }

  const request = JSON.parse(readFileSync(requestFile, "utf-8"));

  console.log("\n📋 Request Details:\n");
  console.log(JSON.stringify(request, null, 2));
  console.log("\nTo respond:");
  console.log(`  node respond.js ${args[1]} "Your response"`);
  console.log(`  node respond.js ${args[1]} --file <filepath>\n`);

  process.exit(0);
}

// Create a response
const requestId = args[0];

// Check if it's a file upload request
const isFileUpload = args.includes("--file") || args.includes("--files");
let responseText = null;
let filesToUpload = [];
let comment = null;

if (isFileUpload) {
  // Parse file upload arguments
  const fileIndex = args.indexOf("--file");
  const filesIndex = args.indexOf("--files");
  const commentIndex = args.indexOf("--comment");

  if (fileIndex !== -1) {
    // Single file
    const filepath = args[fileIndex + 1];
    if (!filepath) {
      console.error("❌ Please provide a file path after --file");
      process.exit(1);
    }
    filesToUpload.push(resolve(filepath));
  } else if (filesIndex !== -1) {
    // Multiple files
    let i = filesIndex + 1;
    while (i < args.length && !args[i].startsWith("--")) {
      filesToUpload.push(resolve(args[i]));
      i++;
    }
  }

  if (commentIndex !== -1) {
    comment = args[commentIndex + 1];
  }

  // Validate files exist
  for (const file of filesToUpload) {
    if (!existsSync(file)) {
      console.error(`❌ File not found: ${file}`);
      process.exit(1);
    }
  }
} else {
  // Text response
  responseText = args[1];

  if (!responseText) {
    console.error("❌ Please provide response text or --file flag");
    console.error('Usage: node respond.js <request-id> "Your response"');
    console.error("       node respond.js <request-id> --file <filepath>");
    process.exit(1);
  }
}

// Find the request file
const requestFile = join(QUEUE_DIR, `request-${requestId}.json`);

if (!existsSync(requestFile)) {
  console.error(`❌ Request not found: ${requestId}`);
  console.error("\nAvailable requests:");
  const { readdirSync } = await import("fs");
  const files = readdirSync(QUEUE_DIR);
  const requests = files.filter((f) => f.startsWith("request-"));
  requests.forEach((f) => {
    const id = f.replace("request-", "").replace(".json", "");
    console.error(`  - ${id}`);
  });
  process.exit(1);
}

// Read the request
const request = JSON.parse(readFileSync(requestFile, "utf-8"));

// Create response
const response = {
  channel: request.channel,
  thread_ts: request.context?.timestamp || request.id,
};

if (isFileUpload) {
  // File upload response
  response.files = filesToUpload.map((filepath) => ({
    path: filepath,
    filename: filepath.split("/").pop(),
    comment: comment || null,
  }));

  if (comment) {
    response.text = comment;
  }
} else {
  // Text response
  response.text = responseText;
}

// Write response file
const responseFile = join(QUEUE_DIR, `response-${requestId}.json`);
writeFileSync(responseFile, JSON.stringify(response, null, 2));

console.log("✅ Response created!");
console.log(`\n📤 Will be posted to Slack within 5 seconds`);
console.log(`\nRequest: "${request.query}"`);

if (isFileUpload) {
  console.log(`Files: ${filesToUpload.length}`);
  filesToUpload.forEach((f) => console.log(`  - ${f}`));
  if (comment) {
    console.log(`Comment: "${comment}"`);
  }
} else {
  console.log(`Response: "${responseText}"`);
}

console.log(`\nFile: ${responseFile}`);
