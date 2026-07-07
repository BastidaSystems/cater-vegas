const stepIds = ["calendar", "event-type", "setup", "inventory", "fnb", "entertainment", "lodging", "review", "about", "contact"];
const setupCategoryIds = ["tables", "chairs", "linen", "decor", "tents"];
const flowCategoryIds = ["tables", "chairs", "linen", "decor", "tents", "food", "beverages", "entertainment", "lodging"];
const storageKey = "caterVegasBuild";
const LOCAL_INVENTORY_KEY = "caterVegasPublicInventory";
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
    label: "Hospedaje",
    savedLabel: "Selected lodging",
    title: "Choose hospedaje",
    copy: "Select hotel, suite or guest stay support.",
    empty: "No lodging added yet",
    step: "Hospedaje",
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

async function getPublicSupabaseClient() {
  if (!supabaseClientPromise) {
    supabaseClientPromise = import("./lib/supabaseClient.js?v=supabase-auth-loader-20260619")
      .then((module) => ({
        workspaceId: module.DEFAULT_WORKSPACE_ID,
        isConfigured: module.isSupabaseConfigured,
        client: module.supabase,
      }))
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
    };
  } catch {
    window.localStorage.removeItem(storageKey);
    return fallback;
  }
}

function saveBuild() {
  window.localStorage.setItem(storageKey, JSON.stringify(build));
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
    if (category === "lodging") crumbs.push("Hospedaje");
  }

  container.innerHTML = crumbs
    .map((crumb, index) => (index === crumbs.length - 1 ? `<strong>${escapeHtml(crumb)}</strong>` : `<span>${escapeHtml(crumb)}</span>`))
    .join("");
}

function showStep(stepId) {
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

  if (window.location.hash !== `#${activeStep}`) {
    window.history.replaceState(null, "", `#${activeStep}`);
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

  updateBreadcrumb(document.getElementById("inventory-breadcrumb"), activeCategory);

  if (!inventoryGrid) return;

  if (!items.length) {
    inventoryGrid.innerHTML = `<div class="empty-state inventory-empty">${escapeHtml(copy.empty)}</div>`;
  } else {
    inventoryGrid.innerHTML = items
      .map((item) => {
        const title = itemTitle(item);
        const note = itemNote(item);
        const imageUrl = itemImage(item);
        const selectedClass = selected?.id === item.id ? " is-selected" : "";
        return `
          <button class="table-choice inventory-choice${selectedClass}" type="button" data-inventory-id="${escapeHtml(item.id)}">
            <span class="table-choice-image inventory-choice-image" aria-hidden="true">
              ${imageUrl ? `<img src="${escapeHtml(imageUrl)}" alt="">` : ""}
            </span>
            <strong>${escapeHtml(title)}</strong>
            <small>${escapeHtml(note || copy.label)}</small>
          </button>
        `;
      })
      .join("");
  }

  inventoryGrid.querySelectorAll("[data-inventory-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const item = publicInventory.find((entry) => String(entry.id) === button.dataset.inventoryId);
      if (!item) return;
      build.selections[activeCategory] = {
        id: item.id,
        title: itemTitle(item),
        note: itemNote(item),
      };
      saveBuild();
      renderInventoryCategory(activeCategory);
    });
  });

  updateBuilderPreview();
}

function updateBuilderPreview() {
  const selected = build.selections[activeCategory];
  const preview = document.getElementById("inventory-preview");
  const previewNote = document.getElementById("inventory-preview-note");
  const summary = document.getElementById("selected-summary");
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
}

function renderReview() {
  const reviewSummary = document.getElementById("review-summary");
  if (!reviewSummary) return;

  const rows = flowCategoryIds
    .map((category) => {
      const selection = build.selections[category];
      return `
        <article>
          <small>${escapeHtml(categoryCopy[category].savedLabel)}</small>
          <strong>${escapeHtml(selection?.title || categoryCopy[category].empty)}</strong>
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
    ${rows}
  `;
}

function localInventoryRows() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_INVENTORY_KEY) || "[]");
  } catch {
    return [];
  }
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

async function loadPublicInventory() {
  const localItems = localInventoryRows().map(normalizeProviderRow).filter(Boolean);
  const { workspaceId, isConfigured, client } = await getPublicSupabaseClient();

  if (!isConfigured || !client) {
    publicInventory = localItems.filter((item) => flowCategoryIds.includes(item.category));
    if (activeCategory) renderInventoryCategory(activeCategory);
    renderReview();
    return;
  }

  try {
    const result = await client
      .from("cater_providers")
      .select("id,provider_name,provider_type,notes,status,created_at")
      .eq("workspace_id", workspaceId)
      .eq("status", "active")
      .ilike("notes", `${INVENTORY_NOTE_PREFIX}%`)
      .order("created_at", { ascending: false })
      .limit(200);

    const { data, error } = result;
    if (error) throw error;

    const remoteItems = (data || []).map(normalizeProviderRow).filter(Boolean);
    publicInventory = (remoteItems.length ? remoteItems : localItems).filter((item) => flowCategoryIds.includes(item.category));
  } catch {
    publicInventory = localItems.filter((item) => flowCategoryIds.includes(item.category));
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

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    const targetId = href.slice(1);

    if (stepIds.includes(targetId)) {
      event.preventDefault();
      showStep(targetId);
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
    window.setTimeout(() => showStep("event-type"), 260);
  });
});

updateHeroSelectedDate(document.querySelector(".calendar-grid button.is-selected")?.textContent.trim() || "18");
loadPublicInventory();
showStep(window.location.hash.slice(1));
