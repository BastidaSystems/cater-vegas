import {
  DEFAULT_WORKSPACE_ID,
  getEffectiveWorkspaceRole,
  getWorkspaceContext,
  isPendingWorkspaceAccess,
  navigateWithLoopGuard,
  isSupabaseConfigured,
  requireSupabase,
} from "../lib/supabaseClient.js?v=supabase-auth-loader-20260619";

const sessionStatus = document.querySelector("#sessionStatus");
const eventsList = document.querySelector("#eventsList");
const inventoryCatalog = document.querySelector("#inventoryCatalog");
const signoutButton = document.querySelector("#signoutButton");
const INVENTORY_NOTE_PREFIX = "CATER_INVENTORY_JSON:";

let supabase = null;

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
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .order("updated_at", { ascending: false })
    .limit(50);

  if (error) {
    eventsList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data?.length) {
    eventsList.innerHTML = "<p>No hay eventos visibles para tu cuenta todavia.</p>";
    return;
  }

  eventsList.innerHTML = data
    .map(
      (event) => `
        <article class="portal-row">
          <strong>${escapeHtml(event.title || `Evento #${event.id}`)}</strong>
          <span>#${event.id} · ${escapeHtml(event.event_type || "Sin tipo")} · ${escapeHtml(event.status || "draft")}</span>
        </article>
      `
    )
    .join("");
}

async function loadInventoryCatalog() {
  const { data, error } = await supabase
    .from("cater_providers")
    .select("id,provider_name,provider_type,status,notes,updated_at,created_at")
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .eq("provider_type", "rental")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    inventoryCatalog.innerHTML = `<p>${escapeHtml(error.message)}.</p>`;
    return;
  }

  const items = (data || [])
    .map((item) => ({ row: item, meta: parseInventoryNotes(item.notes) }))
    .filter((item) => item.meta?.kind === "inventory");

  if (!items.length) {
    inventoryCatalog.innerHTML = "<p>El inventario disponible aparecera aqui cuando el administrador agregue articulos.</p>";
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
              meta.image_url
                ? `<img src="${escapeHtml(meta.image_url)}" alt="${escapeHtml(row.provider_name)}">`
                : "<span>Sin foto</span>"
            }
          </div>
          <div class="catalog-copy">
            <span>${escapeHtml(meta.category || "Inventario")}</span>
            <h3>${escapeHtml(row.provider_name)}</h3>
            <p>${escapeHtml(meta.description || "Disponible para cotizacion.")}</p>
            <div class="catalog-meta">
              <strong>${quantity} disponibles</strong>
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
    sessionStatus.textContent = "Configura Supabase para usar el portal.";
    return;
  }

  supabase = requireSupabase();
  const { user, profile, membership } = await getWorkspaceContext();

  if (!user) {
    navigateWithLoopGuard("../login.html", "client-missing-user");
    return;
  }

  if (membership?.status === "disabled" || isPendingWorkspaceAccess(profile, membership, user)) {
    navigateWithLoopGuard("../pending.html", "client-pending");
    return;
  }

  const role = getEffectiveWorkspaceRole(profile, membership, user);
  const label = ["owner", "admin", "super_admin", "platform_admin", "organizer"].includes(role)
    ? "Vista de comprador"
    : "Comprador";

  sessionStatus.textContent = `${user.email} · ${label}`;
  await Promise.all([loadClientEvents(), loadInventoryCatalog()]);
}

signoutButton.addEventListener("click", async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
  window.location.href = "../login.html";
});

bootClient().catch((error) => {
  sessionStatus.textContent = error.message;
});
