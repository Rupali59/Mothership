/**
 * Seed Roles and User Role Assignments (auth DB)
 * Usage: mongosh scripts/seed_roles.js
 *
 * Adds roles and assigns all existing users in the Motherboard workspace
 * to the superuser role. Safe to run when users already exist.
 * Does NOT modify or delete users.
 */

const MOTHERBOARD_ID = "69941dafdc8a4b11d13742d9";

const authDB = db.getSiblingDB("auth");
const wsId = ObjectId(MOTHERBOARD_ID);

console.log("Seeding roles for Motherboard workspace...");

// Upsert superuser role (insert or replace for this workspace)
const existingSuperuser = authDB.roles.findOne({
  workspaceId: wsId,
  name: "superuser",
  deletedAt: null,
});

let superuserRoleId;
if (existingSuperuser) {
  superuserRoleId = existingSuperuser._id;
  authDB.roles.updateOne(
    { _id: superuserRoleId },
    {
      $set: {
        description: "Full access to all resources",
        scope: "workspace",
        permissions: [
          { resource: "client", actions: ["read", "write", "delete", "manage"] },
          { resource: "integration", actions: ["read", "write", "delete", "manage"] },
          { resource: "website", actions: ["read", "write", "delete", "manage"] },
          { resource: "workspace", actions: ["read", "write", "delete", "manage"] },
          { resource: "deployment", actions: ["read", "write", "delete", "manage"] },
          { resource: "user", actions: ["read", "write", "delete", "manage"] },
          { resource: "role", actions: ["read", "write", "delete", "manage"] },
          { resource: "analytics", actions: ["read", "manage"] },
        ],
        isSystem: true,
        updatedAt: new Date(),
      },
    },
  );
  console.log("- Updated existing superuser role");
} else {
  const res = authDB.roles.insertOne({
    workspaceId: wsId,
    name: "superuser",
    description: "Full access to all resources",
    scope: "workspace",
    permissions: [
      { resource: "client", actions: ["read", "write", "delete", "manage"] },
      { resource: "integration", actions: ["read", "write", "delete", "manage"] },
      { resource: "website", actions: ["read", "write", "delete", "manage"] },
      { resource: "workspace", actions: ["read", "write", "delete", "manage"] },
      { resource: "deployment", actions: ["read", "write", "delete", "manage"] },
      { resource: "user", actions: ["read", "write", "delete", "manage"] },
      { resource: "role", actions: ["read", "write", "delete", "manage"] },
      { resource: "analytics", actions: ["read", "manage"] },
    ],
    isSystem: true,
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  superuserRoleId = res.insertedId;
  console.log("- Created superuser role");
}

// Find all users in this workspace (support both workspaceId and tenantId)
const workspaceUsers = authDB.users
  .find({
    $or: [{ workspaceId: wsId }, { tenantId: wsId }],
  })
  .toArray();

// Ensure workspaceId is set for consistency (auth service filters by workspaceId)
const usersNeedingWorkspaceId = workspaceUsers.filter((u) => !u.workspaceId && u.tenantId);
if (usersNeedingWorkspaceId.length > 0) {
  usersNeedingWorkspaceId.forEach((u) => {
    authDB.users.updateOne({ _id: u._id }, { $set: { workspaceId: wsId, updatedAt: new Date() } });
  });
  console.log(`- Backfilled workspaceId for ${usersNeedingWorkspaceId.length} user(s)`);
}

let assigned = 0;
workspaceUsers.forEach((u) => {
  const alreadyAssigned = authDB.user_role_assignments.findOne({
    workspaceId: wsId,
    userId: u._id,
    roleId: superuserRoleId,
    deletedAt: null,
  });
  if (!alreadyAssigned) {
    authDB.user_role_assignments.insertOne({
      workspaceId: wsId,
      userId: u._id,
      roleId: superuserRoleId,
      scope: "workspace",
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    assigned++;
  }
});

console.log(`- Assigned superuser to ${assigned} user(s) (${workspaceUsers.length} total in workspace)`);
console.log("✅ Role seeding complete.");
