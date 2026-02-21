/**
 * Fix Motherboard workspace ID in MongoDB collections.
 * Updates documents whose workspaceId references a non-existent workspace
 * to use the canonical Motherboard workspace ID.
 *
 * Usage: mongosh scripts/fix_motherboard_workspace.js
 */

const MOTHERBOARD_ID = "69941dafdc8a4b11d13742d9";
const mbDB = db.getSiblingDB("motherboard");

const COLLECTIONS_WITH_WORKSPACE = ["clients", "websites", "entitlements", "assets"];

console.log("Fixing orphaned/invalid workspace IDs → Motherboard:", MOTHERBOARD_ID);
console.log("");

const ws = mbDB.workspaces.findOne({ _id: ObjectId(MOTHERBOARD_ID) });
if (!ws) {
  print("ERROR: Motherboard workspace not found. Run scripts/init_platform.js first.");
  quit(1);
}

// Get all valid workspace IDs
const validWorkspaceIds = mbDB.workspaces.find({}, { _id: 1 }).map((w) => w._id);
const validSet = new Set(validWorkspaceIds.map((id) => id.toString()));

let totalFixed = 0;

for (const collName of COLLECTIONS_WITH_WORKSPACE) {
  const coll = mbDB.getCollection(collName);
  if (!coll.exists()) continue;

  const cursor = coll.find({ workspaceId: { $exists: true } });
  let fixed = 0;
  while (cursor.hasNext()) {
    const doc = cursor.next();
    const wid = doc.workspaceId;
    if (!wid) continue;
    const widStr = wid.toString ? wid.toString() : String(wid);
    if (!validSet.has(widStr)) {
      coll.updateOne(
        { _id: doc._id },
        { $set: { workspaceId: ObjectId(MOTHERBOARD_ID), updatedAt: new Date() } }
      );
      fixed++;
    }
  }
  if (fixed > 0) {
    console.log(`  ${collName}: updated ${fixed} document(s) with invalid workspaceId`);
    totalFixed += fixed;
  }
}

if (totalFixed > 0) {
  console.log("");
  console.log("Updated", totalFixed, "document(s).");
} else {
  console.log("No documents with invalid workspaceId found.");
}
