const runtimeConfig = window.CATER_VEGAS_SUPABASE || {};
const ROUTE_HISTORY_KEY = "caterVegasRouteHistory";
const SUPABASE_MODULE_URLS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm",
  "https://esm.sh/@supabase/supabase-js@2",
];

async function loadSupabaseCreateClient() {
  if (typeof window.supabase?.createClient === "function") {
    return window.supabase.createClient.bind(window.supabase);
  }

  const loaderErrors = [];

  for (const url of SUPABASE_MODULE_URLS) {
    try {
      const module = await import(url);
      const createClient = module.createClient || module.default?.createClient;
      if (typeof createClient === "function") return createClient;
    } catch (error) {
      loaderErrors.push({
        url,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  window.__CATER_VEGAS_SUPABASE_LOADER_ERRORS = loaderErrors;
  return null;
}

const createSupabaseClient = await loadSupabaseCreateClient();

export const DEFAULT_WORKSPACE_ID =
  runtimeConfig.workspaceId ||
  window.CATER_VEGAS_WORKSPACE_ID ||
  "cater-vegas";

export const SUPABASE_URL =
  runtimeConfig.url ||
  window.CATER_VEGAS_SUPABASE_URL ||
  "https://xzoqxdfmylniydfsovwc.supabase.co";

export const SUPABASE_ANON_KEY =
  runtimeConfig.anonKey ||
  window.CATER_VEGAS_SUPABASE_ANON_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6b3F4ZGZteWxuaXlkZnNvdndjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0ODgzMjIsImV4cCI6MjA5NzA2NDMyMn0.CVc8M5MQcYJFH6NzIeoziHaXj0hKIhQ5MH-F0ek_WLM";

export const isSupabaseConfigured =
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY) &&
  !SUPABASE_URL.includes("YOUR_PROJECT_ID") &&
  !SUPABASE_ANON_KEY.includes("YOUR_SUPABASE_ANON_KEY");

export const isSupabaseLibraryLoaded = Boolean(createSupabaseClient);

export const supabase = isSupabaseConfigured && isSupabaseLibraryLoaded
  ? createSupabaseClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: true,
        persistSession: true,
      },
      realtime: {
        params: {
          eventsPerSecond: 8,
        },
      },
    })
  : null;

export function requireSupabase() {
  if (!isSupabaseLibraryLoaded) {
    throw new Error(
      "Supabase JS did not load. Check that the @supabase/supabase-js script is available before lib/supabaseClient.js."
    );
  }

  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Set window.CATER_VEGAS_SUPABASE or replace the placeholders in lib/supabaseClient.js."
    );
  }

  return supabase;
}

function isMissingAuthSessionError(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("auth session missing") || message.includes("missing session");
}

export async function getSession() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function getCurrentUser() {
  const client = requireSupabase();
  const { data, error } = await client.auth.getUser();
  if (error) {
    if (isMissingAuthSessionError(error)) return null;
    throw error;
  }
  return data.user;
}

export async function getCurrentProfile() {
  const client = requireSupabase();
  const user = await getCurrentUser();

  if (!user) {
    return { user: null, profile: null };
  }

  const { data: profile, error } = await client
    .from("cater_profiles")
    .select("*")
    .eq("id", user.id)
    .maybeSingle();

  if (error) throw error;
  return { user, profile };
}

export async function getWorkspace(workspaceId = DEFAULT_WORKSPACE_ID) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("beoflow_workspaces")
    .select("*")
    .eq("id", workspaceId)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function getWorkspaceMembership(workspaceId = DEFAULT_WORKSPACE_ID) {
  const client = requireSupabase();
  const user = await getCurrentUser();

  if (!user) {
    return { user: null, membership: null };
  }

  const { data: membership, error } = await client
    .from("beoflow_workspace_members")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (error) throw error;
  return { user, membership };
}

export async function getWorkspaceContext(workspaceId = DEFAULT_WORKSPACE_ID) {
  const client = requireSupabase();
  const user = await getCurrentUser();

  if (!user) {
    return {
      user: null,
      profile: null,
      membership: null,
      workspace: null,
    };
  }

  const [profileResult, membershipResult, workspaceResult] = await Promise.all([
    client.from("cater_profiles").select("*").eq("id", user.id).maybeSingle(),
    client
      .from("beoflow_workspace_members")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle(),
    client.from("beoflow_workspaces").select("*").eq("id", workspaceId).maybeSingle(),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (membershipResult.error) throw membershipResult.error;

  let membership = membershipResult.data;
  let workspace = workspaceResult.error ? null : workspaceResult.data;

  if (!membership) {
    const { data: memberships } = await client
      .from("beoflow_workspace_members")
      .select("*")
      .eq("user_id", user.id)
      .in("status", ["active", "pending", "invited"]);

    membership =
      (memberships || []).find((item) => item.workspace_id === workspaceId) ||
      (memberships || []).find((item) => item.workspace_id === "cater-vegas") ||
      (memberships || []).find(
        (item) =>
          String(item.status || "").toLowerCase() === "active" &&
          ["owner", "admin", "super_admin", "platform_admin"].includes(String(item.role || "").toLowerCase())
      ) ||
      null;
  }

  const activeWorkspaceId = workspaceId;
  if (activeWorkspaceId && activeWorkspaceId !== workspaceId) {
    const activeWorkspaceResult = await client
      .from("beoflow_workspaces")
      .select("*")
      .eq("id", activeWorkspaceId)
      .maybeSingle();
    if (!activeWorkspaceResult.error) workspace = activeWorkspaceResult.data;
  }

  return {
    user,
    profile: profileResult.data,
    membership,
    workspace,
  };
}

export function getEffectiveWorkspaceRole(profile, membership, user = null, workspaceId = DEFAULT_WORKSPACE_ID) {
  const normalizeRole = (role) => String(role || "").trim().toLowerCase();
  const roleMap = {
    owner: "owner",
    admin: "admin",
    super_admin: "super_admin",
    platform_admin: "platform_admin",
    staff: "organizer",
    organizer: "organizer",
    collaborator: "collaborator",
    client: "viewer",
    viewer: "viewer",
  };

  const rolePriority = {
    platform_admin: 70,
    super_admin: 60,
    owner: 50,
    admin: 45,
    organizer: 30,
    collaborator: 20,
    viewer: 10,
  };

  const profileWorkspaceId = String(profile?.workspace_id || "").trim();
  const profileRole =
    (!profileWorkspaceId || profileWorkspaceId === workspaceId)
      ? roleMap[normalizeRole(profile?.role)] || null
      : null;
  const membershipStatus = String(membership?.status || "").trim().toLowerCase();
  const membershipRole =
    membershipStatus === "active" && membership?.role
      ? roleMap[normalizeRole(membership.role)] || normalizeRole(membership.role)
      : null;

  return [membershipRole, profileRole]
    .filter(Boolean)
    .sort((a, b) => (rolePriority[b] || 0) - (rolePriority[a] || 0))[0] || null;
}

export function isPendingWorkspaceAccess(profile, membership, user = null) {
  const pendingProfileRoles = new Set([
    "workspace_pending",
    "organizer_pending",
    "collaborator_pending",
    "client_pending",
  ]);

  return (
    (["pending", "invited"].includes(membership?.status) || pendingProfileRoles.has(profile?.role)) &&
    !getEffectiveWorkspaceRole(profile, membership, user)
  );
}

export function resolveWorkspacePath(profile, membership, user = null) {
  if (membership?.status === "disabled") {
    return "pending.html?status=disabled";
  }

  if (isPendingWorkspaceAccess(profile, membership, user)) {
    return "pending.html";
  }

  const role = getEffectiveWorkspaceRole(profile, membership, user);

  if (["owner", "admin", "super_admin", "platform_admin"].includes(role)) return "admin/";
  if (role === "collaborator" || role === "organizer") return "collaborator/";
  if (role === "viewer" || profile?.role === "client") return "client/";

  return "pending.html";
}

export async function resolvePostLoginPath(workspaceId = DEFAULT_WORKSPACE_ID) {
  const { user, profile, membership } = await getWorkspaceContext(workspaceId);
  return resolveWorkspacePath(profile, membership, user);
}

export function navigateWithLoopGuard(path, reason = "route") {
  const target = new URL(path, window.location.href);
  const current = new URL(window.location.href);

  if (target.href === current.href) return;

  const now = Date.now();
  let history = [];

  try {
    const rawHistory = window.sessionStorage.getItem(ROUTE_HISTORY_KEY);
    history = rawHistory ? JSON.parse(rawHistory) : [];
  } catch {
    history = [];
  }

  const recent = history.filter((item) => now - Number(item.at || 0) < 6000);
  recent.push({
    at: now,
    from: current.pathname,
    to: target.pathname,
    reason,
  });

  window.sessionStorage.setItem(ROUTE_HISTORY_KEY, JSON.stringify(recent.slice(-8)));

  const routeSet = new Set(recent.flatMap((item) => [item.from, item.to]));
  if (recent.length >= 4 && routeSet.size <= 3) {
    throw new Error("A repeated redirect was stopped. Review the user's role in Supabase.");
  }

  window.location.replace(target.href);
}

export function subscribeToEvents(onChange, options = {}) {
  const client = requireSupabase();
  const workspaceId = options.workspaceId || DEFAULT_WORKSPACE_ID;
  const eventFilter = options.filter || {
    filter: `workspace_id=eq.${workspaceId}`,
  };

  return client
    .channel(options.channelName || `${workspaceId}-events`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "cater_events",
        ...eventFilter,
      },
      onChange
    )
    .subscribe();
}
