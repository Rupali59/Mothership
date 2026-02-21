/**
 * Platform Initialization Script (Cleanup & Seeding)
 * Usage: mongosh scripts/init_platform.js
 */

const MOTHERBOARD_ID = "69941dafdc8a4b11d13742d9";
const ADMIN_USER_ID = "69941dafdc8a4b11d13742da";

// 1. CLEANUP MOTHERBOARD DATABASE
const mbDB = db.getSiblingDB("motherboard");
console.log("Cleaning up 'motherboard' database...");

const redundantCollections = ["users", "sessions", "otp_sessions"];
redundantCollections.forEach((coll) => {
  console.log(`- Dropping motherboard.${coll}`);
  mbDB.getCollection(coll).drop();
});

// 2. SEED WORKSPACES in 'motherboard'
console.log("Seeding core workspace...");
mbDB.workspaces.deleteMany({}); // Start fresh
mbDB.workspaces.insertOne({
  _id: ObjectId(MOTHERBOARD_ID),
  name: "Motherboard",
  slug: "motherboard",
  type: "system",
  status: "active",
  createdAt: new Date(),
  updatedAt: new Date(),
});

// 3. SEED PLUGINS in 'motherboard'
console.log("Seeding plugin registry...");
mbDB.plugins.deleteMany({});
mbDB.plugins.insertMany([
  {
    id: "crm",
    name: "Client Management",
    description: "Manage clients and relationships",
    category: "business",
    type: "app",
    entitlement_key: "feature_crm",
    service_path: "/api/clients",
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: "staff-management",
    name: "Team Management",
    description: "Manage staff and permissions",
    category: "business",
    type: "app",
    entitlement_key: "feature_staff",
    service_path: "/api/staff",
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
  {
    id: "integrations",
    name: "Integrations",
    description: "Connect external services",
    category: "system",
    type: "infra",
    entitlement_key: "feature_integrations",
    service_path: "/api/integrations",
    is_active: true,
    created_at: new Date(),
    updated_at: new Date(),
  },
]);

// 4. SEED DEFAULT ENTITLEMENTS for Motherboard workspace
// Entitlements gate feature/plugin access; plugins reference entitlement_key
console.log("Seeding default entitlements for Motherboard workspace...");
mbDB.entitlements.deleteMany({ workspaceId: ObjectId(MOTHERBOARD_ID) });
const defaultEntitlements = [
  { feature: "feature_crm", type: "feature", name: "CRM / Client Management" },
  { feature: "feature_staff", type: "feature", name: "Team Management" },
  { feature: "feature_integrations", type: "feature", name: "Integrations" },
];
defaultEntitlements.forEach((ent) => {
  mbDB.entitlements.insertOne({
    workspaceId: ObjectId(MOTHERBOARD_ID),
    feature: ent.feature,
    type: ent.type,
    name: ent.name,
    status: "active",
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});
console.log(`- Inserted ${defaultEntitlements.length} entitlements`);

// 5. CLEANUP AUTH DATABASE
const authDB = db.getSiblingDB("auth");
console.log("Cleaning up 'auth' database...");

// Remove 'tenants' in favor of unified 'workspaces' reference
console.log("- Dropping auth.tenants");
authDB.tenants.drop();

// 6. SEED USERS in 'auth'
console.log("Seeding admin user in 'auth'...");
authDB.users.deleteMany({});
authDB.users.insertOne({
  _id: ObjectId(ADMIN_USER_ID),
  workspaceId: ObjectId(MOTHERBOARD_ID),
  tenantId: ObjectId(MOTHERBOARD_ID), // Legacy; maps to Motherboard Workspace
  email: "admin@motherboard.dev",
  phone: "+910000000000",
  phoneVerified: true,
  name: "Motherboard Admin",
  hasPasskey: false,
  roles: ["admin", "owner", "superuser"],
  isSuperuser: true,
  createdAt: new Date(),
  updatedAt: new Date(),
});

// 7. SEED ROLES and USER_ROLE_ASSIGNMENTS in 'auth'
// Ensures RBAC works for /api/clients, /api/integrations, etc.
console.log("Seeding roles and assignments in 'auth'...");
const wsId = ObjectId(MOTHERBOARD_ID);

// Clean existing roles and assignments for this workspace
authDB.roles.deleteMany({ workspaceId: wsId });
authDB.user_role_assignments.deleteMany({ workspaceId: wsId });

// Create superuser role with full permissions (client, integration, website, workspace, etc.)
const superuserRole = {
  _id: new ObjectId(),
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
};
authDB.roles.insertOne(superuserRole);

// Assign all users in this workspace to superuser
const workspaceUsers = authDB.users.find({
  $or: [{ workspaceId: wsId }, { tenantId: wsId }],
}).toArray();
workspaceUsers.forEach((u) => {
  authDB.user_role_assignments.insertOne({
    workspaceId: wsId,
    userId: u._id,
    roleId: superuserRole._id,
    scope: "workspace",
    deletedAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
});
console.log(`- Inserted superuser role, assigned ${workspaceUsers.length} user(s)`);

console.log("✅ Platform Initialization Complete.");
