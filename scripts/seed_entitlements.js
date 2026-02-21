db.workspaces.insertOne({
  name: "Motherboard",
  slug: "motherboard",
  type: "system",
  status: "active",
  created_at: new Date(),
  updated_at: new Date(),
});

var workspace = db.workspaces.findOne({ slug: "motherboard" });

db.plugins.insertMany([
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

db.workspace_plugins.insertMany([
  {
    workspace_id: workspace._id.toString(), // Store as string ID based on store.go logic? store.go uses string IDs for plugins but string workspaceID?
    // store.go: WorkspaceID string `json:"workspace_id" bson:"workspace_id"`. It seems to expect string.
    // workspaces collection usually uses ObjectID.
    // Let's check how other references are stored. Usually ObjectID.hex()
    plugin_id: "crm",
    enabled: true,
    enabled_at: new Date(),
    enabled_by: "system",
  },
  {
    workspace_id: workspace._id.toString(),
    plugin_id: "staff-management",
    enabled: true,
    enabled_at: new Date(),
    enabled_by: "system",
  },
  {
    workspace_id: workspace._id.toString(),
    plugin_id: "integrations",
    enabled: true,
    enabled_at: new Date(),
    enabled_by: "system",
  },
]);
