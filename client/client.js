import {
  clearWorkspaceContextCache,
  getEffectiveWorkspaceRole,
  getWorkspaceContext,
  isPendingWorkspaceAccess,
  navigateWithLoopGuard,
  isSupabaseConfigured,
  requireSupabase,
} from "../lib/supabaseClient.js?v=shared-marketplace-workspace-20260707";

const sessionStatus = document.querySelector("#sessionStatus");
const eventsList = document.querySelector("#eventsList");
const inventoryCatalog = document.querySelector("#inventoryCatalog");
const signoutButton = document.querySelector("#signoutButton");
const INVENTORY_NOTE_PREFIX = "CATER_INVENTORY_JSON:";

let supabase = null;
let currentWorkspaceId = "";

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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

async function loadClientEvents() {
  const { data, error } = await supabase
    .from("cater_events")
    .select("id,title,event_type,status,event_date,budget_label,updated_at")
    .eq("workspace_id", currentWorkspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    eventsList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data?.length) {
    eventsList.innerHTML = "<p>No events are visible for your account yet.</p>";
    return;
  }

  eventsList.innerHTML = data
    .map(
      (event) => `
        <article class="portal-row">
          <strong>${escapeHtml(event.title || `Event #${event.id}`)}</strong>
          <span>#${event.id} · ${escapeHtml(event.event_type || "No type")} · ${escapeHtml(event.status || "draft")}</span>
        </article>
      `
    )
    .join("");
}

async function loadInventoryCatalog() {
  const { data, error } = await supabase
    .from("cater_providers")
    .select("id,provider_name,provider_type,status,notes,updated_at,created_at,service_category,public_visible,approval_status,public_description,image_url")
    .eq("workspace_id", currentWorkspaceId)
    .eq("public_visible", true)
    .eq("approval_status", "approved")
    .in("status", ["active", "preferred"])
    .order("created_at", { ascending: false });

  if (error) {
    inventoryCatalog.innerHTML = `<p>${escapeHtml(error.message)}.</p>`;
    return;
  }

  const items = (data || [])
    .map((item) => ({ row: item, meta: parseInventoryNotes(item.notes) }))
    .filter((item) => item.meta?.kind === "inventory");

  if (!items.length) {
    inventoryCatalog.innerHTML = "<p>Available inventory will appear here when the admin adds items.</p>";
    return;
  }

  inventoryCatalog.innerHTML = items
    .map(
      ({ row, meta }) => {
        const quantity = Number(meta.quantity_available || 0);
        return `
        <article class="catalog-item">
          <div class="catalog-photo">
            ${
              row.image_url || meta.image_url
                ? `<img src="${escapeHtml(row.image_url || meta.image_url)}" alt="${escapeHtml(row.provider_name)}">`
                : "<span>No photo</span>"
            }
          </div>
          <div class="catalog-copy">
            <span>${escapeHtml(row.service_category || meta.category || "Inventory")}</span>
            <h3>${escapeHtml(row.provider_name)}</h3>
            <p>${escapeHtml(row.public_description || meta.description || "Available for quote.")}</p>
            <div class="catalog-meta">
              <strong>${quantity} available</strong>
              ${meta.price_label ? `<strong>${escapeHtml(meta.price_label)}</strong>` : ""}
            </div>
          </div>
        </article>
      `;
      }
    )
    .join("");
}

async function bootClient() {
  if (!isSupabaseConfigured) {
    sessionStatus.textContent = "Configure Supabase to use the portal.";
    return;
  }

  supabase = requireSupabase();
  const context = await getWorkspaceContext();
  const { user, profile, membership, workspace, workspaceId, role, accessError } = context;

  if (!user) {
    navigateWithLoopGuard("../login.html", "client-missing-user");
    return;
  }

  if (accessError || membership?.status === "disabled" || isPendingWorkspaceAccess(profile, membership, user)) {
    navigateWithLoopGuard("../pending.html", "client-pending");
    return;
  }

  const workspaceRole = role || getEffectiveWorkspaceRole(profile, membership, user, workspaceId);
  const label = ["owner", "admin", "super_admin", "platform_admin", "organizer"].includes(workspaceRole)
    ? "Buyer View"
    : "Buyer";

  currentWorkspaceId = workspaceId;
  sessionStatus.textContent = `${user.email} · ${label}`;
  await Promise.all([loadClientEvents(), loadInventoryCatalog()]);
}

signoutButton.addEventListener("click", async () => {
  if (!supabase) return;
  clearWorkspaceContextCache();
  await supabase.auth.signOut();
  clearWorkspaceContextCache();
  window.location.href = "../login.html";
});

bootClient().catch((error) => {
  sessionStatus.textContent = error.message;
});
