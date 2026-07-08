import {
  DEFAULT_WORKSPACE_ID,
  getEffectiveWorkspaceRole,
  getWorkspaceContext,
  isPendingWorkspaceAccess,
  navigateWithLoopGuard,
  isSupabaseConfigured,
  requireSupabase,
} from "../lib/supabaseClient.js?v=shared-marketplace-workspace-20260707";

const sessionStatus = document.querySelector("#sessionStatus");
const assignmentsList = document.querySelector("#assignmentsList");
const signoutButton = document.querySelector("#signoutButton");
const collaboratorInventoryForm = document.querySelector("#collaboratorInventoryForm");
const collaboratorInventoryName = document.querySelector("#collaboratorInventoryName");
const collaboratorInventoryCategory = document.querySelector("#collaboratorInventoryCategory");
const collaboratorInventoryQuantity = document.querySelector("#collaboratorInventoryQuantity");
const collaboratorInventoryPrice = document.querySelector("#collaboratorInventoryPrice");
const collaboratorInventoryImageUrl = document.querySelector("#collaboratorInventoryImageUrl");
const collaboratorInventoryDescription = document.querySelector("#collaboratorInventoryDescription");
const collaboratorInventoryStatus = document.querySelector("#collaboratorInventoryStatus");
const collaboratorInventoryList = document.querySelector("#collaboratorInventoryList");
const INVENTORY_NOTE_PREFIX = "CATER_INVENTORY_JSON:";
const INVENTORY_CATEGORY_ALIASES = {
  table: "tables",
  tables: "tables",
  mesa: "tables",
  mesas: "tables",
  chair: "chairs",
  chairs: "chairs",
  silla: "chairs",
  sillas: "chairs",
  linen: "linen",
  linens: "linen",
  decor: "decor",
  decoration: "decor",
  tent: "tents",
  tents: "tents",
  food: "food",
  catering: "food",
  beverage: "beverages",
  beverages: "beverages",
  entertainment: "entertainment",
  lodging: "lodging",
  hotel: "lodging",
  venue: "lodging",
};
const INVENTORY_CATEGORY_LABELS = {
  tables: "Tables",
  chairs: "Chairs",
  linen: "Linen",
  decor: "Decor",
  tents: "Tents",
  food: "Food",
  beverages: "Beverages",
  entertainment: "Entertainment",
  lodging: "Lodging",
};
const PROVIDER_TYPE_BY_CATEGORY = {
  tables: "rental",
  chairs: "rental",
  linen: "rental",
  decor: "decor",
  tents: "rental",
  food: "food",
  beverages: "beverage",
  entertainment: "entertainment",
  lodging: "venue",
};

let supabase = null;
let currentWorkspaceId = DEFAULT_WORKSPACE_ID;
let currentUser = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalizeInventoryCategory(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return INVENTORY_CATEGORY_ALIASES[normalized] || "";
}

function inventoryCategoryLabel(category) {
  return INVENTORY_CATEGORY_LABELS[normalizeInventoryCategory(category)] || "Inventory";
}

function providerTypeForCategory(category) {
  return PROVIDER_TYPE_BY_CATEGORY[normalizeInventoryCategory(category)] || "vendor";
}

function approvalLabel(status) {
  const normalized = String(status || "pending").trim().toLowerCase();
  if (normalized === "approved") return "Approved";
  if (normalized === "rejected") return "Rejected";
  return "Pending Review";
}

function setInventoryStatus(message) {
  if (collaboratorInventoryStatus) collaboratorInventoryStatus.textContent = message;
}

function parseInventoryNotes(notes) {
  const raw = String(notes || "");
  if (!raw.startsWith(INVENTORY_NOTE_PREFIX)) return null;

  try {
    return JSON.parse(raw.slice(INVENTORY_NOTE_PREFIX.length));
  } catch {
    return null;
  }
}

function buildInventoryNotes(item) {
  return `${INVENTORY_NOTE_PREFIX}${JSON.stringify({
    kind: "inventory",
    category: normalizeInventoryCategory(item.category),
    quantity_available: item.quantity_available,
    price_label: item.price_label,
    image_url: item.image_url,
    description: item.description,
  })}`;
}

function providerToInventory(row) {
  const meta = parseInventoryNotes(row.notes);
  if (!meta || meta.kind !== "inventory") return null;
  const category = normalizeInventoryCategory(row.service_category || meta.category);
  if (!category) return null;

  return {
    id: row.id,
    name: row.provider_name || "",
    category,
    description: row.public_description || meta.description || "",
    quantity_available: Number(meta.quantity_available || 0),
    price_label: meta.price_label || "",
    image_url: row.image_url || meta.image_url || "",
    status: row.status || "active",
    approval_status: row.approval_status || "pending",
    public_visible: Boolean(row.public_visible),
    created_at: row.created_at || "",
  };
}

async function loadAssignments(userEmail) {
  const { data: collaborator } = await supabase
    .from("cater_collaborators")
    .select("id,full_name,role,status")
    .eq("workspace_id", currentWorkspaceId)
    .ilike("email", userEmail)
    .maybeSingle();

  if (!collaborator) {
    assignmentsList.innerHTML = "<p>No collaborator profile is linked to this email yet.</p>";
    return;
  }

  const { data, error } = await supabase
    .from("cater_event_assignments")
    .select("id,event_id,assignment_role,status,notes,created_at")
    .eq("workspace_id", currentWorkspaceId)
    .eq("collaborator_id", collaborator.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    assignmentsList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data?.length) {
    assignmentsList.innerHTML = "<p>You do not have visible assignments yet.</p>";
    return;
  }

  assignmentsList.innerHTML = data
    .map(
      (assignment) => `
        <article class="portal-row">
          <strong>Event #${assignment.event_id}</strong>
          <span>${escapeHtml(assignment.assignment_role)} · ${escapeHtml(assignment.status)} · ${escapeHtml(assignment.notes || "No notes")}</span>
        </article>
      `
    )
    .join("");
}

async function loadCollaboratorInventory(userId) {
  if (!collaboratorInventoryList) return;

  const { data, error } = await supabase
    .from("cater_providers")
    .select("id,provider_name,provider_type,status,notes,created_at,service_category,public_visible,approval_status,public_description,image_url,created_by")
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .eq("created_by", userId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    collaboratorInventoryList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  const items = (data || []).map(providerToInventory).filter(Boolean);
  if (!items.length) {
    collaboratorInventoryList.innerHTML = "<p>You have not submitted inventory yet.</p>";
    return;
  }

  collaboratorInventoryList.innerHTML = items
    .map(
      (item) => `
        <article class="portal-row">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(inventoryCategoryLabel(item.category))} · ${Number(item.quantity_available || 0)} available · ${item.public_visible ? "Public" : "Not public"}</span>
          <small>${escapeHtml(approvalLabel(item.approval_status))}</small>
        </article>
      `
    )
    .join("");
}

async function saveCollaboratorInventory(event) {
  event.preventDefault();

  if (!supabase || !currentUser) {
    setInventoryStatus("Supabase session is required.");
    return;
  }

  const category = normalizeInventoryCategory(collaboratorInventoryCategory.value);
  const name = collaboratorInventoryName.value.trim();
  const itemPayload = {
    category,
    quantity_available: Number(collaboratorInventoryQuantity.value || 0),
    price_label: collaboratorInventoryPrice.value.trim() || null,
    image_url: collaboratorInventoryImageUrl.value.trim() || null,
    description: collaboratorInventoryDescription.value.trim() || null,
  };

  if (!name) {
    setInventoryStatus("Add the item name.");
    return;
  }

  if (!category) {
    setInventoryStatus("Select an inventory category.");
    return;
  }

  setInventoryStatus("Submitting item...");

  const { error } = await supabase.from("cater_providers").insert({
    workspace_id: DEFAULT_WORKSPACE_ID,
    provider_name: name,
    provider_type: providerTypeForCategory(category),
    status: "active",
    notes: buildInventoryNotes(itemPayload),
    service_category: category,
    public_visible: false,
    approval_status: "pending",
    public_description: itemPayload.description,
    image_url: itemPayload.image_url,
    created_by: currentUser.id,
  });

  if (error) {
    setInventoryStatus(error.message);
    return;
  }

  collaboratorInventoryForm.reset();
  setInventoryStatus("Submitted for admin review.");
  await loadCollaboratorInventory(currentUser.id);
}

async function bootCollaborator() {
  if (!isSupabaseConfigured) {
    sessionStatus.textContent = "Configure Supabase to use the portal.";
    return;
  }

  supabase = requireSupabase();
  const { user, profile, membership, workspace } = await getWorkspaceContext();
  currentUser = user;

  if (!user) {
    navigateWithLoopGuard("../login.html", "collaborator-missing-user");
    return;
  }

  if (membership?.status === "disabled" || isPendingWorkspaceAccess(profile, membership, user)) {
    navigateWithLoopGuard("../pending.html", "collaborator-pending");
    return;
  }

  const role = getEffectiveWorkspaceRole(profile, membership, user);
  if (["owner", "admin", "super_admin", "platform_admin"].includes(role)) {
    navigateWithLoopGuard("../admin/", "collaborator-admin-role");
    return;
  }

  if (role === "viewer" || profile?.role === "client") {
    navigateWithLoopGuard("../client/", "collaborator-viewer-role");
    return;
  }

  if (!["collaborator", "organizer"].includes(role)) {
    navigateWithLoopGuard("../pending.html", "collaborator-unknown-role");
    return;
  }

  currentWorkspaceId = DEFAULT_WORKSPACE_ID;
  sessionStatus.textContent = `${user.email} · Collaborator`;
  await Promise.all([loadAssignments(user.email), loadCollaboratorInventory(user.id)]);
}

collaboratorInventoryForm?.addEventListener("submit", saveCollaboratorInventory);

signoutButton.addEventListener("click", async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
  window.location.href = "../login.html";
});

bootCollaborator().catch((error) => {
  sessionStatus.textContent = error.message;
});
