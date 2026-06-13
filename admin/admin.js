import {
  getCurrentProfile,
  isSupabaseConfigured,
  requireSupabase,
  subscribeToEvents,
} from "../lib/supabaseClient.js";

const WORKSPACE_ID = "cater-vegas";

const sessionStatus = document.querySelector("#sessionStatus");
const signoutButton = document.querySelector("#signoutButton");
const eventForm = document.querySelector("#eventForm");
const eventTitle = document.querySelector("#eventTitle");
const eventType = document.querySelector("#eventType");
const eventBudget = document.querySelector("#eventBudget");
const eventDate = document.querySelector("#eventDate");
const guestCount = document.querySelector("#guestCount");
const eventFormStatus = document.querySelector("#eventFormStatus");
const eventsList = document.querySelector("#eventsList");
const refreshEventsButton = document.querySelector("#refreshEventsButton");
const selectedEventLabel = document.querySelector("#selectedEventLabel");
const adminBeoflowForm = document.querySelector("#adminBeoflowForm");
const adminBeoflowPrompt = document.querySelector("#adminBeoflowPrompt");
const beoflowResult = document.querySelector("#beoflowResult");

const collaboratorForm = document.querySelector("#collaboratorForm");
const collaboratorId = document.querySelector("#collaboratorId");
const collaboratorName = document.querySelector("#collaboratorName");
const collaboratorEmail = document.querySelector("#collaboratorEmail");
const collaboratorPhone = document.querySelector("#collaboratorPhone");
const collaboratorRole = document.querySelector("#collaboratorRole");
const collaboratorStatus = document.querySelector("#collaboratorStatus");
const collaboratorNotes = document.querySelector("#collaboratorNotes");
const collaboratorFormStatus = document.querySelector("#collaboratorFormStatus");
const resetCollaboratorButton = document.querySelector("#resetCollaboratorButton");
const refreshCollaboratorsButton = document.querySelector("#refreshCollaboratorsButton");
const collaboratorsList = document.querySelector("#collaboratorsList");

const assignmentForm = document.querySelector("#assignmentForm");
const assignmentEvent = document.querySelector("#assignmentEvent");
const assignmentCollaborator = document.querySelector("#assignmentCollaborator");
const assignmentRole = document.querySelector("#assignmentRole");
const assignmentSelectStatus = document.querySelector("#assignmentStatus");
const assignmentNotes = document.querySelector("#assignmentNotes");
const assignmentStatusText = document.querySelector("#assignmentStatusText");
const assignmentsList = document.querySelector("#assignmentsList");

let supabase = null;
let currentUser = null;
let currentProfile = null;
let selectedEvent = null;
let selectedCollaborator = null;
let eventsChannel = null;
let allEvents = [];
let allCollaborators = [];
let allAssignments = [];

function setSessionStatus(message) {
  sessionStatus.textContent = message;
}

function setEventStatus(message) {
  eventFormStatus.textContent = message;
}

function setCollaboratorStatus(message) {
  collaboratorFormStatus.textContent = message;
}

function setAssignmentStatus(message) {
  assignmentStatusText.textContent = message;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function canManageEvents() {
  return ["admin", "staff"].includes(currentProfile?.role);
}

function canManageCollaborators() {
  return currentProfile?.role === "admin";
}

function eventPlanFromRow(row) {
  return {
    budgetLabel: row.budget_label,
    eventType: row.event_type,
    menuStyle: row.menu_style,
    services: row.services || [],
    ...(row.plan || {}),
  };
}

function renderEventOptions() {
  const eventOptions = allEvents
    .map((event) => `<option value="${event.id}">${escapeHtml(event.title || `Evento #${event.id}`)}</option>`)
    .join("");

  assignmentEvent.innerHTML = eventOptions || '<option value="">Sin eventos</option>';

  if (selectedEvent?.id) {
    assignmentEvent.value = String(selectedEvent.id);
  }
}

function renderCollaboratorOptions() {
  const collaboratorOptions = allCollaborators
    .filter((collaborator) => collaborator.status !== "inactive")
    .map(
      (collaborator) =>
        `<option value="${collaborator.id}">${escapeHtml(collaborator.full_name)} · ${escapeHtml(collaborator.role)}</option>`
    )
    .join("");

  assignmentCollaborator.innerHTML = collaboratorOptions || '<option value="">Sin colaboradores activos</option>';

  if (selectedCollaborator?.id) {
    assignmentCollaborator.value = String(selectedCollaborator.id);
  }
}

function renderEvents(rows = []) {
  if (!rows.length) {
    eventsList.innerHTML = "<p>No hay eventos visibles todavía.</p>";
    renderEventOptions();
    return;
  }

  eventsList.innerHTML = rows
    .map((event) => {
      const services = Array.isArray(event.services) && event.services.length
        ? event.services.join(", ")
        : "Sin servicios";
      const selectedClass = selectedEvent?.id === event.id ? " is-selected" : "";

      return `
        <article class="event-row${selectedClass}">
          <button type="button" data-event-id="${event.id}">
            <strong>${escapeHtml(event.title || "Evento sin nombre")}</strong>
            <span class="event-meta">
              #${event.id} · ${escapeHtml(event.event_type || "Sin tipo")} · ${escapeHtml(event.status || "draft")} · ${escapeHtml(event.budget_label || "Sin presupuesto")}
            </span>
            <span class="event-meta">${escapeHtml(services)}</span>
          </button>
        </article>
      `;
    })
    .join("");

  eventsList.querySelectorAll("[data-event-id]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedEvent = rows.find((event) => String(event.id) === button.dataset.eventId);
      selectedEventLabel.textContent = selectedEvent
        ? `Evento seleccionado: ${selectedEvent.title || `#${selectedEvent.id}`}`
        : "Selecciona un evento para enviar instrucciones.";
      renderEvents(rows);
      renderEventOptions();
    });
  });

  renderEventOptions();
}

function renderCollaborators(rows = []) {
  if (!rows.length) {
    collaboratorsList.innerHTML = "<p>No hay colaboradores todavía.</p>";
    renderCollaboratorOptions();
    return;
  }

  collaboratorsList.innerHTML = rows
    .map((collaborator) => {
      const selectedClass = selectedCollaborator?.id === collaborator.id ? " is-selected" : "";
      const toggleLabel = collaborator.status === "inactive" ? "Activar" : "Desactivar";
      const nextStatus = collaborator.status === "inactive" ? "active" : "inactive";

      return `
        <article class="collaborator-row${selectedClass}">
          <button type="button" data-collaborator-select="${collaborator.id}">
            <strong>${escapeHtml(collaborator.full_name)}</strong>
            <span class="collaborator-meta">
              #${collaborator.id} · ${escapeHtml(collaborator.role)} · ${escapeHtml(collaborator.status)}
            </span>
            <span class="collaborator-meta">
              ${escapeHtml(collaborator.email || "Sin email")} · ${escapeHtml(collaborator.phone || "Sin teléfono")}
            </span>
          </button>
          <div class="collaborator-actions">
            <button class="tiny-button" type="button" data-collaborator-edit="${collaborator.id}">Editar</button>
            <button class="tiny-button" type="button" data-collaborator-status="${collaborator.id}" data-next-status="${nextStatus}">
              ${toggleLabel}
            </button>
          </div>
        </article>
      `;
    })
    .join("");

  collaboratorsList.querySelectorAll("[data-collaborator-select]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedCollaborator = rows.find((collaborator) => String(collaborator.id) === button.dataset.collaboratorSelect);
      renderCollaborators(rows);
      renderCollaboratorOptions();
    });
  });

  collaboratorsList.querySelectorAll("[data-collaborator-edit]").forEach((button) => {
    button.addEventListener("click", () => {
      const collaborator = rows.find((item) => String(item.id) === button.dataset.collaboratorEdit);
      if (!collaborator) return;
      selectedCollaborator = collaborator;
      fillCollaboratorForm(collaborator);
      renderCollaborators(rows);
      renderCollaboratorOptions();
    });
  });

  collaboratorsList.querySelectorAll("[data-collaborator-status]").forEach((button) => {
    button.addEventListener("click", () => {
      updateCollaboratorStatus(button.dataset.collaboratorStatus, button.dataset.nextStatus);
    });
  });

  renderCollaboratorOptions();
}

function renderAssignments(rows = []) {
  if (!rows.length) {
    assignmentsList.innerHTML = "<p>No hay asignaciones todavía.</p>";
    return;
  }

  const eventsById = new Map(allEvents.map((event) => [Number(event.id), event]));
  const collaboratorsById = new Map(allCollaborators.map((collaborator) => [Number(collaborator.id), collaborator]));

  assignmentsList.innerHTML = rows
    .map((assignment) => {
      const event = eventsById.get(Number(assignment.event_id));
      const collaborator = collaboratorsById.get(Number(assignment.collaborator_id));

      return `
        <article class="assignment-row">
          <strong>${escapeHtml(collaborator?.full_name || `Colaborador #${assignment.collaborator_id}`)}</strong>
          <span class="assignment-meta">
            ${escapeHtml(assignment.assignment_role)} · ${escapeHtml(assignment.status)} · ${escapeHtml(event?.title || `Evento #${assignment.event_id}`)}
          </span>
          <span class="assignment-meta">${escapeHtml(assignment.notes || "Sin notas")}</span>
        </article>
      `;
    })
    .join("");
}

function fillCollaboratorForm(collaborator) {
  collaboratorId.value = collaborator.id;
  collaboratorName.value = collaborator.full_name || "";
  collaboratorEmail.value = collaborator.email || "";
  collaboratorPhone.value = collaborator.phone || "";
  collaboratorRole.value = collaborator.role || "staff";
  collaboratorStatus.value = collaborator.status || "active";
  collaboratorNotes.value = collaborator.notes || "";
}

function resetCollaboratorForm() {
  collaboratorForm.reset();
  collaboratorId.value = "";
  collaboratorRole.value = "organizer";
  collaboratorStatus.value = "active";
  selectedCollaborator = null;
  renderCollaborators(allCollaborators);
}

async function loadEvents() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from("cater_events")
    .select(
      "id,title,event_type,status,budget,budget_label,menu_style,services,plan,event_date,guest_count,updated_at,created_at"
    )
    .order("updated_at", { ascending: false })
    .limit(100);

  if (error) {
    eventsList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  allEvents = data || [];
  renderEvents(allEvents);
}

async function loadCollaborators() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from("cater_collaborators")
    .select("*")
    .eq("workspace_id", WORKSPACE_ID)
    .order("updated_at", { ascending: false })
    .limit(200);

  if (error) {
    collaboratorsList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  allCollaborators = data || [];
  renderCollaborators(allCollaborators);
}

async function loadAssignments() {
  if (!supabase) return;

  const { data, error } = await supabase
    .from("cater_event_assignments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    assignmentsList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  allAssignments = data || [];
  renderAssignments(allAssignments);
}

async function refreshCollaboratorModule() {
  await loadCollaborators();
  await loadAssignments();
}

async function bootAdmin() {
  if (!isSupabaseConfigured) {
    setSessionStatus("Configura Supabase en lib/supabaseClient.js para usar el admin.");
    return;
  }

  supabase = requireSupabase();
  const { user, profile } = await getCurrentProfile();
  currentUser = user;
  currentProfile = profile;

  if (!currentUser) {
    window.location.href = "../login.html";
    return;
  }

  if (!currentProfile) {
    setSessionStatus("Tu usuario no tiene cater_profile. Ejecuta supabase/schema.sql o crea el perfil.");
    return;
  }

  if (!["admin", "staff", "client"].includes(currentProfile.role)) {
    setSessionStatus("Rol no reconocido. Revisa public.cater_profiles.role.");
    return;
  }

  setSessionStatus(`${currentUser.email} · rol ${currentProfile.role}`);
  eventForm.hidden = !canManageEvents();
  collaboratorForm.hidden = !canManageCollaborators();
  assignmentForm.hidden = !canManageEvents();

  await Promise.all([loadEvents(), loadCollaborators()]);
  await loadAssignments();

  eventsChannel = subscribeToEvents(() => {
    loadEvents().then(loadAssignments);
  });
}

eventForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !canManageEvents()) return;

  setEventStatus("Creando evento...");
  const budgetLabel = eventBudget.value;
  const plan = {
    budgetLabel,
    eventType: eventType.value,
    menuStyle: null,
    services: [],
  };

  const { error } = await supabase.from("cater_events").insert({
    title: eventTitle.value.trim(),
    event_type: eventType.value,
    budget_label: budgetLabel,
    status: "draft",
    event_date: eventDate.value || null,
    guest_count: guestCount.value ? Number(guestCount.value) : null,
    created_by: currentUser.id,
    plan,
  });

  if (error) {
    setEventStatus(error.message);
    return;
  }

  eventForm.reset();
  setEventStatus("Evento creado.");
  await loadEvents();
});

collaboratorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !canManageCollaborators()) return;

  const payload = {
    workspace_id: WORKSPACE_ID,
    full_name: collaboratorName.value.trim(),
    email: collaboratorEmail.value.trim() || null,
    phone: collaboratorPhone.value.trim() || null,
    role: collaboratorRole.value,
    status: collaboratorStatus.value,
    notes: collaboratorNotes.value.trim() || null,
  };

  if (!payload.full_name) {
    setCollaboratorStatus("Agrega el nombre del colaborador.");
    return;
  }

  setCollaboratorStatus(collaboratorId.value ? "Actualizando colaborador..." : "Creando colaborador...");

  const query = collaboratorId.value
    ? supabase.from("cater_collaborators").update(payload).eq("id", Number(collaboratorId.value))
    : supabase.from("cater_collaborators").insert(payload);

  const { error } = await query;

  if (error) {
    setCollaboratorStatus(error.message);
    return;
  }

  setCollaboratorStatus(collaboratorId.value ? "Colaborador actualizado." : "Colaborador creado.");
  resetCollaboratorForm();
  await refreshCollaboratorModule();
});

assignmentForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase || !canManageEvents()) return;

  const eventId = Number(assignmentEvent.value);
  const collaboratorIdValue = Number(assignmentCollaborator.value);

  if (!eventId || !collaboratorIdValue) {
    setAssignmentStatus("Selecciona evento y colaborador.");
    return;
  }

  setAssignmentStatus("Guardando asignación...");

  const { error } = await supabase.from("cater_event_assignments").upsert(
    {
      event_id: eventId,
      collaborator_id: collaboratorIdValue,
      assignment_role: assignmentRole.value,
      status: assignmentSelectStatus.value,
      notes: assignmentNotes.value.trim() || null,
    },
    { onConflict: "event_id,collaborator_id" }
  );

  if (error) {
    setAssignmentStatus(error.message);
    return;
  }

  assignmentNotes.value = "";
  setAssignmentStatus("Asignación guardada.");
  await loadAssignments();
});

adminBeoflowForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!supabase) return;

  const prompt = adminBeoflowPrompt.value.trim();
  if (!selectedEvent || !prompt) {
    beoflowResult.textContent = "Selecciona un evento y escribe una instrucción.";
    return;
  }

  beoflowResult.textContent = "BEOFlow procesando...";

  const { data, error } = await supabase.functions.invoke("beoflow", {
    body: {
      message: prompt,
      eventId: selectedEvent.id,
      currentPlan: eventPlanFromRow(selectedEvent),
      workspaceId: WORKSPACE_ID,
    },
  });

  if (error) {
    beoflowResult.textContent = error.message;
    return;
  }

  beoflowResult.textContent = JSON.stringify(data, null, 2);
  await Promise.all([loadEvents(), refreshCollaboratorModule()]);
});

async function updateCollaboratorStatus(id, status) {
  if (!supabase || !canManageCollaborators()) return;

  const { error } = await supabase
    .from("cater_collaborators")
    .update({ status })
    .eq("id", Number(id));

  if (error) {
    setCollaboratorStatus(error.message);
    return;
  }

  setCollaboratorStatus(status === "active" ? "Colaborador activado." : "Colaborador desactivado.");
  await refreshCollaboratorModule();
}

refreshEventsButton.addEventListener("click", () => {
  loadEvents().then(loadAssignments);
});

refreshCollaboratorsButton.addEventListener("click", refreshCollaboratorModule);
resetCollaboratorButton.addEventListener("click", resetCollaboratorForm);

signoutButton.addEventListener("click", async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
  window.location.href = "../login.html";
});

window.addEventListener("beforeunload", () => {
  if (eventsChannel && supabase) {
    supabase.removeChannel(eventsChannel);
  }
});

bootAdmin().catch((error) => {
  setSessionStatus(error.message);
});

