import {
  DEFAULT_WORKSPACE_ID,
  getEffectiveWorkspaceRole,
  getWorkspaceContext,
  isPendingWorkspaceAccess,
  navigateWithLoopGuard,
  isSupabaseConfigured,
  requireSupabase,
} from "../lib/supabaseClient.js?v=shared-marketplace-workspace-20260707";

const ADMIN_ROLES = new Set(["owner", "admin", "super_admin", "platform_admin"]);
const LOCAL_USERS_KEY = "caterVegasCompanyUsers";
const APPROVER_ROLES = new Set(["owner", "admin", "super_admin", "platform_admin"]);
const INVENTORY_NOTE_PREFIX = "CATER_INVENTORY_JSON:";
const USER_NOTE_PREFIX = "CATER_USER_COMPANY_JSON:";
const INVENTORY_CATEGORY_IDS = ["tables", "chairs", "linen", "decor", "tents", "food", "beverages", "entertainment", "lodging"];
const INVENTORY_STATUS_FILTERS = [
  { id: "approval:pending", label: "Pending", icon: "Pen" },
  { id: "approval:approved", label: "Approved", icon: "Ok" },
  { id: "visibility:public", label: "Public", icon: "Pub" },
  { id: "visibility:private", label: "Private", icon: "Pri" },
];
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
const inventoryImageFile = document.querySelector("#inventoryImageFile");
const inventoryDescription = document.querySelector("#inventoryDescription");
const inventoryStatus = document.querySelector("#inventoryStatus");
const addInventoryButton = document.querySelector("#addInventoryButton");
const inventoryFormTitle = document.querySelector("#inventoryFormTitle");
const inventoryCategoryBar = document.querySelector("#inventoryCategoryBar");
const inventoryList = document.querySelector("#inventoryList");
const inventoryDetailPanel = document.querySelector("#inventoryDetailPanel");
const refreshInventoryButton = document.querySelector("#refreshInventoryButton");
const resetInventoryButton = document.querySelector("#resetInventoryButton");
const eventRequestsList = document.querySelector("#eventRequestsList");
const eventRequestDetailPanel = document.querySelector("#eventRequestDetailPanel");
const refreshRequestsButton = document.querySelector("#refreshRequestsButton");
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
const workspaceRequestsList = document.querySelector("#workspaceRequestsList");
const addUserButton = document.querySelector("#addUserButton");
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
const APPROVAL_LABELS = {
  pending: "Pending Review",
  approved: "Approved",
  rejected: "Rejected",
};
const REQUEST_STATUS_OPTIONS = ["draft", "planning", "confirmed", "completed", "cancelled"];
const EVENT_SELECT_COLUMNS =
  "id,title,event_type,event_date,status,guest_count,notes,plan,created_at,updated_at,customer:cater_customers(id,full_name,email,phone)";

let supabase = null;
let currentUser = null;
let currentRole = "";
let currentWorkspaceId = DEFAULT_WORKSPACE_ID;
let allEvents = [];
let requestEvents = [];
let inventoryItems = [];
let companyUsers = [];
let workspaceMembers = [];
let activeInventoryCategory = "all";
let selectedInventoryId = "";
let selectedRequestId = "";

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

function canReviewInventory() {
  return APPROVER_ROLES.has(currentRole);
}

function approvalLabel(status) {
  return APPROVAL_LABELS[String(status || "pending").trim().toLowerCase()] || "Pending Review";
}

function workspaceStatusLabel(status) {
  return String(status || "pending")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function requestStatusLabel(status) {
  return String(status || "draft")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function creatorLabel(item) {
  return item.created_by_name || item.created_by_email || item.created_by || "Unknown";
}

function profileRoleForMembership(role, status) {
  const normalizedRole = String(role || "collaborator").trim().toLowerCase();
  const normalizedStatus = String(status || "pending").trim().toLowerCase();

  if (normalizedStatus !== "active") {
    if (normalizedRole === "organizer") return "organizer_pending";
    if (normalizedRole === "viewer") return "client_pending";
    return "collaborator_pending";
  }

  if (normalizedRole === "viewer") return "client";
  if (["owner", "admin", "super_admin", "platform_admin", "organizer", "collaborator"].includes(normalizedRole)) {
    return normalizedRole;
  }

  return "collaborator";
}

function providerTypeForCategory(category) {
  return PROVIDER_TYPE_BY_CATEGORY[normalizeInventoryCategory(category)] || "vendor";
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
  const category = normalizeInventoryCategory(row.service_category || meta.category);
  if (!category) return null;
  const creator = row._creator || {};

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
    approved_by: row.approved_by || "",
    approved_at: row.approved_at || "",
    provider_type: row.provider_type || providerTypeForCategory(category),
    created_by: row.created_by || "",
    created_by_email: creator.email || "",
    created_by_name: creator.full_name || "",
    created_at: row.created_at || "",
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
    approval_status: item.approval_status || "pending",
    public_visible: Boolean(item.public_visible),
    created_by: item.created_by || "",
  };
}

function inventoryStatusLabel(status) {
  return String(status || "active")
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function inventoryVisibilityLabel(item) {
  return item?.public_visible ? "Public" : "Private";
}

function inventoryVisibilityCopy(item) {
  return item?.public_visible && String(item?.approval_status || "").toLowerCase() === "approved"
    ? "Visible on public site"
    : "Not public yet";
}

function inventoryFilterLabel(filterId) {
  const statusFilter = INVENTORY_STATUS_FILTERS.find((filter) => filter.id === filterId);
  if (statusFilter) return statusFilter.label;
  return filterId === "all" ? "All" : inventoryCategoryLabel(filterId);
}

function inventoryItemMatchesFilter(item, filterId) {
  if (filterId === "all") return true;
  if (filterId === "approval:pending") return String(item.approval_status || "pending").toLowerCase() === "pending";
  if (filterId === "approval:approved") return String(item.approval_status || "").toLowerCase() === "approved";
  if (filterId === "visibility:public") return Boolean(item.public_visible);
  if (filterId === "visibility:private") return !item.public_visible;
  return normalizeInventoryCategory(item.category) === filterId;
}

function inventoryChipClass(value) {
  const normalized = String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  return normalized ? `is-${normalized}` : "";
}

function renderInventoryCategories() {
  if (!inventoryCategoryBar) return;

  const counts = inventoryItems.reduce(
    (acc, item) => {
      const category = normalizeInventoryCategory(item.category) || "tables";
      acc.all += 1;
      acc[category] = (acc[category] || 0) + 1;
      const approval = String(item.approval_status || "pending").toLowerCase();
      acc[`approval:${approval}`] = (acc[`approval:${approval}`] || 0) + 1;
      acc[item.public_visible ? "visibility:public" : "visibility:private"] =
        (acc[item.public_visible ? "visibility:public" : "visibility:private"] || 0) + 1;
      return acc;
    },
    { all: 0 }
  );

  const categoryFilters = ["all", ...INVENTORY_CATEGORY_IDS];
  const filters = [
    ...categoryFilters.map((id) => ({
      id,
      label: inventoryFilterLabel(id),
      icon: INVENTORY_CATEGORY_ICONS[id] || id.slice(0, 3),
    })),
    ...INVENTORY_STATUS_FILTERS,
  ];

  if (!filters.some((filter) => filter.id === activeInventoryCategory)) {
    activeInventoryCategory = "all";
  }

  inventoryCategoryBar.innerHTML = filters
    .map((filter) => {
      return `
        <button class="inventory-category-chip ${activeInventoryCategory === filter.id ? "is-active" : ""}" type="button" data-inventory-category="${escapeHtml(filter.id)}">
          <span aria-hidden="true">${escapeHtml(filter.icon)}</span>
          <strong>${escapeHtml(filter.label)}</strong>
          <small>${Number(counts[filter.id] || 0)}</small>
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

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not load the image."));
    image.src = dataUrl;
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read the image."));
    reader.readAsDataURL(file);
  });
}

async function fileToDataUrl(file) {
  if (!file) return "";
  if (!String(file.type || "").startsWith("image/")) {
    throw new Error("Choose an image file.");
  }

  const source = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(source);
  const maxWidth = 900;
  const maxHeight = 675;
  const scale = Math.min(1, maxWidth / image.naturalWidth, maxHeight / image.naturalHeight);
  const width = Math.max(1, Math.round(image.naturalWidth * scale));
  const height = Math.max(1, Math.round(image.naturalHeight * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d");
  if (!context) return source;
  context.fillStyle = "#fffdf8";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  return canvas.toDataURL("image/webp", 0.82);
}

function eventDateValue(event) {
  if (!event?.event_date) return null;
  const value = new Date(`${event.event_date}T00:00:00`);
  return Number.isNaN(value.getTime()) ? null : value;
}

function isDashboardEvent(event) {
  return String(event?.status || "").trim().toLowerCase() !== "draft";
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
        <strong>No workspace items</strong>
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
  const pendingCount = inventoryItems.filter((item) => item.approval_status === "pending").length;
  const publicCount = inventoryItems.filter((item) => item.public_visible && item.approval_status === "approved").length;

  dashboardInventorySummary.innerHTML = `
    <div class="dashboard-summary-block">
      <p class="eyebrow">Workspace Inventory</p>
      <strong>${inventoryItems.length} items</strong>
      <small>${pendingCount} pending review · ${publicCount} public</small>
      <div class="dashboard-inventory-tags">
        ${Object.entries(categoryCounts)
          .slice(0, 5)
          .map(([category, count]) => `<span>${escapeHtml(inventoryCategoryLabel(category))}: ${Number(count)}</span>`)
          .join("")}
      </div>
    </div>
  `;
}

function requestPlan(event) {
  return event?.plan && typeof event.plan === "object" ? event.plan : {};
}

function requestCustomer(event) {
  const relatedCustomer = Array.isArray(event?.customer) ? event.customer[0] : event?.customer;
  const contact = requestPlan(event).contact || {};
  return {
    full_name: relatedCustomer?.full_name || contact.full_name || "",
    email: relatedCustomer?.email || contact.email || "",
    phone: relatedCustomer?.phone || contact.phone || "",
  };
}

function isPublicRequest(event) {
  const plan = requestPlan(event);
  return plan.source === "public_index" || String(event?.title || "").startsWith("Public Request - ");
}

function publicRequests() {
  return requestEvents
    .filter(isPublicRequest)
    .slice()
    .sort((a, b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0));
}

function requestCartItems(event) {
  const cart = requestPlan(event).cart;
  return Array.isArray(cart) ? cart : [];
}

function requestCartSummary(event) {
  const items = requestCartItems(event);
  if (!items.length) return "No products listed";
  return items
    .map((item) => `${item.provider_name || "Item"} x${Number(item.quantity || 0)}`)
    .join(", ");
}

function requestSelections(event) {
  const selections = requestPlan(event).selections;
  return selections && typeof selections === "object" && !Array.isArray(selections) ? selections : {};
}

function requestAdminNotes(event) {
  return String(requestPlan(event).admin_notes || "");
}

function formatRequestDate(value) {
  if (!value) return "No date";
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatRequestTimestamp(value) {
  if (!value) return "No timestamp";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function renderEventRequestDetail(event) {
  if (!eventRequestDetailPanel) return;

  if (!event) {
    eventRequestDetailPanel.innerHTML = `
      <div class="request-detail-empty">
        <span aria-hidden="true">RQ</span>
        <strong>Select a request</strong>
        <small>Customer details and requested products will appear here.</small>
      </div>
    `;
    return;
  }

  const customer = requestCustomer(event);
  const items = requestCartItems(event);
  const selections = requestSelections(event);
  const status = String(event.status || "draft").toLowerCase();
  const createdLabel = formatRequestTimestamp(event.created_at);
  const publicNotes = event.notes || requestPlan(event).notes || "";
  const adminNotes = requestAdminNotes(event);
  const selectionEntries = Object.entries(selections).filter(([, selection]) => selection && typeof selection === "object");

  eventRequestDetailPanel.innerHTML = `
    <div class="request-detail-content">
      <p class="eyebrow">Request #${escapeHtml(event.id)} · ${escapeHtml(requestStatusLabel(status))}</p>
      <h3>${escapeHtml(customer.full_name || event.title || "Public request")}</h3>
      <div class="request-detail-tags">
        <span>Request #${escapeHtml(event.id)}</span>
        <span>${escapeHtml(formatRequestDate(event.event_date))}</span>
        <span>${Number(event.guest_count || requestPlan(event).guest_count || 0)} guests</span>
        <span>${escapeHtml(event.event_type || "Event")}</span>
        <span>${escapeHtml(createdLabel)}</span>
      </div>
      <div class="request-contact-grid">
        <span><small>Email</small><strong>${escapeHtml(customer.email || "Not provided")}</strong></span>
        <span><small>Phone</small><strong>${escapeHtml(customer.phone || "Not provided")}</strong></span>
      </div>
      <div class="request-notes">
        <small>Public notes</small>
        <p>${escapeHtml(publicNotes || "No public notes.")}</p>
      </div>
      <form class="request-management-form" data-request-status-form data-request-id="${escapeHtml(event.id)}">
        <label>
          <span>Status</span>
          <select data-request-status-select>
            ${REQUEST_STATUS_OPTIONS.map(
              (option) => `<option value="${escapeHtml(option)}" ${option === status ? "selected" : ""}>${escapeHtml(requestStatusLabel(option))}</option>`
            ).join("")}
          </select>
        </label>
        <button class="primary-button" type="submit">Update Status</button>
      </form>
      <form class="request-management-form request-notes-form" data-request-notes-form data-request-id="${escapeHtml(event.id)}">
        <label>
          <span>Internal admin notes</span>
          <textarea data-request-admin-notes rows="4" placeholder="Add internal notes for Rodi/Admin.">${escapeHtml(adminNotes)}</textarea>
        </label>
        <button class="secondary-button" type="submit">Save Notes</button>
      </form>
      <p class="request-management-status" data-request-management-status aria-live="polite"></p>
      <div class="request-products">
        <small>Selections</small>
        ${
          selectionEntries.length
            ? selectionEntries
                .map(
                  ([category, selection]) => `
                    <article>
                      <strong>${escapeHtml(selection.provider_name || selection.title || "Selected item")}</strong>
                      <span>${escapeHtml(inventoryCategoryLabel(category))} · Qty ${Number(selection.quantity || 0)}</span>
                    </article>
                  `
                )
                .join("")
            : '<p class="empty-state">No selections were saved in the plan.</p>'
        }
      </div>
      <div class="request-products">
        <small>Requested products</small>
        ${
          items.length
            ? items
                .map(
                  (item) => `
                    <article>
                      <strong>${escapeHtml(item.provider_name || "Inventory item")}</strong>
                      <span>${escapeHtml(item.service_category || "inventory")} · Qty ${Number(item.quantity || 0)}</span>
                    </article>
                  `
                )
                .join("")
            : '<p class="empty-state">No requested products were saved in the plan.</p>'
        }
      </div>
    </div>
  `;
}

function renderEventRequests() {
  if (!eventRequestsList) return;

  const requests = publicRequests();
  if (!requests.length) {
    selectedRequestId = "";
    eventRequestsList.innerHTML = '<div class="empty-state">No public quote requests yet.</div>';
    renderEventRequestDetail(null);
    return;
  }

  if (!requests.some((request) => String(request.id) === String(selectedRequestId))) {
    selectedRequestId = requests[0]?.id || "";
  }

  eventRequestsList.innerHTML = requests
    .map((request) => {
      const customer = requestCustomer(request);
      const createdLabel = request.created_at
        ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" }).format(new Date(request.created_at))
        : "No timestamp";
      return `
        <article class="event-request-card ${String(request.id) === String(selectedRequestId) ? "is-selected" : ""}">
          <button class="event-request-select" type="button" data-select-request="${escapeHtml(request.id)}">
            <span class="event-request-status">${escapeHtml(request.status || "draft")}</span>
            <strong>${escapeHtml(customer.full_name || request.title || "Public request")}</strong>
            <small>${escapeHtml(customer.email || "No email")} · ${escapeHtml(customer.phone || "No phone")}</small>
            <em>${escapeHtml(formatRequestDate(request.event_date))} · ${Number(request.guest_count || requestPlan(request).guest_count || 0)} guests</em>
            <p>${escapeHtml(requestCartSummary(request))}</p>
            <time>${escapeHtml(createdLabel)}</time>
          </button>
          <button class="event-request-delete" type="button" data-delete-request="${escapeHtml(request.id)}" aria-label="Delete request ${escapeHtml(request.id)}">Delete</button>
        </article>
      `;
    })
    .join("");

  renderEventRequestDetail(requests.find((request) => String(request.id) === String(selectedRequestId)) || requests[0]);
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

  const visibleItems = inventoryItems.filter((item) => inventoryItemMatchesFilter(item, activeInventoryCategory));

  if (!visibleItems.length) {
    inventoryList.innerHTML = `<div class="empty-state">No items match this filter.</div>`;
    renderInventoryDetail(null);
    return;
  }

  inventoryList.innerHTML = visibleItems
    .map((item) => {
      const approval = String(item.approval_status || "pending").toLowerCase();
      const visibility = item.public_visible ? "public" : "private";
      const status = String(item.status || "active").toLowerCase();
      const reviewActions = canReviewInventory()
        ? `
            ${approval !== "approved" ? `<button class="secondary-button" type="button" data-approve-inventory="${escapeHtml(item.id)}">Approve</button>` : ""}
            ${approval !== "rejected" ? `<button class="tiny-button" type="button" data-reject-inventory="${escapeHtml(item.id)}">Reject</button>` : ""}
            ${
              item.public_visible
                ? `<button class="secondary-button" type="button" data-unpublish-inventory="${escapeHtml(item.id)}">Unpublish</button>`
                : `<button class="secondary-button" type="button" data-publish-inventory="${escapeHtml(item.id)}">Publish</button>`
            }
          `
        : "";

      return `
        <article class="inventory-item-card">
          <div class="inventory-card-media">
            ${
              item.image_url
                ? `<img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.name)}">`
                : `<span>${escapeHtml(inventoryIconForCategory(item.category))}</span>`
            }
          </div>
          <div class="inventory-card-main">
            <div class="inventory-card-topline">
              <span>${escapeHtml(inventoryCategoryLabel(item.category))}</span>
              <strong>${Number(item.quantity_available ?? 0)} available</strong>
            </div>
            <h3>${escapeHtml(item.name || "Untitled item")}</h3>
            <p>${escapeHtml(item.description || "No buyer-facing description yet.")}</p>
            <div class="inventory-card-price">${escapeHtml(item.price_label || "No base price")}</div>
            <div class="inventory-status-chips" aria-label="Inventory status">
              <span class="inventory-state-chip ${inventoryChipClass(approval)}">${escapeHtml(approvalLabel(approval))}</span>
              <span class="inventory-state-chip ${inventoryChipClass(visibility)}">${escapeHtml(inventoryVisibilityLabel(item))}</span>
              <span class="inventory-state-chip ${inventoryChipClass(status)}">${escapeHtml(inventoryStatusLabel(status))}</span>
            </div>
            <div class="inventory-public-note ${item.public_visible && approval === "approved" ? "is-visible" : ""}">
              ${escapeHtml(inventoryVisibilityCopy(item))}
            </div>
            <div class="inventory-card-creator">Created by ${escapeHtml(creatorLabel(item))}</div>
          </div>
          <div class="inventory-card-actions">
            ${reviewActions}
            <button class="secondary-button" type="button" data-edit-inventory="${escapeHtml(item.id)}">Edit</button>
            <button class="tiny-button" type="button" data-delete-inventory="${escapeHtml(item.id)}">Delete</button>
          </div>
        </article>
      `;
    })
    .join("");

  renderInventoryDetail(null);
}

function renderUsers() {
  if (!usersList) return;

  if (!companyUsers.length) {
    usersList.innerHTML = "";
    return;
  }

  usersList.innerHTML = companyUsers
    .map(
      (user) => `
        <article class="user-company-card">
          <div class="user-company-avatar">${escapeHtml((user.company_name || user.full_name || "CV").slice(0, 2).toUpperCase())}</div>
          <div class="user-company-main">
            <small>${escapeHtml(user.service_type || "rental")} - ${escapeHtml(user.legal_status || "pending")}</small>
            <strong>${escapeHtml(user.company_name || "Unnamed company")}</strong>
            <p>${escapeHtml(user.full_name || "Collaborator")} ${user.role ? `- ${escapeHtml(user.role)}` : ""}</p>
            <div class="user-company-meta">
              ${user.email ? `<span>${escapeHtml(user.email)}</span>` : ""}
              ${user.phone ? `<span>${escapeHtml(user.phone)}</span>` : ""}
              ${user.tax_id ? `<span>Tax ID: ${escapeHtml(user.tax_id)}</span>` : ""}
            </div>
            ${user.business_address ? `<em>${escapeHtml(user.business_address)}</em>` : ""}
          </div>
          <div class="user-company-actions">
            <button class="secondary-button" type="button" data-edit-user="${escapeHtml(user.id)}">Edit</button>
            <button class="tiny-button" type="button" data-delete-user="${escapeHtml(user.id)}">Delete</button>
          </div>
        </article>
      `
    )
    .join("");
}

function renderWorkspaceMembers() {
  if (!workspaceRequestsList) return;

  if (!workspaceMembers.length) {
    workspaceRequestsList.innerHTML = '<div class="empty-state">No workspace access requests yet.</div>';
    return;
  }

  workspaceRequestsList.innerHTML = workspaceMembers
    .map((member) => {
      const profile = member.profile || {};
      const displayName = profile.full_name || profile.email || "Workspace user";
      const displayEmail = profile.email || member.user_id;
      const initials = (profile.full_name || profile.email || "CV").slice(0, 2).toUpperCase();
      const role = String(member.role || "collaborator").toLowerCase();
      const status = String(member.status || "pending").toLowerCase();
      const canManageMember = member.user_id !== currentUser?.id && !ADMIN_ROLES.has(role);

      return `
        <article class="user-company-card workspace-member-card">
          <div class="user-company-avatar">${escapeHtml(initials)}</div>
          <div class="user-company-main">
            <small>${escapeHtml(roleLabel(role))} - ${escapeHtml(workspaceStatusLabel(status))}</small>
            <strong>${escapeHtml(displayName)}</strong>
            <p>${escapeHtml(displayEmail)}</p>
            <div class="user-company-meta">
              <span>Workspace: ${escapeHtml(member.workspace_id || DEFAULT_WORKSPACE_ID)}</span>
              <span>${status === "active" ? "Accepted" : status === "disabled" ? "Disabled" : "Awaiting admin review"}</span>
            </div>
          </div>
          <div class="user-company-actions">
            ${
              canManageMember && status !== "active"
                ? `<button class="secondary-button" type="button" data-approve-member="${escapeHtml(member.user_id)}">Approve</button>`
                : ""
            }
            ${
              canManageMember && status !== "disabled"
                ? `<button class="tiny-button" type="button" data-disable-member="${escapeHtml(member.user_id)}">Disable</button>`
                : ""
            }
          </div>
        </article>
      `;
    })
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

  const reviewActions = canReviewInventory()
    ? `
        ${item.approval_status !== "approved" ? `<button class="secondary-button" type="button" data-approve-inventory="${escapeHtml(item.id)}">Approve</button>` : ""}
        ${item.approval_status !== "rejected" ? `<button class="tiny-button" type="button" data-reject-inventory="${escapeHtml(item.id)}">Reject</button>` : ""}
        ${
          item.public_visible
            ? `<button class="secondary-button" type="button" data-unpublish-inventory="${escapeHtml(item.id)}">Unpublish</button>`
            : `<button class="secondary-button" type="button" data-publish-inventory="${escapeHtml(item.id)}">Publish</button>`
        }
      `
    : "";

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
        <span>${escapeHtml(item.status || "active")}</span>
        <span>${escapeHtml(approvalLabel(item.approval_status))}</span>
        <span>${item.public_visible ? "Public" : "Not Public"}</span>
      </div>
      <p>${escapeHtml(item.description || "No description.")}</p>
      <p class="inventory-creator">Created by ${escapeHtml(creatorLabel(item))}</p>
      <div class="inventory-actions">
        ${reviewActions}
        <button class="secondary-button" type="button" data-edit-inventory="${escapeHtml(item.id)}">Edit</button>
        <button class="tiny-button" type="button" data-delete-inventory="${escapeHtml(item.id)}">Delete</button>
      </div>
    </div>
  `;
}

async function loadEvents() {
  if (!supabase) {
    allEvents = [];
    requestEvents = [];
    renderCalendar();
    renderEventRequests();
    return;
  }

  const { data, error } = await supabase
    .from("cater_events")
    .select(EVENT_SELECT_COLUMNS)
    .eq("workspace_id", currentWorkspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    setStatus(`Calendar: ${error.message}`);
    allEvents = [];
    requestEvents = [];
  } else {
    requestEvents = data || [];
    allEvents = requestEvents.filter(isDashboardEvent);
  }

  renderCalendar();
  renderEventRequests();
}

function setRequestManagementStatus(message, type = "") {
  const statusElement = eventRequestDetailPanel?.querySelector("[data-request-management-status]");
  if (!statusElement) return;
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", type === "error");
  statusElement.classList.toggle("is-success", type === "success");
}

function requestById(id) {
  return requestEvents.find((event) => String(event.id) === String(id)) || null;
}

function notificationSummary(results = []) {
  const sent = results.filter((result) => result.status === "sent").map((result) => result.channel.toUpperCase());
  const skipped = results.filter((result) => result.status === "skipped").map((result) => result.channel.toUpperCase());
  const failed = results.filter((result) => result.status === "failed").map((result) => result.channel.toUpperCase());
  if (sent.length) return ` Notification sent by ${sent.join(" and ")}.`;
  if (failed.length) return ` Notification failed for ${failed.join(" and ")}.`;
  if (skipped.length) return " Notification not sent because email/SMS service keys are not configured.";
  return "";
}

async function notifyConfirmedRequest(id, status) {
  if (!supabase || status !== "confirmed") return "";
  const { data, error } = await supabase.functions.invoke("notify-request-status", {
    body: {
      request_id: id,
      workspace_id: currentWorkspaceId,
      status,
    },
  });

  if (error) return ` Notification could not be sent: ${error.message}`;
  return notificationSummary(data?.results || []);
}

async function deleteEventRequest(id) {
  const request = requestById(id);
  const customer = request ? requestCustomer(request) : {};
  const label = customer.full_name || request?.title || `request #${id}`;
  if (!window.confirm(`Delete ${label}? This cannot be undone.`)) return;

  if (!supabase) {
    setRequestManagementStatus("Supabase is required to delete requests.", "error");
    return;
  }

  const { error } = await supabase
    .from("cater_events")
    .delete()
    .eq("workspace_id", currentWorkspaceId)
    .eq("id", id);

  if (error) {
    setRequestManagementStatus(error.message, "error");
    return;
  }

  if (String(selectedRequestId) === String(id)) selectedRequestId = "";
  await loadEvents();
  setStatus("Request deleted.");
}

async function updateEventRequestStatus(id, status) {
  const normalizedStatus = String(status || "").trim().toLowerCase();
  if (!REQUEST_STATUS_OPTIONS.includes(normalizedStatus)) {
    setRequestManagementStatus("Choose a valid request status.", "error");
    return;
  }

  if (!supabase) {
    setRequestManagementStatus("Supabase is required to update requests.", "error");
    return;
  }

  setRequestManagementStatus("Updating request status...");
  const { error } = await supabase
    .from("cater_events")
    .update({ status: normalizedStatus })
    .eq("workspace_id", currentWorkspaceId)
    .eq("id", id);

  if (error) {
    setRequestManagementStatus(error.message, "error");
    return;
  }

  selectedRequestId = id;
  const notificationMessage = await notifyConfirmedRequest(id, normalizedStatus);
  await loadEvents();
  setRequestManagementStatus(`Request status updated to ${requestStatusLabel(normalizedStatus)}.${notificationMessage}`, "success");
}

async function updateEventRequestAdminNotes(id, adminNotes) {
  if (!supabase) {
    setRequestManagementStatus("Supabase is required to update requests.", "error");
    return;
  }

  const request = requestById(id);
  if (!request) {
    setRequestManagementStatus("Request could not be found. Refresh and try again.", "error");
    return;
  }

  const nextPlan = {
    ...requestPlan(request),
    admin_notes: String(adminNotes || "").trim(),
    admin_notes_updated_at: new Date().toISOString(),
    admin_notes_updated_by: currentUser?.id || null,
  };

  setRequestManagementStatus("Saving internal notes...");
  const { error } = await supabase
    .from("cater_events")
    .update({ plan: nextPlan })
    .eq("workspace_id", currentWorkspaceId)
    .eq("id", id);

  if (error) {
    setRequestManagementStatus(error.message, "error");
    return;
  }

  selectedRequestId = id;
  await loadEvents();
  setRequestManagementStatus("Internal notes saved.", "success");
}

async function loadCreatorProfiles(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (!ids.length) return new Map();

  const { data, error } = await supabase
    .from("cater_profiles")
    .select("id,email,full_name")
    .in("id", ids);

  if (error) return new Map();
  return new Map((data || []).map((profile) => [profile.id, profile]));
}

async function loadInventory() {
  if (!supabase) {
    inventoryItems = [];
    renderInventory();
    renderCalendar();
    setInventoryStatus("Supabase is required for workspace inventory.");
    return;
  }

  const { data, error } = await supabase
    .from("cater_providers")
    .select("id,workspace_id,provider_name,provider_type,status,notes,created_at,service_category,public_visible,approval_status,approved_by,approved_at,public_description,image_url,created_by")
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .order("created_at", { ascending: false });

  if (error) {
    inventoryItems = [];
    renderInventory();
    renderCalendar();
    setInventoryStatus(`Could not read inventory: ${error.message}.`);
    return;
  }

  const creatorProfiles = await loadCreatorProfiles((data || []).map((item) => item.created_by));
  inventoryItems = (data || [])
    .map((row) => ({ ...row, _creator: creatorProfiles.get(row.created_by) || null }))
    .map(providerToInventory)
    .filter(Boolean);
  renderInventory();
  renderCalendar();
  setInventoryStatus("Inventory synced.");
}

async function loadUsers() {
  if (!usersList) return;

  if (!supabase) {
    companyUsers = localUserRows().map(rowToCompanyUser);
    renderUsers();
    setUsersStatus("Local mode: connect Supabase to sync users.");
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
    setUsersStatus(`Could not read users: ${error.message}.`);
    return;
  }

  companyUsers = (data || []).map(rowToCompanyUser);
  saveLocalUsers(companyUsers);
  renderUsers();
  setUsersStatus("Users synced.");
}

async function loadWorkspaceMembers() {
  if (!workspaceRequestsList || !supabase) {
    workspaceMembers = [];
    renderWorkspaceMembers();
    return;
  }

  const { data, error } = await supabase
    .from("beoflow_workspace_members")
    .select("workspace_id,user_id,role,status,created_at,updated_at")
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .order("created_at", { ascending: false });

  if (error) {
    workspaceMembers = [];
    renderWorkspaceMembers();
    setUsersStatus(`Could not read workspace access: ${error.message}.`);
    return;
  }

  const profiles = await loadCreatorProfiles((data || []).map((member) => member.user_id));
  workspaceMembers = (data || []).map((member) => ({
    ...member,
    profile: profiles.get(member.user_id) || null,
  }));
  renderWorkspaceMembers();
}

async function loadUserData() {
  await Promise.all([loadWorkspaceMembers(), loadUsers()]);
}

function resetInventoryForm() {
  inventoryForm?.reset();
  if (inventoryItemId) inventoryItemId.value = "";
  if (inventoryImageFile) inventoryImageFile.value = "";
  setInventoryStatus("");
  setInventoryFormOpen(false, "new");
}

function setInventoryFormOpen(isOpen, mode = "new") {
  inventoryForm?.classList.toggle("is-open", isOpen);
  inventoryForm?.setAttribute("aria-hidden", String(!isOpen));
  if (inventoryForm) inventoryForm.dataset.mode = mode;
  addInventoryButton?.classList.toggle("is-active", isOpen);
  addInventoryButton?.setAttribute("aria-expanded", String(isOpen));
  if (addInventoryButton) addInventoryButton.textContent = isOpen ? "Close Form" : "Add Item";
  if (inventoryFormTitle) inventoryFormTitle.textContent = mode === "edit" ? "Edit Item" : "Add Item";
}

function openNewInventoryForm() {
  inventoryForm?.reset();
  if (inventoryItemId) inventoryItemId.value = "";
  if (inventoryImageFile) inventoryImageFile.value = "";
  setInventoryStatus("");
  setInventoryFormOpen(true, "new");
}

function resetUserForm() {
  userCompanyForm?.reset();
  if (userCompanyId) userCompanyId.value = "";
  setUsersStatus("");
  setUserFormOpen(false);
}

function setUserFormOpen(isOpen) {
  userCompanyForm?.classList.toggle("is-open", isOpen);
  userCompanyForm?.setAttribute("aria-hidden", String(!isOpen));
  addUserButton?.classList.toggle("is-active", isOpen);
  addUserButton?.setAttribute("aria-expanded", String(isOpen));
}

function openNewUserForm() {
  userCompanyForm?.reset();
  if (userCompanyId) userCompanyId.value = "";
  setUsersStatus("");
  setUserFormOpen(true);
}

function editInventoryItem(id) {
  const item = inventoryItems.find((row) => String(row.id) === String(id));
  if (!item) return;

  inventoryItemId.value = item.id;
  inventoryName.value = item.name || "";
  inventoryCategory.value = normalizeInventoryCategory(item.category) || "tables";
  inventoryQuantity.value = Number(item.quantity_available ?? 0);
  inventoryPrice.value = item.price_label || "";
  if (inventoryImageFile) inventoryImageFile.value = "";
  inventoryDescription.value = item.description || "";
  setInventoryFormOpen(true, "edit");
  scrollToAdminTarget("#inventoryPanel", "inventory");
  setInventoryStatus("Editing item. Save to update it.");
}

async function deleteInventoryItem(id) {
  if (!window.confirm("Delete this item from inventory?")) return;

  if (!supabase) {
    setInventoryStatus("Supabase is required for workspace inventory.");
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

  await loadInventory();
  setInventoryStatus("Item deleted.");
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
  setUserFormOpen(true);
  scrollToAdminTarget("#usersPanel", "users");
  setUsersStatus("Editing user. Save to update it.");
}

async function deleteCompanyUser(id) {
  if (!window.confirm("Delete this collaborator user?")) return;

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

  setUsersStatus("User deleted.");
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
    setUsersStatus("Add the collaborator name and company.");
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

  setUsersStatus("Saving user...");

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
  setUsersStatus("User saved.");
  await loadUsers();
}

async function updateWorkspaceMember(userId, status) {
  const member = workspaceMembers.find((item) => item.user_id === userId);
  const role = String(member?.role || "collaborator").trim().toLowerCase() || "collaborator";
  const profileRole = profileRoleForMembership(role, status);

  setUsersStatus("Updating workspace access...");

  const { error: memberError } = await supabase
    .from("beoflow_workspace_members")
    .update({ role, status })
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .eq("user_id", userId);

  if (memberError) {
    setUsersStatus(memberError.message);
    return;
  }

  const { error: profileError } = await supabase
    .from("cater_profiles")
    .update({
      workspace_id: DEFAULT_WORKSPACE_ID,
      role: profileRole,
    })
    .eq("id", userId);

  if (profileError) {
    setUsersStatus(profileError.message);
    return;
  }

  setUsersStatus(status === "active" ? "Workspace access approved." : "Workspace access disabled.");
  await loadWorkspaceMembers();
}

async function saveInventoryItem(event) {
  event.preventDefault();

  let fileImage = "";
  try {
    fileImage = await fileToDataUrl(inventoryImageFile?.files?.[0]);
  } catch (error) {
    setInventoryStatus(error.message || "Could not prepare the image.");
    return;
  }

  const selectedCategory = normalizeInventoryCategory(inventoryCategory.value);
  const id = inventoryItemId.value;
  const existingItem = id ? inventoryItems.find((row) => String(row.id) === String(id)) : null;
  const itemPayload = {
    category: selectedCategory,
    quantity_available: Number(inventoryQuantity.value || 0),
    price_label: inventoryPrice.value.trim() || null,
    image_url: fileImage || existingItem?.image_url || null,
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
    setInventoryStatus("Supabase is required for workspace inventory.");
    return;
  }

  const isReviewer = canReviewInventory();
  const insertPayload = {
    ...payload,
    approval_status: isReviewer ? "approved" : "pending",
    public_visible: false,
    approved_by: isReviewer ? currentUser?.id || null : null,
    approved_at: isReviewer ? new Date().toISOString() : null,
    created_by: currentUser?.id || null,
  };
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
          .insert(nextPayload)
          .select()
          .single();

  const { error } = await savePayload(id ? payload : insertPayload);

  if (error) {
    setInventoryStatus(error.message);
    return;
  }

  await loadInventory();
  resetInventoryForm();
  setInventoryStatus(id ? "Inventory updated." : "Inventory saved.");
}

async function updateInventoryReview(id, patch, successMessage) {
  if (!canReviewInventory()) {
    setInventoryStatus("Only admins can review or publish inventory.");
    return;
  }

  if (!supabase) {
    setInventoryStatus("Supabase is required for workspace inventory.");
    return;
  }

  const { error } = await supabase
    .from("cater_providers")
    .update(patch)
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .eq("id", id);

  if (error) {
    setInventoryStatus(error.message);
    return;
  }

  await loadInventory();
  setInventoryStatus(successMessage);
}

async function bootAdmin() {
  renderCalendar();

  if (!isSupabaseConfigured) {
    setStatus("Configure Supabase to sync inventory.");
    await Promise.all([loadInventory(), loadUserData()]);
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

  currentWorkspaceId = DEFAULT_WORKSPACE_ID;
  if (dashboardEmail) dashboardEmail.textContent = user.email || "Admin";
  if (dashboardRole) dashboardRole.textContent = roleLabel(currentRole);
  setStatus(user.email || "Admin");

  await Promise.all([loadEvents(), loadInventory(), loadUserData()]);
}

inventoryForm?.addEventListener("submit", saveInventoryItem);
addInventoryButton?.addEventListener("click", () => {
  if (inventoryForm?.classList.contains("is-open")) {
    resetInventoryForm();
    return;
  }
  openNewInventoryForm();
});
refreshInventoryButton?.addEventListener("click", loadInventory);
resetInventoryButton?.addEventListener("click", resetInventoryForm);
refreshRequestsButton?.addEventListener("click", loadEvents);
userCompanyForm?.addEventListener("submit", saveCompanyUser);
refreshUsersButton?.addEventListener("click", loadUserData);
addUserButton?.addEventListener("click", () => {
  if (userCompanyForm?.classList.contains("is-open")) {
    resetUserForm();
    return;
  }
  openNewUserForm();
});
resetUserButton?.addEventListener("click", resetUserForm);

inventoryList?.addEventListener("click", (event) => {
  const actionTarget = event.target.closest(
    "[data-edit-inventory], [data-delete-inventory], [data-approve-inventory], [data-reject-inventory], [data-publish-inventory], [data-unpublish-inventory]"
  );
  if (actionTarget) {
    event.preventDefault();
    event.stopPropagation();
    if (actionTarget.dataset.editInventory) editInventoryItem(actionTarget.dataset.editInventory);
    if (actionTarget.dataset.deleteInventory) deleteInventoryItem(actionTarget.dataset.deleteInventory);
    if (actionTarget.dataset.approveInventory) {
      updateInventoryReview(
        actionTarget.dataset.approveInventory,
        { approval_status: "approved", approved_by: currentUser?.id || null, approved_at: new Date().toISOString() },
        "Item approved."
      );
    }
    if (actionTarget.dataset.rejectInventory) {
      updateInventoryReview(
        actionTarget.dataset.rejectInventory,
        { approval_status: "rejected", public_visible: false, approved_by: null, approved_at: null },
        "Item rejected and hidden from the public catalog."
      );
    }
    if (actionTarget.dataset.publishInventory) {
      updateInventoryReview(
        actionTarget.dataset.publishInventory,
        { approval_status: "approved", public_visible: true, status: "active", approved_by: currentUser?.id || null, approved_at: new Date().toISOString() },
        "Item approved and published."
      );
    }
    if (actionTarget.dataset.unpublishInventory) {
      updateInventoryReview(actionTarget.dataset.unpublishInventory, { public_visible: false }, "Item unpublished.");
    }
    return;
  }

  const target = event.target.closest("[data-select-inventory]");
  if (!target) return;

  selectedInventoryId = target.dataset.selectInventory || "";
  renderInventory();
});

inventoryDetailPanel?.addEventListener("click", (event) => {
  const target = event.target.closest(
    "[data-edit-inventory], [data-delete-inventory], [data-approve-inventory], [data-reject-inventory], [data-publish-inventory], [data-unpublish-inventory]"
  );
  if (!target) return;
  if (target.dataset.editInventory) editInventoryItem(target.dataset.editInventory);
  if (target.dataset.deleteInventory) deleteInventoryItem(target.dataset.deleteInventory);
  if (target.dataset.approveInventory) {
    updateInventoryReview(
      target.dataset.approveInventory,
      { approval_status: "approved", approved_by: currentUser?.id || null, approved_at: new Date().toISOString() },
      "Item approved."
    );
  }
  if (target.dataset.rejectInventory) {
    updateInventoryReview(
      target.dataset.rejectInventory,
      { approval_status: "rejected", public_visible: false, approved_by: null, approved_at: null },
      "Item rejected and hidden from the public catalog."
    );
  }
  if (target.dataset.publishInventory) {
    updateInventoryReview(
      target.dataset.publishInventory,
      { approval_status: "approved", public_visible: true, status: "active", approved_by: currentUser?.id || null, approved_at: new Date().toISOString() },
      "Item approved and published."
    );
  }
  if (target.dataset.unpublishInventory) {
    updateInventoryReview(target.dataset.unpublishInventory, { public_visible: false }, "Item unpublished.");
  }
});

eventRequestsList?.addEventListener("click", (event) => {
  const deleteTarget = event.target.closest("[data-delete-request]");
  if (deleteTarget) {
    deleteEventRequest(deleteTarget.dataset.deleteRequest);
    return;
  }

  const target = event.target.closest("[data-select-request]");
  if (!target) return;
  selectedRequestId = target.dataset.selectRequest || "";
  renderEventRequests();
});

eventRequestDetailPanel?.addEventListener("submit", (event) => {
  const statusForm = event.target.closest("[data-request-status-form]");
  const notesForm = event.target.closest("[data-request-notes-form]");
  if (!statusForm && !notesForm) return;

  event.preventDefault();

  if (statusForm) {
    const id = statusForm.dataset.requestId || selectedRequestId;
    const status = statusForm.querySelector("[data-request-status-select]")?.value || "";
    updateEventRequestStatus(id, status);
  }

  if (notesForm) {
    const id = notesForm.dataset.requestId || selectedRequestId;
    const adminNotes = notesForm.querySelector("[data-request-admin-notes]")?.value || "";
    updateEventRequestAdminNotes(id, adminNotes);
  }
});

usersList?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-edit-user], [data-delete-user]");
  if (!target) return;
  if (target.dataset.editUser) editCompanyUser(target.dataset.editUser);
  if (target.dataset.deleteUser) deleteCompanyUser(target.dataset.deleteUser);
});

workspaceRequestsList?.addEventListener("click", (event) => {
  const target = event.target.closest("[data-approve-member], [data-disable-member]");
  if (!target) return;
  if (target.dataset.approveMember) updateWorkspaceMember(target.dataset.approveMember, "active");
  if (target.dataset.disableMember) updateWorkspaceMember(target.dataset.disableMember, "disabled");
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
