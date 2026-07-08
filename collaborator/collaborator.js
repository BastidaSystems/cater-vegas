import {
  DEFAULT_WORKSPACE_ID,
  getEffectiveWorkspaceRole,
  getWorkspaceContext,
  isPendingWorkspaceAccess,
  navigateWithLoopGuard,
  isSupabaseConfigured,
  requireSupabase,
} from "../lib/supabaseClient.js?v=workspace-connection-20260707";

const sessionStatus = document.querySelector("#sessionStatus");
const assignmentsList = document.querySelector("#assignmentsList");
const signoutButton = document.querySelector("#signoutButton");

let supabase = null;
let currentWorkspaceId = DEFAULT_WORKSPACE_ID;

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function loadAssignments(userEmail) {
  const { data: collaborator } = await supabase
    .from("cater_collaborators")
    .select("id,full_name,role,status")
    .eq("workspace_id", currentWorkspaceId)
    .ilike("email", userEmail)
    .maybeSingle();

  if (!collaborator) {
    assignmentsList.innerHTML = "<p>No collaborator profile is linked to this email yet.</p>";
    return;
  }

  const { data, error } = await supabase
    .from("cater_event_assignments")
    .select("id,event_id,assignment_role,status,notes,created_at")
    .eq("workspace_id", currentWorkspaceId)
    .eq("collaborator_id", collaborator.id)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    assignmentsList.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!data?.length) {
    assignmentsList.innerHTML = "<p>You do not have visible assignments yet.</p>";
    return;
  }

  assignmentsList.innerHTML = data
    .map(
      (assignment) => `
        <article class="portal-row">
          <strong>Event #${assignment.event_id}</strong>
          <span>${escapeHtml(assignment.assignment_role)} · ${escapeHtml(assignment.status)} · ${escapeHtml(assignment.notes || "No notes")}</span>
        </article>
      `
    )
    .join("");
}

async function bootCollaborator() {
  if (!isSupabaseConfigured) {
    sessionStatus.textContent = "Configure Supabase to use the portal.";
    return;
  }

  supabase = requireSupabase();
  const { user, profile, membership, workspace } = await getWorkspaceContext();

  if (!user) {
    navigateWithLoopGuard("../login.html", "collaborator-missing-user");
    return;
  }

  if (membership?.status === "disabled" || isPendingWorkspaceAccess(profile, membership, user)) {
    navigateWithLoopGuard("../pending.html", "collaborator-pending");
    return;
  }

  const role = getEffectiveWorkspaceRole(profile, membership, user);
  if (["owner", "admin", "super_admin", "platform_admin", "organizer"].includes(role)) {
    navigateWithLoopGuard("../admin/", "collaborator-admin-role");
    return;
  }

  currentWorkspaceId = workspace?.id || membership?.workspace_id || profile?.workspace_id || DEFAULT_WORKSPACE_ID;
  sessionStatus.textContent = `${user.email} · Collaborator`;
  await loadAssignments(user.email);
}

signoutButton.addEventListener("click", async () => {
  if (!supabase) return;
  await supabase.auth.signOut();
  window.location.href = "../login.html";
});

bootCollaborator().catch((error) => {
  sessionStatus.textContent = error.message;
});
