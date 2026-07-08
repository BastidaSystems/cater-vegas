import {
  DEFAULT_WORKSPACE_ID,
  getEffectiveWorkspaceRole,
  getWorkspaceContext,
  isPendingWorkspaceAccess,
  navigateWithLoopGuard,
  isSupabaseConfigured,
  requireSupabase,
} from "../lib/supabaseClient.js?v=workspace-connection-20260707";

const ADMIN_ROLES = new Set(["owner", "admin", "super_admin", "platform_admin", "organizer"]);
const LOCAL_INVENTORY_KEY = "caterVegasInventoryDraft";
const PUBLIC_INVENTORY_KEY = "caterVegasPublicInventory";
const LOCAL_USERS_KEY = "caterVegasCompanyUsers";
const INVENTORY_NOTE_PREFIX = "CATER_INVENTORY_JSON:";
const USER_NOTE_PREFIX = "CATER_USER_COMPANY_JSON:";
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
  lodging: "Lodging",
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
const dashboardMetrics = document.querySelector("#dashboardMetrics");
const dashboardCalendar = document.querySelector("#dashboardCalendar");
const dashboardUpcomingList = document.querySelector("#dashboardUpcomingList");
const dashboardInventorySummary = document.querySelector("#dashboardInventorySummary");
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
const inventoryCategoryBar = document.querySelector("#inventoryCategoryBar");
const inventoryList = document.querySelector("#inventoryList");
const inventoryDetailPanel = document.querySelector("#inventoryDetailPanel");
const refreshInventoryButton = document.querySelector("#refreshInventoryButton");
const resetInventoryButton = document.querySelector("#resetInventoryButton");
const userCompanyForm = document.querySelector("#userCompanyForm");
const userCompanyId = document.querySelector("#userCompanyId");
const userFullName = document.querySelector("#userFullName");
const userCompanyName = document.querySelector("#userCompanyName");
const userEmail = document.querySelector("#userEmail");
const userPhone = document.querySelector("#userPhone");
const userServiceType = document.querySelector("#userServiceType");
const userRole = document.querySelector("#userRole");
const userTaxId = document.querySelector("#userTaxId");
const userLegalStatus = document.querySelector("#userLegalStatus");
const userBusinessAddress = document.querySelector("#userBusinessAddress");
const userCompanyNotes = document.querySelector("#userCompanyNotes");
const usersStatus = document.querySelector("#usersStatus");
const usersList = document.querySelector("#usersList");
const refreshUsersButton = document.querySelector("#refreshUsersButton");
const resetUserButton = document.querySelector("#resetUserButton");

const INVENTORY_CATEGORY_ICONS = {
  all: "All",
  tables: "Tbl",
  chairs: "Chr",
  linen: "Lin",
  decor: "Dec",
  tents: "Ten",
  food: "Food",
  beverages: "Bar",
  entertainment: "Ent",
  lodging: "Stay",
};

let supabase = null;
let currentUser = null;
let currentRole = "";
let currentWorkspaceId = DEFAULT_WORKSPACE_ID;
let allEvents = [];
let inventoryItems = [];
let companyUsers = [];
let activeInventoryCategory = "all";
let selectedInventoryId = "";

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

function roleLabel(role) {
  return String(role || "admin")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
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

function setUsersStatus(message) {
  if (usersStatus) usersStatus.textContent = message;
}

function setAdminView(targetSelector, requestedView = "") {
  if (!adminLayout) return;
  adminLayout.dataset.adminView = requestedView || (targetSelector === "#inventoryPanel" ? "inventory" : "dashboard");
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

function localUserRows() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_USERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveLocalUsers(rows) {
  window.localStorage.setItem(LOCAL_USERS_KEY, JSON.stringify(rows));
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

function parseUserNotes(notes) {
  const raw = String(notes || "");
  if (!raw.startsWith(USER_NOTE_PREFIX)) return {};

  try {
    return JSON.parse(raw.slice(USER_NOTE_PREFIX.length));
  } catch {
    return {};
  }
}

function buildUserNotes(user) {
  return `${USER_NOTE_PREFIX}${JSON.stringify({
    kind: "company_user",
    company_name: user.company_name,
    service_type: user.service_type,
    tax_id: user.tax_id,
    legal_status: user.legal_status,
    business_address: user.business_address,
    company_notes: user.company_notes,
  })}`;
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

function rowToCompanyUser(row) {
  const meta = parseUserNotes(row.notes);

  return {
    id: row.id,
    full_name: row.full_name || "",
    email: row.email || "",
    phone: row.phone || "",
    role: row.role || "staff",
    status: row.status || "active",
    company_name: meta.company_name || row.company_name || "",
    service_type: meta.service_type || row.service_type || "rental",
    tax_id: meta.tax_id || row.tax_id || "",
    legal_status: meta.legal_status || row.legal_status || "pending",
    business_address: meta.business_address || row.business_address || "",
    company_notes: meta.company_notes || row.company_notes || "",
  };
}

function normalizeInventoryItem(item) {
  if (!item) return null;
  const meta = parseInventoryNotes(item.notes) || item;
  const category = normalizeInventoryCategory(meta.category || item.category) || "tables";

  return {
    id: item.id,
    name: item.name || item.provider_name || "",
    category,
    description: meta.description || item.description || "",
    quantity_available: Number(meta.quantity_available ?? item.quantity_available ?? 0),
    price_label: meta.price_label || item.price_label || "",
    image_url: meta.image_url || item.image_url || "",
    status: item.status || "active",
  };
}

function renderInventoryCategories() {
  if (!inventoryCategoryBar) return;

  const counts = inventoryItems.reduce(
    (acc, item) => {
      const category = normalizeInventoryCategory(item.category) || "tables";
      acc.all += 1;
      acc[category] = (acc[category] || 0) + 1;
      return acc;
    },
    { all: 0 }
  );

  const categories = ["all", ...INVENTORY_CATEGORY_IDS.filter((category) => counts[category])];
  inventoryCategoryBar.innerHTML = categories
    .map((category) => {
      const label = category === "all" ? "All" : inventoryCategoryLabel(category);
      const icon = INVENTORY_CATEGORY_ICONS[category] || category.slice(0, 3);
      return `
        <button class="inventory-category-chip ${activeInventoryCategory === category ? "is-active" : ""}" type="button" data-inventory-category="${escapeHtml(category)}">
          <span aria-hidden="true">${escapeHtml(icon)}</span>
          <strong>${escapeHtml(label)}</strong>
          <small>${Number(counts[category] || 0)}</small>
        </button>
      `;
    })
    .join("");
}

function inventoryIconForCategory(category) {
  const normalized = normalizeInventoryCategory(category) || "tables";
  const icons = {
    tables: "T",
    chairs: "C",
    linen: "L",
    decor: "D",
    tents: "TN",
    food: "F",
    beverages: "B",
    entertainment: "E",
    lodging: "H",
  };
  return icons[normalized] || "I";
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve("");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}

function eventDateValue(event) {
  if (!event?.event_date) return null;
  const value = new Date(`${event.event_date}T00:00:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function renderDashboardStats(monthEvents, upcomingEvents) {
  if (!dashboardMetrics) return;

  const now = new Date();
  const todayKey = now.toISOString().slice(0, 10);
  const todayEvents = allEvents.filter((event) => event.event_date === todayKey).length;
  const activeInventory = inventoryItems.reduce((sum, item) => sum + Number(item.quantity_available || 0), 0);
  const nextEvent = upcomingEvents[0];
  const nextEventLabel = nextEvent?.event_date
    ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(eventDateValue(nextEvent))
    : "No date";

  const cards = [
    { label: "Total Events", value: allEvents.length, note: "Registered in Cater Vegas" },
    { label: "This Month", value: monthEvents.length, note: "Events on calendar" },
    { label: "Today", value: todayEvents, note: "Scheduled events" },
    { label: "Next", value: nextEvent ? nextEventLabel : "-", note: nextEvent?.title || "No upcoming events" },
    { label: "Inventory", value: activeInventory, note: "Available pieces" },
  ];

  dashboardMetrics.innerHTML = cards
    .map(
      (card) => `
        <article class="dashboard-metric-card">
          <span>${escapeHtml(card.label)}</span>
          <strong>${escapeHtml(card.value)}</strong>
          <small>${escapeHtml(card.note)}</small>
        </article>
      `
    )
    .join("");
}

function renderDashboardSide(upcomingEvents) {
  if (dashboardUpcomingList) {
    dashboardUpcomingList.innerHTML = upcomingEvents.length
      ? upcomingEvents
          .slice(0, 5)
          .map((event) => {
            const date = eventDateValue(event);
            const dateLabel = date
              ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(date)
              : "No date";
            return `
              <article class="dashboard-upcoming-item">
                <span>${escapeHtml(dateLabel)}</span>
                <div>
                  <strong>${escapeHtml(event.title || "Event")}</strong>
                  <small>${escapeHtml(event.event_type || event.status || "Event")}</small>
                </div>
              </article>
            `;
          })
          .join("")
      : '<p class="empty-state">No upcoming events yet.</p>';
  }

  if (!dashboardInventorySummary) return;

  if (!inventoryItems.length) {
    dashboardInventorySummary.innerHTML = `
      <div class="dashboard-summary-block">
        <p class="eyebrow">Inventory</p>
        <strong>No published items</strong>
        <small>Add tables, chairs, or decor from Inventory.</small>
      </div>
    `;
    return;
  }

  const categoryCounts = inventoryItems.reduce((acc, item) => {
    const category = normalizeInventoryCategory(item.category) || "tables";
    acc[category] = (acc[category] || 0) + Number(item.quantity_available || 0);
    return acc;
  }, {});

  dashboardInventorySummary.innerHTML = `
    <div class="dashboard-summary-block">
      <p class="eyebrow">Published Inventory</p>
      <strong>${inventoryItems.length} items</strong>
      <div class="dashboard-inventory-tags">
        ${Object.entries(categoryCounts)
          .slice(0, 5)
          .map(([category, count]) => `<span>${escapeHtml(inventoryCategoryLabel(category))}: ${Number(count)}</span>`)
          .join("")}
      </div>
    </div>
  `;
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

  const formatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" });
  if (calendarMonthLabel) {
    const label = formatter.format(now);
    calendarMonthLabel.textContent = label.charAt(0).toUpperCase() + label.slice(1);
  }

  const weekdayLabels = ["M", "T", "W", "T", "F", "S", "S"];
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

  const upcomingEvents = allEvents
    .filter((event) => {
      const date = eventDateValue(event);
      return date && date >= new Date(year, month, now.getDate());
    })
    .sort((a, b) => eventDateValue(a) - eventDateValue(b))
    .slice(0, 6);

  renderDashboardStats(monthEvents, upcomingEvents);
  renderDashboardSide(upcomingEvents);

  dashboardCalendar.innerHTML = `
    <div class="calendar-grid" aria-label="Monthly calendar">${cells.join("")}</div>
  `;
}

function renderInventory() {
  if (!inventoryList) return;

  renderInventoryCategories();

  if (!inventoryItems.length) {
    inventoryList.innerHTML = '<div class="empty-state">No inventory items yet.</div>';
    renderInventoryDetail(null);
    return;
  }

  const visibleItems =
    activeInventoryCategory === "all"
      ? inventoryItems
      : inventoryItems.filter((item) => normalizeInventoryCategory(item.category) === activeInventoryCategory);

  if (!visibleItems.length) {
    inventoryList.innerHTML = `<div class="empty-state">No items in ${escapeHtml(inventoryCategoryLabel(activeInventoryCategory))}.</div>`;
    renderInventoryDetail(null);
    return;
  }

  if (!visibleItems.some((item) => String(item.id) === String(selectedInventoryId))) {
    selectedInventoryId = visibleItems[0]?.id || "";
  }

  inventoryList.innerHTML = visibleItems
    .map(
      (item) => `
        <article class="inventory-icon-card ${String(item.id) === String(selectedInventoryId) ? "is-selected" : ""}">
          <div class="inventory-card-actions">
            <button type="button" data-edit-inventory="${escapeHtml(item.id)}">Editar</button>
            <button type="button" data-delete-inventory="${escapeHtml(item.id)}">Eliminar</button>
          </div>
          <button class="inventory-card-select" type="button" data-select-inventory="${escapeHtml(item.id)}">
            <span class="inventory-icon-photo">
              ${
                item.image_url
                  ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}">`
                  : `<b>${escapeHtml(inventoryIconForCategory(item.category))}</b>`
              }
            </span>
            <span class="inventory-icon-meta">
              <small>${escapeHtml(inventoryCategoryLabel(item.category))}</small>
              <strong>${escapeHtml(item.name)}</strong>
              <em>${Number(item.quantity_available ?? 0)} disp.</em>
            </span>
          </button>
        </article>
      `
    )
    .join("");

  renderInventoryDetail(visibleItems.find((item) => String(item.id) === String(selectedInventoryId)) || visibleItems[0]);
}

function renderUsers() {
  if (!usersList) return;

  if (!companyUsers.length) {
    usersList.innerHTML = `
      <div class="empty-state">
        No hay usuarios colaboradores todavia. Agrega la empresa y datos legales para usarla en procesos de renta o venta.
      </div>
    `;
    return;
  }

  usersList.innerHTML = companyUsers
    .map(
      (user) => `
        <article class="user-company-card">
          <div class="user-company-avatar">${escapeHtml((user.company_name || user.full_name || "CV").slice(0, 2).toUpperCase())}</div>
          <div class="user-company-main">
            <small>${escapeHtml(user.service_type || "rental")} - ${escapeHtml(user.legal_status || "pending")}</small>
            <strong>${escapeHtml(user.company_name || "Empresa sin nombre")}</strong>
            <p>${escapeHtml(user.full_name || "Colaborador")} ${user.role ? `- ${escapeHtml(user.role)}` : ""}</p>
            <div class="user-company-meta">
              ${user.email ? `<span>${escapeHtml(user.email)}</span>` : ""}
              ${user.phone ? `<span>${escapeHtml(user.phone)}</span>` : ""}
              ${user.tax_id ? `<span>Tax ID: ${escapeHtml(user.tax_id)}</span>` : ""}
            </div>
            ${user.business_address ? `<em>${escapeHtml(user.business_address)}</em>` : ""}
          </div>
          <div class="user-company-actions">
            <button class="secondary-button" type="button" data-edit-user="${escapeHtml(user.id)}">Editar</button>
            <button class="tiny-button" type="button" data-delete-user="${escapeHtml(user.id)}">Eliminar</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderInventoryDetail(item) {
  if (!inventoryDetailPanel) return;

  if (!item) {
    inventoryDetailPanel.innerHTML = `
      <div class="inventory-detail-empty">
        <span aria-hidden="true">INV</span>
        <strong>Select an item</strong>
        <small>Full item details will appear here.</small>
      </div>
    `;
    return;
  }

  inventoryDetailPanel.innerHTML = `
    <div class="inventory-detail-image">
      ${
        item.image_url
          ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}">`
          : `<span>${escapeHtml(inventoryIconForCategory(item.category))}</span>`
      }
    </div>
    <div class="inventory-detail-content">
      <p class="eyebrow">${escapeHtml(inventoryCategoryLabel(item.category))}</p>
      <h3>${escapeHtml(item.name)}</h3>
      <div class="inventory-detail-tags">
        <span>${Number(item.quantity_available ?? 0)} available</span>
        ${item.price_label ? `<span>${escapeHtml(item.price_label)}</span>` : ""}
      </div>
      <p>${escapeHtml(item.description || "No description.")}</p>
      <div class="inventory-actions">
        <button class="secondary-button" type="button" data-edit-inventory="${escapeHtml(item.id)}">Edit</button>
        <button class="tiny-button" type="button" data-delete-inventory="${escapeHtml(item.id)}">Delete</button>
      </div>
    </div>
  `;
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
    .eq("workspace_id", currentWorkspaceId)
    .order("event_date", { ascending: true });

  if (error) {
    setStatus(`Calendar: ${error.message}`);
    allEvents = [];
  } else {
    allEvents = data || [];
  }

  renderCalendar();
}

async function loadInventory() {
  if (!supabase) {
    inventoryItems = localInventoryRows().map(normalizeInventoryItem).filter(Boolean);
    renderInventory();
    renderCalendar();
    setInventoryStatus("Local mode: connect Supabase so buyers can see it on another device.");
    return;
  }

  const { data, error } = await supabase
    .from("cater_providers")
    .select("id,provider_name,provider_type,status,notes,created_at")
    .eq("workspace_id", currentWorkspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    inventoryItems = localInventoryRows().map(normalizeInventoryItem).filter(Boolean);
    renderInventory();
    renderCalendar();
    setInventoryStatus(`Could not read inventory: ${error.message}.`);
    return;
  }

  inventoryItems = (data || []).map(providerToInventory).filter(Boolean);
  savePublicInventory(inventoryItems);
  renderInventory();
  renderCalendar();
  setInventoryStatus("Inventory synced.");
}

async function loadUsers() {
  if (!usersList) return;

  if (!supabase) {
    companyUsers = localUserRows().map(rowToCompanyUser);
    renderUsers();
    setUsersStatus("Modo local: conecta Supabase para sincronizar usuarios.");
    return;
  }

  const { data, error } = await supabase
    .from("cater_collaborators")
    .select("id,full_name,email,phone,role,status,notes,created_at")
    .eq("workspace_id", currentWorkspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    companyUsers = localUserRows().map(rowToCompanyUser);
    renderUsers();
    setUsersStatus(`No se pudieron leer usuarios: ${error.message}.`);
    return;
  }

  companyUsers = (data || []).map(rowToCompanyUser);
  saveLocalUsers(companyUsers);
  renderUsers();
  setUsersStatus("Usuarios sincronizados.");
}

function resetInventoryForm() {
  inventoryForm?.reset();
  if (inventoryItemId) inventoryItemId.value = "";
  setInventoryStatus("");
}

function resetUserForm() {
  userCompanyForm?.reset();
  if (userCompanyId) userCompanyId.value = "";
  setUsersStatus("");
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
  setInventoryStatus("Editing item. Save to update it.");
}

async function deleteInventoryItem(id) {
  if (!window.confirm("Delete this item from inventory?")) return;

  if (!supabase) {
    const nextRows = localInventoryRows().filter((item) => String(item.id) !== String(id));
    saveLocalInventory(nextRows);
    await loadInventory();
    return;
  }

  const { error } = await supabase
    .from("cater_providers")
    .delete()
    .eq("workspace_id", currentWorkspaceId)
    .eq("id", id);

  if (error) {
    setInventoryStatus(error.message);
    return;
  }

  setInventoryStatus("Item deleted.");
  await loadInventory();
}

function editCompanyUser(id) {
  const user = companyUsers.find((row) => String(row.id) === String(id));
  if (!user) return;

  userCompanyId.value = user.id;
  userFullName.value = user.full_name || "";
  userCompanyName.value = user.company_name || "";
  userEmail.value = user.email || "";
  userPhone.value = user.phone || "";
  userServiceType.value = user.service_type || "rental";
  userRole.value = user.role || "staff";
  userTaxId.value = user.tax_id || "";
  userLegalStatus.value = user.legal_status || "pending";
  userBusinessAddress.value = user.business_address || "";
  userCompanyNotes.value = user.company_notes || "";
  scrollToAdminTarget("#usersPanel", "users");
  setUsersStatus("Editando usuario. Guarda para actualizarlo.");
}

async function deleteCompanyUser(id) {
  if (!window.confirm("Eliminar este usuario colaborador?")) return;

  if (!supabase) {
    const nextRows = localUserRows().filter((user) => String(user.id) !== String(id));
    saveLocalUsers(nextRows);
    await loadUsers();
    return;
  }

  const { error } = await supabase
    .from("cater_collaborators")
    .delete()
    .eq("workspace_id", currentWorkspaceId)
    .eq("id", id);

  if (error) {
    setUsersStatus(error.message);
    return;
  }

  setUsersStatus("Usuario eliminado.");
  await loadUsers();
}

async function saveCompanyUser(event) {
  event.preventDefault();

  const userPayload = {
    full_name: userFullName.value.trim(),
    company_name: userCompanyName.value.trim(),
    email: userEmail.value.trim() || null,
    phone: userPhone.value.trim() || null,
    service_type: userServiceType.value || "rental",
    role: userRole.value || "staff",
    tax_id: userTaxId.value.trim() || null,
    legal_status: userLegalStatus.value || "pending",
    business_address: userBusinessAddress.value.trim() || null,
    company_notes: userCompanyNotes.value.trim() || null,
  };

  if (!userPayload.full_name || !userPayload.company_name) {
    setUsersStatus("Agrega el nombre del colaborador y la empresa.");
    return;
  }

  const basePayload = {
    workspace_id: currentWorkspaceId,
    full_name: userPayload.full_name,
    email: userPayload.email,
    phone: userPayload.phone,
    role: userPayload.role,
    status: "active",
    notes: buildUserNotes(userPayload),
  };

  setUsersStatus("Guardando usuario...");

  if (!supabase) {
    const rows = localUserRows();
    const id = userCompanyId.value || `local-user-${Date.now()}`;
    const nextRows = [
      { ...basePayload, id, created_at: new Date().toISOString() },
      ...rows.filter((user) => String(user.id) !== String(id)),
    ];
    saveLocalUsers(nextRows);
    resetUserForm();
    await loadUsers();
    return;
  }

  const id = userCompanyId.value;
  const { error } = id
    ? await supabase
        .from("cater_collaborators")
        .update(basePayload)
        .eq("workspace_id", currentWorkspaceId)
        .eq("id", id)
    : await supabase.from("cater_collaborators").insert(basePayload);

  if (error) {
    setUsersStatus(error.message);
    return;
  }

  resetUserForm();
  setUsersStatus("Usuario guardado.");
  await loadUsers();
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
    workspace_id: currentWorkspaceId,
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
    setInventoryStatus("Select an inventory category.");
    return;
  }

  if (!basePayload.provider_name) {
    setInventoryStatus("Add the item name.");
    return;
  }

  setInventoryStatus("Saving inventory...");

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
          .eq("workspace_id", currentWorkspaceId)
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
  setInventoryStatus("Inventory saved. Buyers can now see it.");
  await loadInventory();
}

async function bootAdmin() {
  renderCalendar();

  if (!isSupabaseConfigured) {
    setStatus("Configure Supabase to sync inventory.");
    await Promise.all([loadInventory(), loadUsers()]);
    return;
  }

  supabase = requireSupabase();
  const { user, profile, membership, workspace } = await getWorkspaceContext();
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
    setStatus(`You do not have permission to access this admin. Detected role: ${currentRole || "no role"}.`);
    return;
  }

  currentWorkspaceId = workspace?.id || membership?.workspace_id || profile?.workspace_id || DEFAULT_WORKSPACE_ID;
  if (dashboardEmail) dashboardEmail.textContent = user.email || "Admin";
  if (dashboardRole) dashboardRole.textContent = roleLabel(currentRole);
  setStatus(user.email || "Admin");

  await Promise.all([loadEvents(), loadInventory(), loadUsers()]);
}

inventoryForm?.addEventListener("submit", saveInventoryItem);
refreshInventoryButton?.addEventListener("click", loadInventory);
resetInventoryButton?.addEventListener("click", resetInventoryForm);
userCompanyForm?.addEventListener("submit", saveCompanyUser);
refreshUsersButton?.addEventListener("click", loadUsers);
resetUserButton?.addEventListener("click", resetUserForm);

inventoryList?.addEventListener("click", (event) => {
  const actionTarget = event.target.closest("[data-edit-inventory], [data-delete-inventory]");
  if (actionTarget) {
    event.preventDefault();
    event.stopPropagation();
    if (actionTarget.dataset.editInventory) editInventoryItem(actionTarget.dataset.editInventory);
    if (actionTarget.dataset.deleteInventory) deleteInventoryItem(actionTarget.dataset.deleteInventory);
    return;
  }

  const target = event.target.closest("[data-select-inventory]");
  if (!target) return;

  selectedInventoryId = target.dataset.selectInventory || "";
  renderInventory();
});

inventoryDetailPanel?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-edit-inventory], [data-delete-inventory]");
  if (!target) return;
  if (target.dataset.editInventory) editInventoryItem(target.dataset.editInventory);
  if (target.dataset.deleteInventory) deleteInventoryItem(target.dataset.deleteInventory);
});

usersList?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-edit-user], [data-delete-user]");
  if (!target) return;
  if (target.dataset.editUser) editCompanyUser(target.dataset.editUser);
  if (target.dataset.deleteUser) deleteCompanyUser(target.dataset.deleteUser);
});

inventoryCategoryBar?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-inventory-category]");
  if (!target) return;
  activeInventoryCategory = target.dataset.inventoryCategory || "all";
  renderInventory();
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
