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
const INVENTORY_SOURCE = "inventory";

let supabase = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
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
    .select("id,provider_name,provider_type,service_category,public_description,availability,base_prices,image_url,updated_at")
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .eq("source", INVENTORY_SOURCE)
    .eq("public_visible", true)
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    inventoryCatalog.innerHTML = `<p>${escapeHtml(error.message)}.</p>`;
    return;
  }

  if (!data?.length) {
    inventoryCatalog.innerHTML = "<p>El inventario disponible aparecera aqui cuando el administrador agregue articulos.</p>";
    return;
  }

  inventoryCatalog.innerHTML = data
    .map(
      (item) => {
        const quantityMatch = String(item.availability || "").match(/Cantidad:\s*(\d+)/i);
        const quantity = quantityMatch ? Number(quantityMatch[1]) : 0;
        return `
        <article class="catalog-item">
          <div class="catalog-photo">
            ${
              item.image_url
                ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.provider_name)}">`
                : "<span>Sin foto</span>"
            }
          </div>
          <div class="catalog-copy">
            <span>${escapeHtml(item.service_category || item.provider_type || "Inventario")}</span>
            <h3>${escapeHtml(item.provider_name)}</h3>
            <p>${escapeHtml(item.public_description || "Disponible para cotizacion.")}</p>
            <div class="catalog-meta">
              <strong>${quantity} disponibles</strong>
              ${item.base_prices ? `<strong>${escapeHtml(item.base_prices)}</strong>` : ""}
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
