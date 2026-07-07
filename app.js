import {
  DEFAULT_WORKSPACE_ID,
  isSupabaseConfigured,
  supabase,
} from "./lib/supabaseClient.js?v=supabase-auth-loader-20260619";

const stepIds = ["calendar", "industries", "catering", "tables", "start", "about", "contact"];
const LOCAL_INVENTORY_KEY = "caterVegasPublicInventory";
const INVENTORY_NOTE_PREFIX = "CATER_INVENTORY_JSON:";
const cateringBuild = {
  table: "",
  tableNote: ""
};
const savedBuild = window.localStorage.getItem("caterVegasBuild");

if (savedBuild) {
  try {
    Object.assign(cateringBuild, JSON.parse(savedBuild));
  } catch (error) {
    window.localStorage.removeItem("caterVegasBuild");
  }
}

function showStep(stepId) {
  const activeStep = stepIds.includes(stepId) ? stepId : "calendar";

  stepIds.forEach((id) => {
    document.getElementById(id)?.classList.toggle("is-hidden-step", id !== activeStep);
  });

  document.querySelector(".site-footer")?.classList.toggle("is-hidden-step", activeStep !== "contact");

  document.querySelectorAll('.site-nav a[href^="#"]').forEach((link) => {
    const isActive = link.getAttribute("href") === `#${activeStep}`;
    if (isActive) {
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  if (window.location.hash !== `#${activeStep}`) {
    window.history.replaceState(null, "", `#${activeStep}`);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
  updateBuilderPreview();
}

function markIndustryPanel(link) {
  const panel = link.closest(".industry-panel");
  if (!panel) return false;

  document.querySelectorAll(".industry-panel").forEach((item) => item.classList.remove("is-selected"));
  panel.classList.add("is-selected");
  return true;
}

function updateBuilderPreview() {
  const builderSummary = document.getElementById("builder-summary");
  const tablePreview = document.getElementById("table-preview");
  const tablePreviewNote = document.getElementById("table-preview-note");
  const tablesCategory = document.querySelector('[data-builder-category="tables"]');
  const chairsCategory = document.querySelector('[data-builder-category="chairs"]');

  if (builderSummary) {
    builderSummary.textContent = cateringBuild.table
      ? `Table saved: ${cateringBuild.table}. Next: Chairs.`
      : "Start with a table.";
  }

  if (tablePreview) {
    tablePreview.textContent = cateringBuild.table || "No table selected yet";
  }

  if (tablePreviewNote) {
    tablePreviewNote.textContent = cateringBuild.tableNote || "Choose a table to unlock chairs.";
  }

  tablesCategory?.classList.toggle("is-complete", Boolean(cateringBuild.table));
  chairsCategory?.classList.toggle("is-next", Boolean(cateringBuild.table));

  document.querySelectorAll("[data-table-choice]").forEach((choice) => {
    choice.classList.toggle("is-selected", choice.dataset.tableChoice === cateringBuild.table);
  });
}

function saveBuilder() {
  window.localStorage.setItem("caterVegasBuild", JSON.stringify(cateringBuild));
}

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

function localInventoryRows() {
  try {
    return JSON.parse(window.localStorage.getItem(LOCAL_INVENTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function renderPublicTables(items, message = "") {
  const container = document.getElementById("publicTableInventory");
  if (!container) return;

  if (!items.length) {
    container.innerHTML = `
      <div class="empty-state">
        ${escapeHtml(message || "Tables will appear here when the administrator adds inventory.")}
      </div>
    `;
    return;
  }

  container.innerHTML = items
    .map(
      (item) => `
        <button class="table-choice" type="button" data-table-choice="${escapeHtml(item.name)}" data-table-note="${escapeHtml(item.description || item.price_label || "Inventory item")}">
          <span class="table-choice-image" aria-hidden="true">
            ${item.image_url ? `<img src="${escapeHtml(item.image_url)}" alt="">` : ""}
          </span>
          <strong>${escapeHtml(item.name)}</strong>
          <small>${escapeHtml(item.price_label || `${Number(item.quantity_available || 0)} available`)}</small>
        </button>
      `
    )
    .join("");

  bindTableChoices();
  updateBuilderPreview();
}

async function loadPublicInventory() {
  const localItems = localInventoryRows();
  if (localItems.length) {
    renderPublicTables(localItems);
  }

  if (!isSupabaseConfigured || !supabase) {
    if (!localItems.length) renderPublicTables([], "Inventory is loading locally.");
    return;
  }

  const { data, error } = await supabase
    .from("cater_providers")
    .select("id,provider_name,provider_type,status,notes,created_at")
    .eq("workspace_id", DEFAULT_WORKSPACE_ID)
    .eq("provider_type", "rental")
    .eq("status", "active")
    .order("created_at", { ascending: false });

  if (error) {
    if (!localItems.length) renderPublicTables([], "Inventory will appear here after it is published.");
    return;
  }

  const items = (data || [])
    .map((row) => {
      const meta = parseInventoryNotes(row.notes);
      if (meta?.kind !== "inventory") return null;
      return {
        id: row.id,
        name: row.provider_name,
        category: meta.category,
        description: meta.description,
        quantity_available: Number(meta.quantity_available || 0),
        price_label: meta.price_label || "",
        image_url: meta.image_url || "",
      };
    })
    .filter(Boolean);

  if (items.length) {
    window.localStorage.setItem(LOCAL_INVENTORY_KEY, JSON.stringify(items));
  }

  renderPublicTables(items.length ? items : localItems);
}

document.querySelectorAll('a[href^="#"]').forEach((link) => {
  link.addEventListener("click", (event) => {
    const href = link.getAttribute("href");
    const targetId = href.slice(1);
    const isIndustrySelection = markIndustryPanel(link);

    if (stepIds.includes(targetId)) {
      event.preventDefault();
      window.setTimeout(() => showStep(targetId), isIndustrySelection ? 180 : 0);
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

const pathCopy = {
  Catering: "We will begin with menu direction, guest count, service flow and staffing needs, then connect the rest of the event around it.",
  "F&B": "We will begin with beverage service, food operations, venue requirements and daily service rhythm, then connect the rest of the event around it.",
  Entertainment: "We will begin with talent, music, production timing and guest energy, then connect food, service and hospitality around the show flow.",
  Hospedaje: "We will begin with hotel blocks, arrivals, transportation notes and VIP hospitality, then connect the event plan around guest movement."
};

function setStartPath(path) {
  const selectedPath = document.getElementById("selected-path");
  const selectedCopy = document.getElementById("selected-path-copy");

  if (!selectedPath || !selectedCopy || !pathCopy[path]) return;

  selectedPath.textContent = path;
  selectedCopy.textContent = pathCopy[path];

  document.querySelectorAll("[data-path]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.path === path);
  });
}

document.querySelectorAll("[data-start-option]").forEach((link) => {
  link.addEventListener("click", () => setStartPath(link.dataset.startOption));
});

document.querySelectorAll("[data-path]").forEach((button) => {
  button.addEventListener("click", () => setStartPath(button.dataset.path));
});

function bindTableChoices() {
  document.querySelectorAll("[data-table-choice]").forEach((button) => {
    if (button.dataset.choiceBound === "true") return;
    button.dataset.choiceBound = "true";
    button.addEventListener("click", () => {
      cateringBuild.table = button.dataset.tableChoice;
      cateringBuild.tableNote = button.dataset.tableNote;
      saveBuilder();

      document.querySelectorAll("[data-table-choice]").forEach((choice) => {
        choice.classList.toggle("is-selected", choice === button);
      });

      updateBuilderPreview();
      window.setTimeout(() => showStep("catering"), 420);
    });
  });
}

bindTableChoices();

document.querySelectorAll(".calendar-grid button:not(.muted)").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelectorAll(".calendar-grid button").forEach((day) => day.classList.remove("is-selected"));
    button.classList.add("is-selected");
    window.setTimeout(() => showStep("industries"), 260);
  });
});

showStep(window.location.hash.slice(1));
loadPublicInventory();
