const stepIds = ["calendar", "event-type", "setup", "inventory", "fnb", "entertainment", "lodging", "review", "about", "contact"];
const setupCategoryIds = ["tables", "chairs", "linen", "decor", "tents"];
const flowCategoryIds = ["tables", "chairs", "linen", "decor", "tents", "food", "beverages", "entertainment", "lodging"];
const storageKey = "caterVegasBuild";
const INVENTORY_NOTE_PREFIX = "CATER_INVENTORY_JSON:";
const notesCategoryLabel = "Inventory category";

const categoryCopy = {
  tables: {
    label: "Tables",
    savedLabel: "Selected table",
    title: "Choose your table",
    copy: "Select the table first. Chair recommendations can use this choice, but chairs remain browseable.",
    empty: "No tables added yet",
    step: "Set up",
  },
  chairs: {
    label: "Chairs",
    savedLabel: "Selected chairs",
    title: "Choose your chairs",
    copy: "Choose a table first to recommend matching chairs. You can still view available chairs.",
    empty: "No chairs added yet",
    step: "Set up",
  },
  linen: {
    label: "Linen",
    savedLabel: "Selected linen",
    title: "Choose your linen",
    copy: "Select linen colors, textures or rental packages for the event setup.",
    empty: "No linen added yet",
    step: "Set up",
  },
  decor: {
    label: "Decor",
    savedLabel: "Selected decor",
    title: "Choose your decor",
    copy: "Select decor pieces, accents or production elements.",
    empty: "No decor added yet",
    step: "Set up",
  },
  tents: {
    label: "Tents",
    savedLabel: "Selected tents",
    title: "Choose your tents",
    copy: "Select tenting or outdoor coverage options.",
    empty: "No tents added yet",
    step: "Set up",
  },
  food: {
    label: "Food",
    savedLabel: "Selected food",
    title: "Choose food",
    copy: "Select food providers, menus or catering packages.",
    empty: "No food added yet",
    step: "F&B",
  },
  beverages: {
    label: "Beverages",
    savedLabel: "Selected beverages",
    title: "Choose beverages",
    copy: "Select bar, beverage or service packages.",
    empty: "No beverages added yet",
    step: "F&B",
  },
  entertainment: {
    label: "Entertainment",
    savedLabel: "Selected entertainment",
    title: "Choose entertainment",
    copy: "Select talent, music or production support.",
    empty: "No entertainment added yet",
    step: "Entertainment",
  },
  lodging: {
    label: "Lodging",
    savedLabel: "Selected lodging",
    title: "Choose lodging",
    copy: "Select hotel, suite or guest stay support.",
    empty: "No lodging added yet",
    step: "Lodging",
  },
};

const categoryAliases = {
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
  chef: "food",
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

const providerTypeByCategory = {
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

let publicInventory = [];
let activeCategory = "";
let build = loadBuild();
let supabaseClientPromise = null;
let inventoryLoadError = "";
let pricingRules = {
  weekday_markup_percent: 0,
  weekend_markup_percent: 20,
  holiday_markup_percent: 40,
  holiday_dates: ["01-01", "05-25", "07-04", "09-07", "11-26", "12-25"],
};

const publicRequestForm = document.getElementById("publicRequestForm");
const requestFullName = document.getElementById("requestFullName");
const requestEmail = document.getElementById("requestEmail");
const requestPhone = document.getElementById("requestPhone");
const requestGuestCount = document.getElementById("requestGuestCount");
const requestNotes = document.getElementById("requestNotes");
const requestStatus = document.getElementById("requestStatus");
const requestSubmitButton = document.getElementById("requestSubmitButton");

async function getPublicSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("./lib/supabaseClient.js?v=shared-marketplace-workspace-20260707")
      .then((module) => {
        return {
          workspaceId: module.DEFAULT_WORKSPACE_ID,
          isConfigured: module.isSupabaseConfigured,
          client: module.supabase,
        };
      })
      .catch(() => ({
        workspaceId: "cater-vegas",
        isConfigured: false,
        client: null,
      }));
  }

  return supabaseClientPromise;
}

function loadBuild() {
  const fallback = {
    eventDate: "",
    eventType: "",
    selections: {},
    cart: {},
  };

  try {
    const saved = JSON.parse(window.localStorage.getItem(storageKey) || "{}");
    if (saved.table && !saved.selections?.tables) {
      saved.selections = {
        ...(saved.selections || {}),
        tables: {
          id: "legacy-table",
          title: saved.table,
          note: saved.tableNote || "",
        },
      };
    }
    return {
      ...fallback,
      ...saved,
      selections: saved.selections || fallback.selections,
      cart: saved.cart || fallback.cart,
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return fallback;
  }
}

function saveBuild() {
  window.localStorage.setItem(storageKey, JSON.stringify(build));
}

function defaultSelectedEventDate() {
  const selectedDay = document.querySelector(".calendar-grid button.is-selected")?.textContent.trim() || "18";
  const month = document.querySelector(".month-name")?.textContent.trim() || "June";
  const year = document.querySelector(".month-year")?.textContent.trim() || "2026";
  return `${month} ${selectedDay}, ${year}`;
}

function ensureBuildDefaults() {
  let changed = false;

  if (!build.eventDate) {
    build.eventDate = defaultSelectedEventDate();
    changed = true;
  }

  if (!build.eventType) {
    build.eventType = "Set up";
    changed = true;
  }

  if (changed) saveBuild();
}

function normalizeHolidayDates(value) {
  if (Array.isArray(value)) return value.map((item) => String(item).trim()).filter(Boolean);
  return String(value || "")
    .split(/[\s,]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function datePricingContext() {
  const iso = selectedEventDateIso();
  if (!iso) return { type: "weekday", markupPercent: Number(pricingRules.weekday_markup_percent || 0), iso: "" };
  const [, month, day] = iso.split("-");
  const holidayTokens = normalizeHolidayDates(pricingRules.holiday_dates);
  const isHoliday = holidayTokens.includes(iso) || holidayTokens.includes(`${month}-${day}`);
  const date = new Date(`${iso}T00:00:00`);
  const dayOfWeek = date.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
  const type = isHoliday ? "holiday" : isWeekend ? "weekend" : "weekday";
  const markupPercent = Number(
    type === "holiday"
      ? pricingRules.holiday_markup_percent
      : type === "weekend"
        ? pricingRules.weekend_markup_percent
        : pricingRules.weekday_markup_percent
  ) || 0;
  return { type, markupPercent, iso };
}

function adjustedUnitPrice(basePrice) {
  const base = Number(basePrice || 0);
  const { markupPercent } = datePricingContext();
  return Math.round(base * (1 + markupPercent / 100) * 100) / 100;
}

function cartItems() {
  return Object.values(build.cart || {})
    .filter((item) => Number(item.quantity) > 0)
    .map((item) => {
      const baseUnitPrice = Number(item.base_unit_price ?? item.unit_price ?? 0);
      return {
        ...item,
        base_unit_price: baseUnitPrice,
        unit_price: adjustedUnitPrice(baseUnitPrice),
        price_adjustment: datePricingContext(),
      };
    });
}

function providerIdValue(id) {
  const numericId = Number(id);
  return Number.isFinite(numericId) ? numericId : id;
}

function publicRequestStatus(message, type = "") {
  if (!requestStatus) return;
  requestStatus.textContent = message;
  requestStatus.classList.toggle("is-error", type === "error");
  requestStatus.classList.toggle("is-success", type === "success");
}

function clearPendingPaymentOrder() {
  if (publicRequestForm) delete publicRequestForm.dataset.pendingEventId;
}

function selectedEventDateIso() {
  const raw = String(build.eventDate || "").trim();
  if (!raw) return "";
  const match = /^([A-Za-z]+)\s+(\d{1,2}),\s*(\d{4})$/.exec(raw);
  const monthNames = {
    january: "01",
    february: "02",
    march: "03",
    april: "04",
    may: "05",
    june: "06",
    july: "07",
    august: "08",
    september: "09",
    october: "10",
    november: "11",
    december: "12",
  };

  if (match) {
    const [, monthName, day, year] = match;
    const month = monthNames[monthName.toLowerCase()];
    if (month) return `${year}-${month}-${String(day).padStart(2, "0")}`;
  }

  const parsed = new Date(`${raw} 00:00:00`);
  if (Number.isNaN(parsed.getTime())) return "";
  return parsed.toISOString().slice(0, 10);
}

function requestPlanPayload(formValues = {}) {
  const items = cartItems();
  const estimatedTotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  const cart = items.map((item) => ({
    provider_id: providerIdValue(item.id),
    provider_name: item.title,
    service_category: item.category,
    quantity: Number(item.quantity || 0),
    unit_price: Number(item.unit_price || 0),
    price_label: item.price_label || "",
    subtotal: Number(item.quantity || 0) * Number(item.unit_price || 0),
    note: item.note || "",
  }));

  const selections = Object.fromEntries(
    Object.entries(build.selections || {}).map(([category, selection]) => {
      const matchingCartItem = items.find((item) => item.category === category && String(item.id) === String(selection?.id));
      return [
        category,
        {
          provider_id: providerIdValue(selection?.id || matchingCartItem?.id || ""),
          provider_name: selection?.title || matchingCartItem?.title || "",
          quantity: Number(matchingCartItem?.quantity || 0),
          note: selection?.note || matchingCartItem?.note || "",
        },
      ];
    })
  );

  return {
    source: "public_index",
    submitted_at: new Date().toISOString(),
    selected_date: selectedEventDateIso(),
    event_type: build.eventType || "Event Order",
    contact: {
      full_name: formValues.fullName || "",
      email: formValues.email || "",
      phone: formValues.phone || "",
    },
    guest_count: Number(formValues.guestCount || 0),
    notes: formValues.notes || "",
    estimated_total: estimatedTotal,
    pricing: datePricingContext(),
    cart,
    selections,
  };
}

function updateRequestFormState() {
  const items = cartItems();
  if (!requestSubmitButton) return;
  const isSubmitted = publicRequestForm?.dataset.submitted === "true";
  const estimatedTotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  requestSubmitButton.disabled = isSubmitted || !items.length;
  if (!items.length) {
    requestSubmitButton.textContent = "Pay with card";
    publicRequestStatus("Add at least one item before payment.");
  } else {
    requestSubmitButton.textContent = estimatedTotal ? `Pay ${formatMoney(estimatedTotal)} with card` : "Pay with card";
  }

  if (items.length && requestStatus?.textContent === "Add at least one item before payment.") {
    publicRequestStatus("");
  }
}

function checkoutErrorMessage(error, data) {
  const message = String(error?.message || data?.error || "").trim();
  const normalized = message.toLowerCase();
  if (
    normalized.includes("failed to send a request") ||
    normalized.includes("edge function") ||
    normalized.includes("function not found") ||
    normalized.includes("not configured")
  ) {
    return "Card checkout is not active yet. Stripe must be deployed before payment can open.";
  }
  return message || "Could not open card checkout. Please try again.";
}

async function submitPublicPayment(event) {
  event.preventDefault();

  if (!publicRequestForm) return;

  if (!cartItems().length) {
    publicRequestStatus("Add at least one item before payment.", "error");
    updateRequestFormState();
    return;
  }

  if (!publicRequestForm.reportValidity()) return;

  const eventDate = selectedEventDateIso();
  if (!eventDate) {
    publicRequestStatus("Choose a valid event date before payment.", "error");
    return;
  }

  const fullName = requestFullName?.value.trim() || "";
  const email = requestEmail?.value.trim() || "";
  const phone = requestPhone?.value.trim() || "";
  const guestCount = Number(requestGuestCount?.value || 0);
  const notes = requestNotes?.value.trim() || "";

  const formValues = { fullName, email, phone, guestCount, notes };
  const plan = {
    ...requestPlanPayload(formValues),
    payment_status: "payment_pending",
  };
  const { isConfigured, client } = await getPublicSupabaseClient();

  if (!isConfigured || !client) {
    publicRequestStatus("Payment is not configured yet. Please email Cater Vegas directly.", "error");
    return;
  }

  const baseUrl = `${window.location.origin}${window.location.pathname}`;
  publicRequestForm.dataset.submitted = "false";
  const existingOrderId = Number(publicRequestForm.dataset.pendingEventId || 0);
  publicRequestStatus(existingOrderId ? `Order #${existingOrderId} is pending. Opening secure payment...` : "Saving your order...");
  requestSubmitButton.disabled = true;
  requestSubmitButton.textContent = existingOrderId ? "Opening checkout..." : "Saving order...";

  let orderId = existingOrderId;
  if (!orderId) {
    const { data: orderData, error: orderError } = await client.rpc("cater_submit_public_request", {
      p_full_name: fullName,
      p_email: email,
      p_phone: phone || null,
      p_guest_count: guestCount,
      p_notes: notes || null,
      p_event_date: eventDate,
      p_event_type: build.eventType || "Event Order",
      p_plan: plan,
    });

    if (orderError || !orderData?.event_id) {
      publicRequestStatus(orderError?.message || "Could not save the order. Please try again.", "error");
      updateRequestFormState();
      return;
    }

    orderId = Number(orderData.event_id);
    publicRequestForm.dataset.pendingEventId = String(orderId);
  }

  publicRequestStatus(`Order #${orderId} saved as pending. Opening secure payment...`);
  requestSubmitButton.textContent = "Opening checkout...";

  const { data, error } = await client.functions.invoke("create-checkout-session", {
    body: {
      event_id: orderId,
      full_name: fullName,
      email,
      phone: phone || null,
      guest_count: guestCount,
      notes: notes || null,
      event_date: eventDate,
      event_type: build.eventType || "Event Order",
      plan,
      success_url: `${baseUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}#review`,
      cancel_url: `${baseUrl}?payment=cancelled#review`,
    },
  });

  if (error || !data?.checkout_url) {
    publicRequestStatus(`Order #${orderId} is pending in admin. ${checkoutErrorMessage(error, data)}`, "error");
    updateRequestFormState();
    return;
  }

  publicRequestForm.dataset.submitted = "true";
  requestSubmitButton.textContent = "Redirecting...";
  publicRequestStatus("Redirecting to secure payment...", "success");
  window.location.href = data.checkout_url;
}

function syncPaymentReturnState() {
  if (!requestStatus) return;
  const searchParams = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(String(window.location.hash || "").split("?")[1] || "");
  const paymentState = searchParams.get("payment") || hashParams.get("payment");
  if (paymentState === "success") {
    publicRequestStatus("Payment received. Your order is being confirmed.", "success");
  } else if (paymentState === "cancelled") {
    publicRequestStatus("Payment was cancelled. You can review and pay when ready.", "error");
    publicRequestForm?.removeAttribute("data-submitted");
    updateRequestFormState();
  }
}

function itemQuantityAvailable(item) {
  const meta = providerMeta(item);
  return Number(item.quantity_available ?? meta.quantity_available ?? item.available_quantity ?? 0);
}

function itemPriceLabel(item) {
  const meta = providerMeta(item);
  const label = String(item.price_label || meta.price_label || "").trim();
  if (/^\d+(?:\.\d+)?$/.test(label)) return formatMoney(Number(label));
  return label;
}

function itemUnitPrice(item) {
  const rawPrice = item.unit_price ?? item.base_price ?? item.price ?? itemPriceLabel(item);
  const normalized = String(rawPrice || "").replace(/,/g, "").match(/\d+(?:\.\d+)?/);
  return normalized ? Number(normalized[0]) : 0;
}

function formatMoney(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Number.isInteger(Number(value)) ? 0 : 2,
  }).format(Number(value || 0));
}

function cartQuantity(itemId) {
  return Number(build.cart?.[itemId]?.quantity || 0);
}

function setCartQuantity(item, quantity) {
  if (!item) return;
  const available = itemQuantityAvailable(item);
  const requestedQuantity = Math.max(0, Number(quantity || 0));
  const nextQuantity = available ? Math.min(requestedQuantity, available) : requestedQuantity;
  build.cart = build.cart || {};

  if (!nextQuantity) {
    delete build.cart[item.id];
  } else {
    const baseUnitPrice = itemUnitPrice(item);
    build.cart[item.id] = {
      id: item.id,
      category: item.category,
      title: itemTitle(item),
      note: itemNote(item),
      image_url: itemImage(item),
      quantity: nextQuantity,
      price_label: itemPriceLabel(item),
      base_unit_price: baseUnitPrice,
      unit_price: adjustedUnitPrice(baseUnitPrice),
    };
  }

  saveBuild();
  clearPendingPaymentOrder();
}

function normalizeInventoryCategory(value) {
  const normalized = String(value || "").trim().toLowerCase().replace(/[\s_]+/g, "-");
  return categoryAliases[normalized] || "";
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

function notesCategory(notes = "") {
  const categoryLine = String(notes || "")
    .split(/\r?\n/)
    .find((line) => line.trim().toLowerCase().startsWith(`${notesCategoryLabel.toLowerCase()}:`));
  if (!categoryLine) return "";
  return normalizeInventoryCategory(categoryLine.split(":").slice(1).join(":"));
}

function cleanProviderNotes(notes = "") {
  const raw = String(notes || "");
  if (raw.startsWith(INVENTORY_NOTE_PREFIX)) return "";
  return raw
    .split(/\r?\n/)
    .filter((line) => !line.trim().toLowerCase().startsWith(`${notesCategoryLabel.toLowerCase()}:`))
    .join("\n")
    .trim();
}

function providerMeta(provider) {
  return parseInventoryNotes(provider?.notes) || {};
}

function providerCategory(provider) {
  const meta = providerMeta(provider);
  return normalizeInventoryCategory(
    provider?.service_category ||
      provider?.category ||
      provider?.inventory_type ||
      provider?.type ||
      meta.category ||
      notesCategory(provider?.notes) ||
      provider?.provider_type
  );
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function itemTitle(item) {
  return item.provider_name || item.title || item.name || "Inventory item";
}

function itemNote(item) {
  const meta = providerMeta(item);
  return item.public_description || meta.description || cleanProviderNotes(item.notes) || meta.price_label || providerTypeByCategory[item.category] || "";
}

function itemImage(item) {
  const meta = providerMeta(item);
  return item.image_url || meta.image_url || "";
}

function nextStepForCategory(category) {
  if (setupCategoryIds.includes(category)) return "fnb";
  if (category === "food" || category === "beverages") return "entertainment";
  if (category === "entertainment") return "lodging";
  return "review";
}

function updateBreadcrumb(container, category = activeCategory) {
  if (!container) return;
  const categoryLabel = categoryCopy[category]?.label || "Category";
  const crumbs = ["Date", "Event Type", "Set up"];

  if (setupCategoryIds.includes(category)) {
    if (category === "chairs") crumbs.push("Tables");
    crumbs.push(categoryLabel);
  } else {
    crumbs.push("F&B");
    if (category === "entertainment" || category === "lodging") crumbs.push("Entertainment");
    if (category === "lodging") crumbs.push("Lodging");
  }

  container.innerHTML = crumbs
    .map((crumb, index) => (index === crumbs.length - 1 ? `<strong>${escapeHtml(crumb)}</strong>` : `<span>${escapeHtml(crumb)}</span>`))
    .join("");
}

function parseHashRoute(hash = window.location.hash) {
  const rawHash = String(hash || "").replace(/^#/, "");
  const [stepPart, queryPart = ""] = rawHash.split("?");
  const params = new URLSearchParams(queryPart);
  const category = normalizeInventoryCategory(params.get("category"));

  return {
    stepId: stepPart || "calendar",
    category,
  };
}

function routeHashForStep(stepId, category = activeCategory) {
  if (stepId === "inventory" && category) {
    return `#inventory?category=${encodeURIComponent(category)}`;
  }

  return `#${stepId}`;
}

function showStep(stepId, category = "") {
  const routeCategory = normalizeInventoryCategory(category);
  if (routeCategory) activeCategory = routeCategory;
  const activeStep = stepIds.includes(stepId) ? stepId : "calendar";

  if (activeStep === "inventory" && !activeCategory) {
    showStep("setup");
    return;
  }

  stepIds.forEach((id) => {
    document.getElementById(id)?.classList.toggle("is-hidden-step", id !== activeStep);
  });

  document.querySelector(".site-footer")?.classList.toggle("is-hidden-step", activeStep !== "contact");

  document.querySelectorAll('.site-nav a[href^="#"]').forEach((link) => {
    const isActive = link.getAttribute("href") === `#${activeStep}`;
    if (isActive) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  });

  if (activeStep === "inventory") renderInventoryCategory(activeCategory);
  if (activeStep === "review") renderReview();

  const nextHash = routeHashForStep(activeStep);
  if (window.location.hash !== nextHash) {
    window.history.replaceState(null, "", nextHash);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
  updateBuilderPreview();
}

function inventoryItemsFor(category) {
  return publicInventory.filter((item) => item.category === category);
}

function renderInventoryCategory(category) {
  const normalizedCategory = normalizeInventoryCategory(category);
  if (normalizedCategory) activeCategory = normalizedCategory;
  const copy = categoryCopy[activeCategory];
  if (!copy) return;

  const items = inventoryItemsFor(activeCategory);
  const selected = build.selections[activeCategory];
  const inventoryTitle = document.getElementById("inventory-title");
  const inventoryCopy = document.getElementById("inventory-copy");
  const inventoryStepLabel = document.getElementById("inventory-step-label");
  const inventoryGrid = document.getElementById("inventory-grid");
  const inventoryNextLink = document.getElementById("inventory-next-link");

  if (inventoryTitle) inventoryTitle.textContent = copy.title;
  if (inventoryCopy) inventoryCopy.textContent = copy.copy;
  if (inventoryStepLabel) inventoryStepLabel.textContent = copy.step;
  if (inventoryNextLink) {
    const nextStep = nextStepForCategory(activeCategory);
    inventoryNextLink.href = `#${nextStep}`;
    inventoryNextLink.textContent = nextStep === "review" ? "Review" : `Continue to ${nextStep === "fnb" ? "F&B" : categoryCopy[nextStep]?.label || "next step"}`;
  }

  if (!inventoryGrid) return;

  if (!items.length) {
    inventoryGrid.innerHTML = `<div class="empty-state inventory-empty">${escapeHtml(inventoryLoadError || copy.empty)}</div>`;
  } else {
    inventoryGrid.innerHTML = items
      .map((item) => {
        const title = itemTitle(item);
        const note = itemNote(item);
        const imageUrl = itemImage(item);
        const selectedClass = selected?.id === item.id ? " is-selected" : "";
        const quantity = cartQuantity(item.id);
        const available = itemQuantityAvailable(item);
        const basePrice = itemUnitPrice(item);
        const adjustedPrice = adjustedUnitPrice(basePrice);
        const priceLabel = adjustedPrice ? formatMoney(adjustedPrice) : itemPriceLabel(item);
        return `
          <article class="table-choice inventory-choice${selectedClass}" data-inventory-id="${escapeHtml(item.id)}">
            <button class="inventory-select-button" type="button" data-select-inventory="${escapeHtml(item.id)}">
              <strong>${escapeHtml(title)}</strong>
              <span class="table-choice-image inventory-choice-image" aria-hidden="true">
              ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="">` : ""}
              </span>
              ${priceLabel ? `<em class="inventory-price">${escapeHtml(priceLabel)}</em>` : ""}
              <small>${escapeHtml(note || copy.label)}</small>
            </button>
            <div class="inventory-quantity-row">
              <button type="button" data-cart-decrease="${escapeHtml(item.id)}" aria-label="Decrease ${escapeHtml(title)}">-</button>
              <label>
                <span>Qty</span>
                <input type="number" min="0" ${available ? `max="${available}"` : ""} value="${quantity}" data-cart-quantity="${escapeHtml(item.id)}" />
              </label>
              <button type="button" data-cart-increase="${escapeHtml(item.id)}" aria-label="Increase ${escapeHtml(title)}">+</button>
            </div>
            <button class="inventory-add-button" type="button" data-add-to-cart="${escapeHtml(item.id)}">
              ${quantity ? "Update cart" : "Add to cart"}
            </button>
          </article>
        `;
      })
      .join("");
  }

  inventoryGrid.querySelectorAll("[data-select-inventory]").forEach((button) => {
    button.addEventListener("click", () => selectInventoryItem(button.dataset.selectInventory));
  });

  inventoryGrid.querySelectorAll("[data-add-to-cart]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = publicInventory.find((entry) => String(entry.id) === button.dataset.addToCart);
      const inputElement = Array.from(inventoryGrid.querySelectorAll("[data-cart-quantity]")).find(
        (field) => String(field.dataset.cartQuantity) === String(button.dataset.addToCart)
      );
      const nextQuantity = Number(inputElement?.value || 1) || 1;
      selectInventoryItem(button.dataset.addToCart, false);
      setCartQuantity(item, nextQuantity);
      renderInventoryCategory(activeCategory);
    });
  });

  inventoryGrid.querySelectorAll("[data-cart-increase], [data-cart-decrease]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.dataset.cartIncrease || button.dataset.cartDecrease;
      const item = publicInventory.find((entry) => String(entry.id) === id);
      const current = cartQuantity(id);
      const next = button.dataset.cartIncrease ? current + 1 : Math.max(0, current - 1);
      setCartQuantity(item, next);
      selectInventoryItem(id, false);
      renderInventoryCategory(activeCategory);
    });
  });

  inventoryGrid.querySelectorAll("[data-cart-quantity]").forEach((input) => {
    input.addEventListener("change", () => {
      const item = publicInventory.find((entry) => String(entry.id) === input.dataset.cartQuantity);
      setCartQuantity(item, input.value);
      selectInventoryItem(input.dataset.cartQuantity, false);
      renderInventoryCategory(activeCategory);
    });
  });

  updateBuilderPreview();
}

function selectInventoryItem(itemId, rerender = true) {
  const item = publicInventory.find((entry) => String(entry.id) === String(itemId));
  if (!item) return;
  build.selections[activeCategory] = {
    id: item.id,
    title: itemTitle(item),
    note: itemNote(item),
  };
  saveBuild();
  if (rerender) renderInventoryCategory(activeCategory);
}

function updateBuilderPreview() {
  const selected = build.selections[activeCategory];
  const preview = document.getElementById("inventory-preview");
  const previewNote = document.getElementById("inventory-preview-note");
  const summary = document.getElementById("selected-summary");
  const cartList = document.getElementById("inventory-cart-list");
  const cartCountLabel = document.getElementById("cart-count-label");
  const cartTotalLabel = document.getElementById("cart-total-label");
  const copy = categoryCopy[activeCategory];

  if (preview) preview.textContent = selected?.title || `No ${copy?.label.toLowerCase() || "selection"} selected yet`;
  if (previewNote) {
    if (activeCategory === "chairs" && !build.selections.tables) {
      previewNote.textContent = "Choose a table first to recommend matching chairs";
    } else {
      previewNote.textContent = selected?.note || "Choose an item to save this category.";
    }
  }

  document.querySelectorAll("[data-builder-category]").forEach((link) => {
    const category = normalizeInventoryCategory(link.dataset.builderCategory);
    link.classList.toggle("is-complete", Boolean(build.selections[category]));
    link.classList.toggle("is-next", category === "chairs" && Boolean(build.selections.tables) && !build.selections.chairs);
  });

  if (summary) {
    summary.innerHTML = ["tables", "chairs", "linen"]
      .map((category) => {
        const selection = build.selections[category];
        return `<span><small>${escapeHtml(categoryCopy[category].savedLabel)}</small><strong>${escapeHtml(selection?.title || "Not selected")}</strong></span>`;
      })
      .join("");
  }

  renderCart(cartList, cartCountLabel, cartTotalLabel);
}

function renderCart(cartList, cartCountLabel, cartTotalLabel) {
  const items = cartItems();
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const estimatedTotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);
  const checkoutButton = document.getElementById("cart-checkout-button");

  if (cartCountLabel) {
    cartCountLabel.textContent = String(totalQuantity);
  }

  if (cartTotalLabel) {
    cartTotalLabel.textContent = estimatedTotal
      ? `${formatMoney(estimatedTotal)} total`
      : `${totalQuantity} item${totalQuantity === 1 ? "" : "s"}`;
  }

  if (checkoutButton) {
    checkoutButton.classList.toggle("is-disabled", !items.length);
    checkoutButton.setAttribute("aria-disabled", String(!items.length));
  }

  if (!cartList) return;

  if (!items.length) {
    cartList.innerHTML = "<p>Your selected products will appear here.</p>";
    return;
  }

  cartList.innerHTML = items
    .map(
      (item) => {
        const quantity = Number(item.quantity || 0);
        const unitPrice = Number(item.unit_price || 0);
        const lineTotal = quantity * unitPrice;
        const priceCopy = unitPrice ? `${formatMoney(unitPrice)} each` : item.price_label || "";
        return `
        <article class="cart-line">
          <strong>${escapeHtml(item.title)}</strong>
          <span class="cart-line-meta">${quantity} x ${escapeHtml(categoryCopy[item.category]?.label || "Item")}${priceCopy ? ` &middot; ${escapeHtml(priceCopy)}` : ""}</span>
          ${lineTotal ? `<b>${escapeHtml(formatMoney(lineTotal))}</b>` : ""}
          <button type="button" data-remove-cart="${escapeHtml(item.id)}">Remove</button>
        </article>
      `;
      }
    )
    .join("");

  cartList.querySelectorAll("[data-remove-cart]").forEach((button) => {
    button.addEventListener("click", () => {
      delete build.cart[button.dataset.removeCart];
      saveBuild();
      clearPendingPaymentOrder();
      renderInventoryCategory(activeCategory);
    });
  });
}

function renderReview() {
  const reviewSummary = document.getElementById("review-summary");
  if (!reviewSummary) return;
  const items = cartItems();
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
  const estimatedTotal = items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.unit_price || 0), 0);

  const rows = flowCategoryIds
    .map((category) => {
      const selection = build.selections[category];
      const cartForCategory = items
        .filter((item) => item.category === category)
        .reduce((sum, item) => sum + Number(item.quantity || 0), 0);
      return `
        <article>
          <small>${escapeHtml(categoryCopy[category].savedLabel)}</small>
          <strong>${escapeHtml(selection?.title || categoryCopy[category].empty)}</strong>
          ${cartForCategory ? `<span>${cartForCategory} item${cartForCategory === 1 ? "" : "s"} in cart</span>` : ""}
        </article>
      `;
    })
    .join("");

  reviewSummary.innerHTML = `
    <article>
      <small>Date</small>
      <strong>${escapeHtml(build.eventDate || "Not selected")}</strong>
    </article>
    <article>
      <small>Event Type</small>
      <strong>${escapeHtml(build.eventType || "Not selected")}</strong>
    </article>
    <article>
      <small>Product cart</small>
      <strong>${estimatedTotal ? escapeHtml(formatMoney(estimatedTotal)) : `${totalQuantity} items saved`}</strong>
      ${estimatedTotal ? `<span>${totalQuantity} item${totalQuantity === 1 ? "" : "s"} saved</span>` : ""}
    </article>
    ${rows}
  `;
  updateRequestFormState();
  syncPaymentReturnState();
}

function normalizeProviderRow(row) {
  const category = providerCategory(row);
  if (!category) return null;
  return {
    ...row,
    id: String(row.id),
    category,
  };
}

function reconcileBuildWithInventory() {
  const currentIds = new Set(publicInventory.map((item) => String(item.id)));
  let changed = false;

  Object.entries(build.selections || {}).forEach(([category, selection]) => {
    if (selection?.id && !currentIds.has(String(selection.id))) {
      delete build.selections[category];
      changed = true;
    }
  });

  Object.keys(build.cart || {}).forEach((id) => {
    const inventoryItem = publicInventory.find((item) => String(item.id) === String(id));
    if (!inventoryItem) {
      delete build.cart[id];
      changed = true;
      return;
    }

    const nextPriceLabel = itemPriceLabel(inventoryItem);
    const nextBaseUnitPrice = itemUnitPrice(inventoryItem);
    if (build.cart[id].price_label !== nextPriceLabel || Number(build.cart[id].base_unit_price ?? build.cart[id].unit_price ?? 0) !== nextBaseUnitPrice) {
      build.cart[id] = {
        ...build.cart[id],
        price_label: nextPriceLabel,
        base_unit_price: nextBaseUnitPrice,
        unit_price: adjustedUnitPrice(nextBaseUnitPrice),
      };
      changed = true;
    }
  });

  if (changed) saveBuild();
}

async function loadPublicInventory() {
  const { workspaceId, isConfigured, client } = await getPublicSupabaseClient();

  if (!isConfigured || !client) {
    inventoryLoadError = "Inventory is not configured yet.";
    publicInventory = [];
    reconcileBuildWithInventory();
    if (activeCategory) renderInventoryCategory(activeCategory);
    renderReview();
    return;
  }

  try {
    const result = await client
      .from("cater_providers")
      .select("id,provider_name,provider_type,notes,status,created_at,service_category,public_visible,approval_status,public_description,image_url")
      .eq("workspace_id", workspaceId)
      .eq("public_visible", true)
      .eq("approval_status", "approved")
      .in("status", ["active", "preferred"])
      .ilike("notes", `${INVENTORY_NOTE_PREFIX}%`)
      .order("created_at", { ascending: false })
      .limit(200);

    const { data, error } = result;
    if (error) throw error;

    const remoteItems = (data || []).map(normalizeProviderRow).filter(Boolean);
    inventoryLoadError = "";
    publicInventory = remoteItems.filter((item) => flowCategoryIds.includes(item.category));
  } catch {
    inventoryLoadError = "Inventory could not be loaded from Supabase. Please refresh.";
    publicInventory = [];
  }

  reconcileBuildWithInventory();
  if (activeCategory) renderInventoryCategory(activeCategory);
  renderReview();
}

async function loadPublicPricingRules() {
  const { workspaceId, isConfigured, client } = await getPublicSupabaseClient();
  if (!isConfigured || !client) return;

  const { data, error } = await client
    .from("cater_pricing_rules")
    .select("weekday_markup_percent,weekend_markup_percent,holiday_markup_percent,holiday_dates")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!error && data) {
    pricingRules = {
      ...pricingRules,
      ...data,
      holiday_dates: normalizeHolidayDates(data.holiday_dates),
    };
  }

  if (activeCategory) renderInventoryCategory(activeCategory);
  renderReview();
}

document.querySelectorAll("[data-event-type]").forEach((link) => {
  link.addEventListener("click", () => {
    build.eventType = link.dataset.eventType || "";
    saveBuild();
  });
});

document.querySelectorAll("[data-builder-category]").forEach((link) => {
  link.addEventListener("click", () => {
    activeCategory = normalizeInventoryCategory(link.dataset.builderCategory) || activeCategory;
  });
});

document.getElementById("clear-cart-button")?.addEventListener("click", () => {
  build.cart = {};
  saveBuild();
  clearPendingPaymentOrder();
  if (activeCategory) renderInventoryCategory(activeCategory);
  else updateBuilderPreview();
  updateRequestFormState();
});

publicRequestForm?.addEventListener("submit", submitPublicPayment);

const navCartButton = document.getElementById("nav-cart-button");
const navCartPopover = document.getElementById("nav-cart-popover");

function setCartPopover(open) {
  if (!navCartButton || !navCartPopover) return;
  navCartPopover.hidden = !open;
  navCartButton.setAttribute("aria-expanded", open ? "true" : "false");
}

navCartButton?.addEventListener("click", (event) => {
  event.stopPropagation();
  setCartPopover(Boolean(navCartPopover?.hidden));
});

navCartPopover?.addEventListener("click", (event) => {
  event.stopPropagation();
});

document.addEventListener("click", () => {
  setCartPopover(false);
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") setCartPopover(false);
});

window.addEventListener("hashchange", () => {
  const route = parseHashRoute();
  showStep(route.stepId, route.category);
});

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    const { stepId: targetId, category } = parseHashRoute(href);

    if (stepIds.includes(targetId)) {
      event.preventDefault();
      setCartPopover(false);
      showStep(targetId, category);
      return;
    }

    const target = document.querySelector(href);
    if (!target) return;

    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
});

document.querySelectorAll(".industry-panel").forEach((panel) => {
  panel.addEventListener("click", (event) => {
    if (event.target.closest("a")) return;
    panel.querySelector('a[href^="#"]')?.click();
  });
});

function updateHeroSelectedDate(dayValue) {
  const day = Number(dayValue);
  if (!Number.isFinite(day)) return;
  const selectedDate = new Date(2026, 5, day);
  const selectedDateDay = document.getElementById("selected-date-day");
  const selectedDateValue = document.getElementById("selected-date-value");

  if (selectedDateDay) {
    selectedDateDay.textContent = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(selectedDate);
  }

  if (selectedDateValue) {
    selectedDateValue.textContent = new Intl.DateTimeFormat("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    }).format(selectedDate);
  }
}

document.querySelectorAll(".calendar-grid button:not(.muted)").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".calendar-grid button").forEach((day) => day.classList.remove("is-selected"));
    button.classList.add("is-selected");
    build.eventDate = `June ${button.textContent.trim()}, 2026`;
    updateHeroSelectedDate(button.textContent.trim());
    saveBuild();
    clearPendingPaymentOrder();
    renderCart(document.getElementById("inventory-cart-list"), document.getElementById("cart-count-label"), document.getElementById("cart-total-label"));
    renderReview();
    window.setTimeout(() => showStep("event-type"), 260);
  });
});

ensureBuildDefaults();
updateHeroSelectedDate(document.querySelector(".calendar-grid button.is-selected")?.textContent.trim() || "18");
Promise.all([loadPublicInventory(), loadPublicPricingRules()]);
const initialRoute = parseHashRoute();
showStep(initialRoute.stepId, initialRoute.category);
