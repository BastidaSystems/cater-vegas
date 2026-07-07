import {
  DEFAULT_WORKSPACE_ID,
  getEffectiveWorkspaceRole,
  getWorkspaceContext,
  isPendingWorkspaceAccess,
  navigateWithLoopGuard,
  isSupabaseConfigured,
  requireSupabase,
} from "../lib/supabaseClient.js?v=supabase-auth-loader-20260619";

const ADMIN_ROLES = new Set(["owner", "admin", "super_admin", "platform_admin", "organizer"]);
const LOCAL_INVENTORY_KEY = "caterVegasInventoryDraft";
const PUBLIC_INVENTORY_KEY = "caterVegasPublicInventory";
const INVENTORY_NOTE_PREFIX = "CATER_INVENTORY_JSON:";
const INVENTORY_CATEGORY_IDS = ["tables", "chairs", "linen", "decor", "tents", "food", "beverages", "entertainment", "lodging"];
const INVENTORY_CATEGORY_LABELS = {
  tables: "Tables",
  chairs: "Chairs",
  linen: "Linen",
  decor: "Decor",
  tents: "Tents",
  food: "Food",
  beverages: "Beverages",
  entertainment: "Entertainment",
  lodging: "Hospedaje",
};
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
  manteleria: "linen",
  decor: "decor",
  decoration: "decor",
  decoracion: "decor",
  tent: "tents",
  tents: "tents",
  carpa: "tents",
  carpas: "tents",
  food: "food",
  catering: "food",
  beverage: "beverages",
  beverages: "beverages",
  bar: "beverages",
  entertainment: "entertainment",
  music: "entertainment",
  lodging: "lodging",
  hotel: "lodging",
  venue: "lodging",
  hospedaje: "lodging",
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

const adminLayout = document.querySelector(".admin-layout-simple");
const sessionStatus = document.querySelector("#sessionStatus");
const signoutButton = document.querySelector("#signoutButton");
const dashboardEmail = document.querySelector("#dashboardEmail");
const dashboardRole = document.querySelector("#dashboardRole");
const dashboardCalendar = document.querySelector("#dashboardCalendar");
const calendarMonthLabel = document.querySelector("#calendarMonthLabel");
const inventoryForm = document.querySelector("#inventoryForm");
const inventoryItemId = document.querySelector("#inventoryItemId");
const inventoryName = document.querySelector("#inventoryName");
const inventoryCategory = document.querySelector("#inventoryCategory");
const inventoryQuantity = document.querySelector("#inventoryQuantity");
const inventoryPrice = document.querySelector("#inventoryPrice");
const inventoryImageUrl = document.querySelector("#inventoryImageUrl");
const inventoryImageFile = document.querySelector("#inventoryImageFile");
const inventoryDescription = document.querySelector("#inventoryDescription");
const inventoryStatus = document.querySelector("#inventoryStatus");
const inventoryList = document.querySelector("#inventoryList");
const refreshInventoryButton = document.querySelector("#refreshInventoryButton");
const resetInventoryButton = document.querySelector("#resetInventoryButton");

let supabase = null;
let currentUser = null;
let currentRole = "";
let allEvents = [];
let inventoryItems = [];

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
  return INVENTORY_CATEGORY_LABELS[normalizeInventoryCategory(category)] || "Inventario";
}

function providerTypeForCategory(category) {
  return PROVIDER_TYPE_BY_CATEGORY[normalizeInventoryCategory(category)] || "vendor";
}

function isMissingSchemaColumnError(error) {
  const message = String(error?.message || "").toLowerCase();
  return error?.code === "PGRST204" || error?.code === "42703" || message.includes("schema cache") || message.includes("column");
}

function setStatus(message) {
  if (sessionStatus) sessionStatus.textContent = message;
}

function setInventoryStatus(message) {
  if (inventoryStatus) inventoryStatus.textContent = message;
}

function setAdminView(targetSelector, requestedView = "") {
  if (!adminLayout) return;
  adminLayout.dataset.adminView = requestedView || (targetSelector === "#inventoryPanel" ? "inventory" : "calendar");
}

function scrollToAdminTarget(targetSelector, requestedView = "") {
  setAdminView(targetSelector, requestedView);
  const target = document.querySelector(targetSelector);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "start" });
}

function localInventoryRows() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_INVENTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalInventory(rows) {
  window.localStorage.setItem(LOCAL_INVENTORY_KEY, JSON.stringify(rows));
}

function savePublicInventory(rows) {
  window.localStorage.setItem(PUBLIC_INVENTORY_KEY, JSON.stringify(rows));
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
  const category = normalizeInventoryCategory(item.category);
  return `${INVENTORY_NOTE_PREFIX}${JSON.stringify({
    kind: "inventory",
    category,
    quantity_available: item.quantity_available,
    price_label: item.price_label,
    image_url: item.image_url,
    description: item.description,
  })}`;
}

function providerToInventory(row) {
  const meta = parseInventoryNotes(row.notes);
  if (!meta || meta.kind !== "inventory") return null;
  const category = normalizeInventoryCategory(meta.category);
  if (!category) return null;

  return {
    id: row.id,
    name: row.provider_name || "",
    category,
    description: meta.description || "",
    quantity_available: Number(meta.quantity_available || 0),
    price_label: meta.price_label || "",
    image_url: meta.image_url || "",
    status: row.status || "active",
  };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("No se pudo leer la imagen."));
    reader.readAsDataURL(file);
  });
}

function renderCalendar() {
  if (!dashboardCalendar) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstWeekday = (firstDay.getDay() + 6) % 7;
  const monthEvents = allEvents.filter((event) => {
    if (!event.event_date) return false;
    const eventDate = new Date(`${event.event_date}T00:00:00`);
    return eventDate.getMonth() === month && eventDate.getFullYear() === year;
  });

  const formatter = new Intl.DateTimeFormat("es-US", { month: "long", year: "numeric" });
  if (calendarMonthLabel) {
    const label = formatter.format(now);
    calendarMonthLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  }

  const weekdayLabels = ["L", "M", "M", "J", "V", "S", "D"];
  const cells = [
    ...weekdayLabels.map((day) => `<span class="calendar-weekday">${day}</span>`),
    ...Array.from({ length: firstWeekday }, () => '<span class="calendar-day is-empty"></span>'),
  ];

  for (let day = 1; day <= daysInMonth; day += 1) {
    const eventCount = monthEvents.filter((event) => {
      const eventDate = new Date(`${event.event_date}T00:00:00`);
      return eventDate.getDate() === day;
    }).length;
    const isToday = day === now.getDate();
    cells.push(`
      <span class="calendar-day ${isToday ? "is-today" : ""} ${eventCount ? "has-event" : ""}">
        <span>${day}</span>
        ${eventCount ? '<i class="calendar-dot"></i>' : ""}
      </span>
    `);
  }

  const upcomingEvents = monthEvents
    .filter((event) => new Date(`${event.event_date}T00:00:00`) >= new Date(year, month, now.getDate()))
    .slice(0, 6);

  dashboardCalendar.innerHTML = `
    <div class="calendar-grid" aria-label="Calendario mensual">${cells.join("")}</div>
    <aside class="calendar-agenda">
      <strong>Fechas proximas</strong>
      ${
        upcomingEvents.length
          ? upcomingEvents
              .map((event) => {
                const eventDate = new Date(`${event.event_date}T00:00:00`);
                return `
                  <div class="calendar-agenda-row">
                    <span>${eventDate.getDate()}</span>
                    <div>
                      <strong>${escapeHtml(event.title || "Evento")}</strong>
                      <small>${escapeHtml(event.event_type || "Evento")}</small>
                    </div>
                  </div>
                `;
              })
              .join("")
          : '<p class="empty-state">Sin eventos proximos.</p>'
      }
    </aside>
  `;
}

function renderInventory() {
  if (!inventoryList) return;

  if (!inventoryItems.length) {
    inventoryList.innerHTML = '<div class="empty-state">No hay articulos en inventario todavia.</div>';
    return;
  }

  inventoryList.innerHTML = inventoryItems
    .map(
      (item) => `
        <article class="inventory-card">
          <div class="inventory-photo">
            ${
              item.image_url
                ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}">`
                : '<span>Sin foto</span>'
            }
          </div>
          <div class="inventory-card-body">
            <p class="eyebrow">${escapeHtml(inventoryCategoryLabel(item.category))}</p>
            <h3>${escapeHtml(item.name)}</h3>
            <p>${escapeHtml(item.description || "Sin descripcion.")}</p>
            <div class="inventory-meta">
              <span>${Number(item.quantity_available ?? 0)} disponibles</span>
              ${item.price_label ? `<span>${escapeHtml(item.price_label)}</span>` : ""}
            </div>
            <div class="inventory-actions">
              <button class="secondary-button" type="button" data-edit-inventory="${escapeHtml(item.id)}">Editar</button>
              <button class="tiny-button" type="button" data-delete-inventory="${escapeHtml(item.id)}">Eliminar</button>
            </div>
          </div>
        </article>
      `
    )
    .join("");
}

async function loadEvents() {
  if (!supabase) {
    allEvents = [];
    renderCalendar();
    return;
  }

  const { data, error } = await supabase
    .from("cater_events")
    .select("id,title,event_type,event_date,status,updated_at")
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .order("event_date", { ascending: true });

  if (error) {
    setStatus(`Calendario: ${error.message}`);
    allEvents = [];
  } else {
    allEvents = data || [];
  }

  renderCalendar();
}

async function loadInventory() {
  if (!supabase) {
    inventoryItems = localInventoryRows();
    renderInventory();
    setInventoryStatus("Modo local: conecta Supabase para que el comprador lo vea en otro dispositivo.");
    return;
  }

  const { data, error } = await supabase
    .from("cater_providers")
    .select("id,provider_name,provider_type,status,notes,created_at")
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .order("created_at", { ascending: false });

  if (error) {
    inventoryItems = localInventoryRows();
    renderInventory();
    setInventoryStatus(`No se pudo leer inventario: ${error.message}.`);
    return;
  }

  inventoryItems = (data || []).map(providerToInventory).filter(Boolean);
  savePublicInventory(inventoryItems);
  renderInventory();
  setInventoryStatus("Inventario sincronizado.");
}

function resetInventoryForm() {
  inventoryForm?.reset();
  if (inventoryItemId) inventoryItemId.value = "";
  setInventoryStatus("");
}

function editInventoryItem(id) {
  const item = inventoryItems.find((row) => String(row.id) === String(id));
  if (!item) return;

  inventoryItemId.value = item.id;
  inventoryName.value = item.name || "";
  inventoryCategory.value = normalizeInventoryCategory(item.category) || "tables";
  inventoryQuantity.value = Number(item.quantity_available ?? 0);
  inventoryPrice.value = item.price_label || "";
  inventoryImageUrl.value = item.image_url || "";
  inventoryDescription.value = item.description || "";
  scrollToAdminTarget("#inventoryPanel", "inventory");
  setInventoryStatus("Editando articulo. Guarda para actualizarlo.");
}

async function deleteInventoryItem(id) {
  if (!window.confirm("Eliminar este articulo del inventario?")) return;

  if (!supabase) {
    const nextRows = localInventoryRows().filter((item) => String(item.id) !== String(id));
    saveLocalInventory(nextRows);
    await loadInventory();
    return;
  }

  const { error } = await supabase
    .from("cater_providers")
    .delete()
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .eq("id", id);

  if (error) {
    setInventoryStatus(error.message);
    return;
  }

  setInventoryStatus("Articulo eliminado.");
  await loadInventory();
}

async function saveInventoryItem(event) {
  event.preventDefault();

  const fileImage = await fileToDataUrl(inventoryImageFile?.files?.[0]);
  const selectedCategory = normalizeInventoryCategory(inventoryCategory.value);
  const itemPayload = {
    category: selectedCategory,
    quantity_available: Number(inventoryQuantity.value || 0),
    price_label: inventoryPrice.value.trim() || null,
    image_url: fileImage || inventoryImageUrl.value.trim() || null,
    description: inventoryDescription.value.trim() || null,
  };
  const basePayload = {
    workspace_id: DEFAULT_WORKSPACE_ID,
    provider_name: inventoryName.value.trim(),
    provider_type: providerTypeForCategory(selectedCategory),
    status: "active",
    notes: buildInventoryNotes(itemPayload),
  };
  const payload = {
    ...basePayload,
    service_category: selectedCategory,
    public_visible: true,
    public_description: itemPayload.description,
    image_url: itemPayload.image_url,
  };

  if (!selectedCategory) {
    setInventoryStatus("Selecciona una categoria de inventario.");
    return;
  }

  if (!basePayload.provider_name) {
    setInventoryStatus("Agrega el nombre del articulo.");
    return;
  }

  setInventoryStatus("Guardando inventario...");

  if (!supabase) {
    const rows = localInventoryRows();
    const id = inventoryItemId.value || `local-${Date.now()}`;
    const nextRows = [
      { ...payload, id, created_at: new Date().toISOString() },
      ...rows.filter((item) => String(item.id) !== String(id)),
    ];
    saveLocalInventory(nextRows);
    resetInventoryForm();
    await loadInventory();
    return;
  }

  const id = inventoryItemId.value;
  const savePayload = (nextPayload) =>
    id
      ? supabase
          .from("cater_providers")
          .update(nextPayload)
          .eq("workspace_id", DEFAULT_WORKSPACE_ID)
          .eq("id", id)
          .select()
          .single()
      : supabase
          .from("cater_providers")
          .insert({ ...nextPayload, created_by: currentUser?.id || null })
          .select()
          .single();

  let { error } = await savePayload(payload);
  if (isMissingSchemaColumnError(error)) {
    ({ error } = await savePayload(basePayload));
  }

  if (error) {
    setInventoryStatus(error.message);
    return;
  }

  resetInventoryForm();
  setInventoryStatus("Inventario guardado. El comprador ya lo puede ver.");
  await loadInventory();
}

async function bootAdmin() {
  renderCalendar();

  if (!isSupabaseConfigured) {
    setStatus("Configura Supabase para sincronizar inventario.");
    await loadInventory();
    return;
  }

  supabase = requireSupabase();
  const { user, profile, membership } = await getWorkspaceContext();
  currentUser = user;

  if (!user) {
    navigateWithLoopGuard("../login.html", "admin-missing-user");
    return;
  }

  if (membership?.status === "disabled" || isPendingWorkspaceAccess(profile, membership, user)) {
    navigateWithLoopGuard("../pending.html", "admin-pending");
    return;
  }

  currentRole = getEffectiveWorkspaceRole(profile, membership, user);
  if (!ADMIN_ROLES.has(currentRole)) {
    setStatus(`No tienes permisos para este admin. Rol detectado: ${currentRole || "sin rol"}.`);
    return;
  }

  if (dashboardEmail) dashboardEmail.textContent = user.email || "Admin";
  if (dashboardRole) dashboardRole.textContent = currentRole.replace(/^./, (char) => char.toUpperCase());
  setStatus(`${user.email} · Inventario listo`);

  await Promise.all([loadEvents(), loadInventory()]);
}

inventoryForm?.addEventListener("submit", saveInventoryItem);
refreshInventoryButton?.addEventListener("click", loadInventory);
resetInventoryButton?.addEventListener("click", resetInventoryForm);

inventoryList?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-edit-inventory], [data-delete-inventory]");
  if (!target) return;

  if (target.dataset.editInventory) editInventoryItem(target.dataset.editInventory);
  if (target.dataset.deleteInventory) deleteInventoryItem(target.dataset.deleteInventory);
});

document.querySelectorAll(".sidebar-link").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    document.querySelectorAll(".sidebar-link").forEach((item) => item.classList.toggle("is-active", item === link));
    scrollToAdminTarget(link.dataset.scrollTarget || "#calendarPanel", link.dataset.adminView || "");
  });
});

signoutButton?.addEventListener("click", async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
  window.location.href = "../login.html";
});

bootAdmin().catch((error) => {
  setStatus(error.message);
});
