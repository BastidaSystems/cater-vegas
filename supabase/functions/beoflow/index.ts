import { createClient } from "@supabase/supabase-js";

type CaterPlan = {
  budget?: string | null;
  budgetLabel?: string | null;
  eventType?: string | null;
  menuStyle?: string | null;
  services?: string[];
  [key: string]: unknown;
};

type BeoflowResult = {
  reply: string;
  updates: {
    budget: string | null;
    budgetLabel: string | null;
    eventType: string | null;
    menuStyle: string | null;
    services: string[];
  };
  suggestions: string[];
  source?: "openai" | "local";
  collaboratorAction?: CollaboratorActionResult | null;
  customerAction?: CustomerActionResult | null;
  eventAction?: EventActionResult | null;
  beoflowSync?: BeoflowSyncResult | null;
};

type BeoflowSyncResult = {
  status: "skipped" | "synced" | "failed";
  reason?: string;
  clientId?: string;
  eventId?: string | null;
  providerId?: string | null;
  providerRecordId?: string | null;
  activityId?: string | null;
};

type CaterEventRow = {
  id: number;
  workspace_id: string;
  customer_id?: number | null;
  title: string | null;
  event_type?: string | null;
  status?: string | null;
  budget?: string | null;
  budget_label?: string | null;
  menu_style?: string | null;
  services?: string[] | null;
  plan?: Record<string, unknown> | null;
  event_date?: string | null;
  guest_count?: number | null;
  venue_name?: string | null;
  notes?: string | null;
  client_id?: string | null;
  assigned_to?: string | null;
  created_by?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CaterProviderRow = {
  id: number;
  workspace_id: string;
  provider_name: string | null;
  provider_type?: string | null;
  contact_name?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  state?: string | null;
  status?: string | null;
  notes?: string | null;
  created_by?: string | null;
  coverage_zone?: string | null;
  availability?: string | null;
  base_prices?: string | null;
  service_category?: string | null;
  public_visible?: boolean | null;
  public_description?: string | null;
  source?: string | null;
  license_insurance?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type CollaboratorCommand = {
  fullName: string;
  email: string | null;
  role: CollaboratorRole;
  eventHint: string | null;
};

type CollaboratorActionResult = {
  collaboratorId: number;
  collaboratorName: string;
  role: CollaboratorRole;
  eventId: number | null;
  eventTitle: string | null;
  assigned: boolean;
  message: string;
};

type CustomerCommand = {
  fullName: string;
  email: string | null;
  phone: string | null;
};

type CustomerActionResult = {
  customerId: number;
  customerName: string;
  created: boolean;
  message: string;
};

type EventForCustomerCommand = {
  customerName: string;
  email: string | null;
  eventTitle: string | null;
};

type EventActionResult = {
  eventId: number;
  eventTitle: string;
  customerId: number;
  customerName: string;
  message: string;
};

type CollaboratorRole =
  | "owner"
  | "admin"
  | "organizer"
  | "chef"
  | "driver"
  | "server"
  | "staff"
  | "viewer";

const DEFAULT_WORKSPACE_ID = "cater-vegas";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SYNC_MANAGER_ROLES = new Set(["owner", "admin", "super_admin", "platform_admin"]);
const CATER_OWNER_EMAILS = new Set(["exmarquesado@gmail.com"]);

const EVENT_SAVE_COLUMNS = new Set([
  "workspace_id",
  "customer_id",
  "title",
  "event_type",
  "status",
  "budget",
  "budget_label",
  "menu_style",
  "services",
  "plan",
  "event_date",
  "guest_count",
  "venue_name",
  "notes",
  "client_id",
  "assigned_to",
  "created_by",
]);

const PROVIDER_DETAIL_COLUMNS = new Set([
  "coverage_zone",
  "availability",
  "base_prices",
  "service_category",
  "public_visible",
  "public_description",
  "source",
  "license_insurance",
]);

const PROVIDER_BASE_COLUMNS = new Set([
  "workspace_id",
  "provider_name",
  "provider_type",
  "contact_name",
  "email",
  "phone",
  "website",
  "city",
  "state",
  "status",
  "notes",
  "created_by",
]);

const PROVIDER_SAVE_COLUMNS = new Set([...PROVIDER_BASE_COLUMNS, ...PROVIDER_DETAIL_COLUMNS]);

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function jsonError(error: string, status = 400, details?: unknown) {
  return jsonResponse({ error, ...(details ? { details } : {}) }, status);
}

function normalizeRoleValue(role: unknown) {
  return String(role || "").trim().toLowerCase();
}

function isSyncManagerRole(role: unknown) {
  return SYNC_MANAGER_ROLES.has(normalizeRoleValue(role));
}

function isActiveStatus(status: unknown) {
  const normalized = normalizeRoleValue(status || "active");
  return normalized === "active";
}

function pickKnownPayload(payload: Record<string, unknown>, allowedColumns: Set<string>) {
  return Object.fromEntries(
    Object.entries(payload).filter(([key, value]) => allowedColumns.has(key) && value !== undefined),
  );
}

function isSchemaCacheError(error: unknown) {
  const typed = error as { code?: string; message?: string } | null;
  const message = String(typed?.message || "").toLowerCase();
  return typed?.code === "PGRST204" || typed?.code === "42703" || message.includes("schema cache") || message.includes("column");
}

function localBeoflow(message: string, currentPlan: CaterPlan): BeoflowResult {
  const text = message.toLowerCase();
  const services = [...(currentPlan.services || [])];
  const updates: BeoflowResult["updates"] = {
    budget: null,
    budgetLabel: null,
    eventType: null,
    menuStyle: null,
    services,
  };
  const suggestions: string[] = [];

  if (text.includes("boda")) updates.eventType = "Boda";
  if (text.includes("corporativo") || text.includes("empresa")) {
    updates.eventType = "Corporativo";
  }
  if (text.includes("vip") || text.includes("lujo") || text.includes("luxury")) {
    updates.eventType = "VIP";
  }

  const addService = (service: string) => {
    if (!updates.services.includes(service)) updates.services.push(service);
  };

  if (text.includes("transporte") || text.includes("chofer") || text.includes("shuttle")) {
    addService("Transporte");
  }
  if (text.includes("hotel") || text.includes("hospedaje") || text.includes("habitaciones")) {
    addService("Hospedaje");
  }
  if (text.includes("staff") || text.includes("meseros")) addService("Staff");
  if (text.includes("decoración") || text.includes("decoracion")) addService("Decoración");

  if (!updates.eventType && updates.services.length === (currentPlan.services || []).length) {
    suggestions.push("Describe el tipo de evento, servicios o presupuesto para ajustar el plan.");
  }

  return {
    reply: suggestions.length
      ? "Guardé tu idea para BEOFlow."
      : "BEOFlow ajustó el plan con lo que escribiste.",
    updates,
    suggestions,
    source: "local",
  };
}

function extractOutputText(data: Record<string, any>) {
  if (typeof data.output_text === "string") return data.output_text;

  for (const item of data.output || []) {
    for (const content of item.content || []) {
      if (typeof content.text === "string") return content.text;
    }
  }

  return "";
}

async function callOpenAI(message: string, currentPlan: CaterPlan): Promise<BeoflowResult> {
  const apiKey = Deno.env.get("OPENAI_API_KEY");

  if (!apiKey) {
    return localBeoflow(message, currentPlan);
  }

  const model = Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini";

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      input: [
        {
          role: "system",
          content:
            "You are BEOFlow, an event planning brain for a workspace inside BEOFlow Platform. Return only compact JSON with reply, updates, and suggestions. updates must include budget, budgetLabel, eventType, menuStyle, and services. Never invent final prices.",
        },
        {
          role: "user",
          content: JSON.stringify({ message, currentPlan }),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "beoflow_plan_update",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              reply: { type: "string" },
              updates: {
                type: "object",
                additionalProperties: false,
                properties: {
                  budget: { type: ["string", "null"] },
                  budgetLabel: { type: ["string", "null"] },
                  eventType: { type: ["string", "null"] },
                  menuStyle: { type: ["string", "null"] },
                  services: {
                    type: "array",
                    items: { type: "string" },
                  },
                },
                required: ["budget", "budgetLabel", "eventType", "menuStyle", "services"],
              },
              suggestions: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: ["reply", "updates", "suggestions"],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${errorText}`);
  }

  const data = await response.json();
  const outputText = extractOutputText(data);
  return { ...JSON.parse(outputText), source: "openai" };
}

function mergedPlan(currentPlan: CaterPlan, updates: BeoflowResult["updates"]) {
  return {
    ...currentPlan,
    ...(updates.budget ? { budget: updates.budget } : {}),
    ...(updates.budgetLabel ? { budgetLabel: updates.budgetLabel } : {}),
    ...(updates.eventType ? { eventType: updates.eventType } : {}),
    ...(updates.menuStyle ? { menuStyle: updates.menuStyle } : {}),
    services: Array.isArray(updates.services) ? updates.services : currentPlan.services || [],
  };
}

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function cleanName(value: string) {
  return value
    .replace(/\b(con|with)\s+email\s+\S+/gi, "")
    .replace(/\b(email|correo)\s+\S+/gi, "")
    .replace(/[.,;:]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function roleFromAlias(value: string): CollaboratorRole | null {
  const normalized = normalizeText(value);
  const roleMap: Record<string, CollaboratorRole> = {
    dueno: "owner",
    owner: "owner",
    admin: "admin",
    administrador: "admin",
    organizador: "organizer",
    organizadora: "organizer",
    organizer: "organizer",
    planner: "organizer",
    coordinador: "organizer",
    coordinadora: "organizer",
    chef: "chef",
    cocinero: "chef",
    cocinera: "chef",
    driver: "driver",
    chofer: "driver",
    conductor: "driver",
    conductora: "driver",
    server: "server",
    mesero: "server",
    mesera: "server",
    staff: "staff",
    equipo: "staff",
    viewer: "viewer",
    observador: "viewer",
    observadora: "viewer",
    lector: "viewer",
  };

  return roleMap[normalized] || null;
}

function parseCollaboratorCommand(message: string): CollaboratorCommand | null {
  const roleAliases =
    "dueño|dueno|owner|admin|administrador|organizador|organizadora|organizer|planner|coordinador|coordinadora|chef|cocinero|cocinera|driver|chofer|conductor|conductora|server|mesero|mesera|staff|equipo|viewer|observador|observadora|lector";

  const patterns = [
    new RegExp(
      `(?:agrega|añade|anade|invita|asigna)\\s+a\\s+(.+?)\\s+como\\s+(${roleAliases})(?:\\s+(?:al|a el|para el|para la|en el|en la)\\s+(?:evento\\s+)?(.+))?$`,
      "i",
    ),
    new RegExp(
      `(?:add|invite|assign)\\s+(.+?)\\s+as\\s+(${roleAliases})(?:\\s+(?:to|for|in)\\s+(?:event\\s+)?(.+))?$`,
      "i",
    ),
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match) continue;

    const email = message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
    const role = roleFromAlias(match[2]);
    const fullName = cleanName(match[1]);

    if (!role || !fullName) return null;

    return {
      fullName,
      email,
      role,
      eventHint: match[3] ? match[3].replace(/[.,;:]+$/g, "").trim() : null,
    };
  }

  return null;
}

function parseCustomerCommand(message: string): CustomerCommand | null {
  const normalized = normalizeText(message);

  if (normalized.includes("evento para") || normalized.includes("event for")) {
    return null;
  }

  const patterns = [
    /(?:crea|crear|agrega|agregar|añade|anade)\s+(?:cliente|customer)\s+(.+?)(?:\s+(?:con|with)\s+(?:email|correo)\s+(\S+))?$/i,
    /(?:cliente|customer)\s+(.+?)(?:\s+(?:con|with)\s+(?:email|correo)\s+(\S+))?$/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match) continue;

    const email = match[2] || message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
    const phone = message.match(/(?:\+?\d[\d\s().-]{6,}\d)/)?.[0]?.trim() || null;
    const fullName = cleanName(match[1]);

    if (!fullName) return null;
    return { fullName, email, phone };
  }

  return null;
}

function parseEventForCustomerCommand(message: string): EventForCustomerCommand | null {
  const patterns = [
    /(?:crea|crear|agenda|programa)\s+(?:un\s+|el\s+)?evento\s+(?:para|de)\s+(.+?)(?:\s+(?:con|with)\s+(?:email|correo)\s+(\S+))?$/i,
    /(?:create|schedule)\s+(?:an?\s+)?event\s+for\s+(.+?)(?:\s+with\s+email\s+(\S+))?$/i,
  ];

  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (!match) continue;

    const email = match[2] || message.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || null;
    const customerName = cleanName(match[1]);

    if (!customerName) return null;
    return {
      customerName,
      email,
      eventTitle: `Evento para ${customerName}`,
    };
  }

  return null;
}

function profileRoleToWorkspaceRole(role: string | null) {
  const normalized = normalizeRoleValue(role);
  const roleMap: Record<string, string> = {
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

  return normalized ? roleMap[normalized] || null : null;
}

async function getCurrentWorkspaceRole(
  userClient: ReturnType<typeof createClient>,
  userId: string,
  workspaceId: string,
) {
  const { data: membership } = await userClient
    .from("beoflow_workspace_members")
    .select("role,status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (membership?.status === "active" && membership.role) {
    return membership.role;
  }

  const { data: profile } = await userClient
    .from("cater_profiles")
    .select("role,workspace_id")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.workspace_id === workspaceId) {
    return profileRoleToWorkspaceRole(profile.role);
  }

  return null;
}

async function findAccessibleEvent(
  userClient: ReturnType<typeof createClient>,
  eventId: number | null,
  eventHint: string | null,
  workspaceId: string,
) {
  if (eventId) {
    const { data } = await userClient
      .from("cater_events")
      .select("id,title")
      .eq("workspace_id", workspaceId)
      .eq("id", eventId)
      .maybeSingle();

    return data || null;
  }

  if (!eventHint) return null;

  const { data: directMatch } = await userClient
    .from("cater_events")
    .select("id,title")
    .eq("workspace_id", workspaceId)
    .ilike("title", `%${eventHint}%`)
    .limit(1)
    .maybeSingle();

  if (directMatch) return directMatch;

  const { data: candidates } = await userClient
    .from("cater_events")
    .select("id,title")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(50);

  const normalizedHint = normalizeText(eventHint);
  return (
    candidates?.find((event: { title: string }) =>
      normalizeText(event.title || "").includes(normalizedHint),
    ) || null
  );
}

async function upsertCollaboratorFromCommand(
  serviceClient: ReturnType<typeof createClient>,
  command: CollaboratorCommand,
  workspaceId: string,
) {
  const baseQuery = serviceClient
    .from("cater_collaborators")
    .select("id,full_name,email,role,status")
    .eq("workspace_id", workspaceId);

  const { data: existing } = command.email
    ? await baseQuery.eq("email", command.email).maybeSingle()
    : await baseQuery.ilike("full_name", command.fullName).limit(1).maybeSingle();

  const payload = {
    workspace_id: workspaceId,
    full_name: command.fullName,
    email: command.email,
    role: command.role,
    status: "active",
  };

  if (existing?.id) {
    const { data, error } = await serviceClient
      .from("cater_collaborators")
      .update(payload)
      .eq("workspace_id", workspaceId)
      .eq("id", existing.id)
      .select("id,full_name,email,role,status")
      .single();

    if (error) throw error;
    return data;
  }

  const { data, error } = await serviceClient
    .from("cater_collaborators")
    .insert(payload)
    .select("id,full_name,email,role,status")
    .single();

  if (error) throw error;
  return data;
}

async function handleCollaboratorCommand(params: {
  command: CollaboratorCommand | null;
  userClient: ReturnType<typeof createClient>;
  serviceClient: ReturnType<typeof createClient>;
  userId: string;
  eventId: number | null;
  workspaceId: string;
}): Promise<CollaboratorActionResult | null> {
  if (!params.command) return null;

  const role = await getCurrentWorkspaceRole(params.userClient, params.userId, params.workspaceId);
  if (!["owner", "admin"].includes(role || "")) {
    return {
      collaboratorId: 0,
      collaboratorName: params.command.fullName,
      role: params.command.role,
      eventId: null,
      eventTitle: null,
      assigned: false,
      message: "Solo owner/admin del workspace puede crear o actualizar colaboradores.",
    };
  }

  const targetEvent = await findAccessibleEvent(
    params.userClient,
    params.eventId,
    params.command.eventHint,
    params.workspaceId,
  );
  const collaborator = await upsertCollaboratorFromCommand(
    params.serviceClient,
    params.command,
    params.workspaceId,
  );

  let assigned = false;

  if (targetEvent?.id) {
    const { error } = await params.serviceClient.from("cater_event_assignments").upsert(
      {
        workspace_id: params.workspaceId,
        event_id: targetEvent.id,
        collaborator_id: collaborator.id,
        assignment_role: params.command.role,
        status: "active",
        notes: "Asignado por BEOFlow.",
      },
      { onConflict: "event_id,collaborator_id" },
    );

    if (error) throw error;
    assigned = true;
  }

  return {
    collaboratorId: collaborator.id,
    collaboratorName: collaborator.full_name,
    role: params.command.role,
    eventId: targetEvent?.id || null,
    eventTitle: targetEvent?.title || null,
    assigned,
    message: assigned
      ? `${collaborator.full_name} quedó como ${params.command.role} en ${targetEvent.title}.`
      : `${collaborator.full_name} quedó guardado como ${params.command.role}.`,
  };
}

async function upsertCustomerFromCommand(
  serviceClient: ReturnType<typeof createClient>,
  command: CustomerCommand,
  workspaceId: string,
) {
  const baseQuery = serviceClient
    .from("cater_customers")
    .select("id,full_name,email,phone,notes")
    .eq("workspace_id", workspaceId);

  const { data: existing } = command.email
    ? await baseQuery.ilike("email", command.email).maybeSingle()
    : await baseQuery.ilike("full_name", command.fullName).limit(1).maybeSingle();

  const payload = {
    workspace_id: workspaceId,
    full_name: command.fullName,
    email: command.email,
    phone: command.phone,
  };

  if (existing?.id) {
    const { data, error } = await serviceClient
      .from("cater_customers")
      .update(payload)
      .eq("workspace_id", workspaceId)
      .eq("id", existing.id)
      .select("id,full_name,email,phone")
      .single();

    if (error) throw error;
    return { customer: data, created: false };
  }

  const { data, error } = await serviceClient
    .from("cater_customers")
    .insert(payload)
    .select("id,full_name,email,phone")
    .single();

  if (error) throw error;
  return { customer: data, created: true };
}

async function handleCustomerCommand(params: {
  command: CustomerCommand | null;
  userClient: ReturnType<typeof createClient>;
  serviceClient: ReturnType<typeof createClient>;
  userId: string;
  workspaceId: string;
}): Promise<CustomerActionResult | null> {
  if (!params.command) return null;

  const role = await getCurrentWorkspaceRole(params.userClient, params.userId, params.workspaceId);
  if (!["owner", "admin", "organizer"].includes(role || "")) {
    return {
      customerId: 0,
      customerName: params.command.fullName,
      created: false,
      message: "Solo owner/admin/organizer del workspace puede crear clientes.",
    };
  }

  const { customer, created } = await upsertCustomerFromCommand(
    params.serviceClient,
    params.command,
    params.workspaceId,
  );

  return {
    customerId: customer.id,
    customerName: customer.full_name,
    created,
    message: created
      ? `${customer.full_name} quedó creado como customer.`
      : `${customer.full_name} quedó actualizado como customer.`,
  };
}

async function handleEventForCustomerCommand(params: {
  command: EventForCustomerCommand | null;
  userClient: ReturnType<typeof createClient>;
  serviceClient: ReturnType<typeof createClient>;
  userId: string;
  workspaceId: string;
}): Promise<EventActionResult | null> {
  if (!params.command) return null;

  const role = await getCurrentWorkspaceRole(params.userClient, params.userId, params.workspaceId);
  if (!["owner", "admin", "organizer"].includes(role || "")) {
    return {
      eventId: 0,
      eventTitle: params.command.eventTitle || `Evento para ${params.command.customerName}`,
      customerId: 0,
      customerName: params.command.customerName,
      message: "Solo owner/admin/organizer del workspace puede crear eventos.",
    };
  }

  const { customer } = await upsertCustomerFromCommand(
    params.serviceClient,
    {
      fullName: params.command.customerName,
      email: params.command.email,
      phone: null,
    },
    params.workspaceId,
  );

  const eventTitle = params.command.eventTitle || `Evento para ${customer.full_name}`;
  const { data: event, error } = await params.serviceClient
    .from("cater_events")
    .insert({
      workspace_id: params.workspaceId,
      customer_id: customer.id,
      title: eventTitle,
      status: "draft",
      created_by: params.userId,
      plan: {
        customerName: customer.full_name,
      },
    })
    .select("id,title,customer_id")
    .single();

  if (error) throw error;

  return {
    eventId: event.id,
    eventTitle: event.title,
    customerId: customer.id,
    customerName: customer.full_name,
    message: `${event.title} quedó creado para ${customer.full_name}.`,
  };
}

function normalizeSupabaseProjectUrl(value: string) {
  return value.trim().replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
}

function getBeoflowSyncClient(): {
  client: ReturnType<typeof createClient> | null;
  reason?: string;
} {
  const rawUrl = Deno.env.get("BEOFLOW_SUPABASE_URL") || Deno.env.get("BEOFLOW_URL");
  const serviceRoleKey = Deno.env.get("BEOFLOW_SERVICE_ROLE_KEY");

  if (!rawUrl || !serviceRoleKey) {
    return {
      client: null,
      reason: "BEOFlow sync secrets are not configured.",
    };
  }

  return {
    client: createClient(normalizeSupabaseProjectUrl(rawUrl), serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }),
  };
}

async function resolveBeoflowClientId(beoflowClient: ReturnType<typeof createClient>) {
  const configuredClientId = Deno.env.get("BEOFLOW_CLIENT_ID")?.trim();
  if (configuredClientId) return configuredClientId;

  const clientName = Deno.env.get("BEOFLOW_CLIENT_NAME")?.trim() || "Cater Vegas";
  const { data, error } = await beoflowClient
    .from("clients")
    .select("id,name")
    .ilike("name", clientName)
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data?.id) throw new Error(`BEOFlow client "${clientName}" was not found.`);
  return data.id as string;
}

async function getBeoflowSyncStatus(): Promise<BeoflowSyncResult> {
  const { client: beoflowClient, reason } = getBeoflowSyncClient();
  if (!beoflowClient) return { status: "skipped", reason };

  try {
    const clientId = await resolveBeoflowClientId(beoflowClient);
    return {
      status: "synced",
      clientId,
      reason: "BEOFlow sync is configured.",
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeBeoflowEventName(event: CaterEventRow) {
  return event.title?.trim() || `Cater Vegas event #${event.id}`;
}

function buildBeoflowEventNotes(event: CaterEventRow) {
  return [
    event.notes,
    event.budget_label ? `Budget: ${event.budget_label}` : null,
    event.menu_style ? `Menu style: ${event.menu_style}` : null,
    Array.isArray(event.services) && event.services.length
      ? `Services: ${event.services.join(", ")}`
      : null,
    `Source: Cater Vegas event #${event.id}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildBeoflowEventPayload(event: CaterEventRow, clientId: string, syncedAt: string) {
  return {
    client_id: clientId,
    name: normalizeBeoflowEventName(event),
    event_type: event.event_type || null,
    event_date: event.event_date || null,
    guest_count: event.guest_count || null,
    location: event.venue_name || null,
    status: event.status || "active",
    notes: buildBeoflowEventNotes(event),
    source: "cater-vegas",
    source_id: String(event.id),
    source_url: null,
    source_metadata: {
      cater_event_id: event.id,
      cater_workspace_id: event.workspace_id,
      cater_customer_id: event.customer_id || null,
      budget: event.budget || null,
      budget_label: event.budget_label || null,
      menu_style: event.menu_style || null,
      services: event.services || [],
      cater_created_by: event.created_by || null,
      cater_updated_at: event.updated_at || null,
    },
    last_synced_at: syncedAt,
  };
}

function buildActivitySummary(event: CaterEventRow) {
  const details = [
    event.event_date ? `date ${event.event_date}` : null,
    event.guest_count ? `${event.guest_count} guests` : null,
    event.venue_name ? `venue ${event.venue_name}` : null,
    event.status ? `status ${event.status}` : null,
  ].filter(Boolean);

  return details.length
    ? `Cater Vegas event "${normalizeBeoflowEventName(event)}" synced with ${details.join(", ")}.`
    : `Cater Vegas event "${normalizeBeoflowEventName(event)}" synced.`;
}

async function syncCaterEventToBeoflow(
  serviceClient: ReturnType<typeof createClient>,
  eventId: number,
  workspaceId: string,
): Promise<BeoflowSyncResult> {
  const { client: beoflowClient, reason } = getBeoflowSyncClient();
  if (!beoflowClient) return { status: "skipped", reason };

  const { data: event, error: eventError } = await serviceClient
    .from("cater_events")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    return { status: "failed", reason: eventError.message };
  }

  if (!event) {
    return { status: "skipped", reason: `Cater event ${eventId} was not found.` };
  }

  try {
    const clientId = await resolveBeoflowClientId(beoflowClient);
    const syncedAt = new Date().toISOString();
    const { data: beoflowEvent, error: beoflowEventError } = await beoflowClient
      .from("beoflow_events")
      .upsert(buildBeoflowEventPayload(event as CaterEventRow, clientId, syncedAt), {
        onConflict: "client_id,source,source_id",
      })
      .select("id")
      .single();

    if (beoflowEventError) throw beoflowEventError;

    const activityPayload = {
      client_id: clientId,
      source: "cater-vegas",
      source_table: "cater_events",
      source_id: String(event.id),
      activity_type: "event_synced",
      title: `Synced event: ${normalizeBeoflowEventName(event as CaterEventRow)}`,
      summary: buildActivitySummary(event as CaterEventRow),
      metadata: {
        cater_event_id: event.id,
        beoflow_event_id: beoflowEvent?.id || null,
        cater_workspace_id: event.workspace_id,
        synced_at: syncedAt,
      },
      status: "active",
    };

    const { data: activity, error: activityError } = await beoflowClient
      .from("beoflow_activity_log")
      .upsert(activityPayload, {
        onConflict: "client_id,source,source_table,source_id,activity_type",
      })
      .select("id")
      .single();

    if (activityError) throw activityError;

    return {
      status: "synced",
      clientId,
      eventId: beoflowEvent?.id || null,
      activityId: activity?.id || null,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

function normalizeBeoflowProviderName(provider: CaterProviderRow) {
  return provider.provider_name?.trim() || `Cater Vegas provider #${provider.id}`;
}

function buildBeoflowProviderNotes(provider: CaterProviderRow) {
  return [
    provider.notes,
    provider.contact_name ? `Contact: ${provider.contact_name}` : null,
    provider.email ? `Email: ${provider.email}` : null,
    provider.phone ? `Phone: ${provider.phone}` : null,
    provider.website ? `Website: ${provider.website}` : null,
    [provider.city, provider.state].filter(Boolean).length
      ? `Location: ${[provider.city, provider.state].filter(Boolean).join(", ")}`
      : null,
    `Source: Cater Vegas provider #${provider.id}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function buildBeoflowProviderPayload(provider: CaterProviderRow, clientId: string, syncedAt: string) {
  return {
    client_id: clientId,
    name: normalizeBeoflowProviderName(provider),
    provider_type: provider.provider_type || "vendor",
    contact_name: provider.contact_name || null,
    email: provider.email || null,
    phone: provider.phone || null,
    website: provider.website || null,
    city: provider.city || null,
    state: provider.state || null,
    status: provider.status || "active",
    notes: buildBeoflowProviderNotes(provider),
    source: "cater-vegas",
    source_id: String(provider.id),
    source_url: null,
    source_metadata: {
      cater_provider_id: provider.id,
      cater_workspace_id: provider.workspace_id,
      cater_created_by: provider.created_by || null,
      cater_updated_at: provider.updated_at || null,
    },
    last_synced_at: syncedAt,
  };
}

function buildProviderActivitySummary(provider: CaterProviderRow) {
  const details = [
    provider.provider_type ? `type ${provider.provider_type}` : null,
    provider.status ? `status ${provider.status}` : null,
    provider.email ? `email ${provider.email}` : null,
    [provider.city, provider.state].filter(Boolean).length
      ? `location ${[provider.city, provider.state].filter(Boolean).join(", ")}`
      : null,
  ].filter(Boolean);

  return details.length
    ? `Cater Vegas provider "${normalizeBeoflowProviderName(provider)}" synced with ${details.join(", ")}.`
    : `Cater Vegas provider "${normalizeBeoflowProviderName(provider)}" synced.`;
}

async function syncCaterProviderToBeoflow(
  serviceClient: ReturnType<typeof createClient>,
  providerRecordId: number,
  workspaceId: string,
): Promise<BeoflowSyncResult> {
  const { client: beoflowClient, reason } = getBeoflowSyncClient();
  if (!beoflowClient) return { status: "skipped", reason };

  const { data: provider, error: providerError } = await serviceClient
    .from("cater_providers")
    .select("*")
    .eq("workspace_id", workspaceId)
    .eq("id", providerRecordId)
    .maybeSingle();

  if (providerError) {
    return { status: "failed", reason: providerError.message };
  }

  if (!provider) {
    return { status: "skipped", reason: `Cater provider ${providerRecordId} was not found.` };
  }

  try {
    const clientId = await resolveBeoflowClientId(beoflowClient);
    const syncedAt = new Date().toISOString();
    const providerRow = provider as CaterProviderRow;
    const { data: beoflowProvider, error: beoflowProviderError } = await beoflowClient
      .from("beoflow_providers")
      .upsert(buildBeoflowProviderPayload(providerRow, clientId, syncedAt), {
        onConflict: "client_id,source,source_id",
      })
      .select("id")
      .single();

    if (beoflowProviderError) throw beoflowProviderError;

    const activityPayload = {
      client_id: clientId,
      source: "cater-vegas",
      source_table: "cater_providers",
      source_id: String(providerRow.id),
      activity_type: "provider_synced",
      title: `Synced provider: ${normalizeBeoflowProviderName(providerRow)}`,
      summary: buildProviderActivitySummary(providerRow),
      metadata: {
        cater_provider_id: providerRow.id,
        beoflow_provider_id: beoflowProvider?.id || null,
        cater_workspace_id: providerRow.workspace_id,
        synced_at: syncedAt,
      },
      status: "active",
    };

    const { data: activity, error: activityError } = await beoflowClient
      .from("beoflow_activity_log")
      .upsert(activityPayload, {
        onConflict: "client_id,source,source_table,source_id,activity_type",
      })
      .select("id")
      .single();

    if (activityError) throw activityError;

    return {
      status: "synced",
      clientId,
      providerId: beoflowProvider?.id || null,
      providerRecordId: String(providerRow.id),
      activityId: activity?.id || null,
    };
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}

type AuthenticatedServiceContext = {
  errorResponse: Response | null;
  serviceClient: ReturnType<typeof createClient> | null;
  user: { id: string; email?: string | null } | null;
};

async function buildAuthenticatedServiceContext(request: Request): Promise<AuthenticatedServiceContext> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = request.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authHeader) {
    return {
      errorResponse: jsonError("Sync is not configured.", 500),
      serviceClient: null,
      user: null,
    };
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();

  if (userError || !user) {
    return {
      errorResponse: jsonError("Authentication is required.", 401),
      serviceClient: null,
      user: null,
    };
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });

  return { errorResponse: null, serviceClient, user: { id: user.id, email: user.email } };
}

async function userCanSyncWorkspace(
  serviceClient: ReturnType<typeof createClient>,
  user: { id: string; email?: string | null },
  workspaceId: string,
) {
  const { data: membership } = await serviceClient
    .from("beoflow_workspace_members")
    .select("role,status")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membership && isActiveStatus(membership.status) && isSyncManagerRole(membership.role)) return true;

  const { data: profile } = await serviceClient
    .from("cater_profiles")
    .select("role,workspace_id,email")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.workspace_id === workspaceId && isSyncManagerRole(profileRoleToWorkspaceRole(profile.role))) {
    return true;
  }

  const email = String(user.email || profile?.email || "").trim().toLowerCase();
  return CATER_OWNER_EMAILS.has(email);
}

async function validateAuthenticatedWorkspaceRequest(request: Request, workspaceId: string) {
  const context = await buildAuthenticatedServiceContext(request);
  if (context.errorResponse || !context.serviceClient || !context.user) return context;

  const allowed = await userCanSyncWorkspace(context.serviceClient, context.user, workspaceId);
  if (!allowed) {
    return {
      errorResponse: jsonError("Workspace admin access is required.", 403),
      serviceClient: null,
      user: null,
    };
  }

  return context;
}

async function assertWorkspaceRecordExists(
  serviceClient: ReturnType<typeof createClient>,
  tableName: string,
  recordId: number,
  workspaceId: string,
  label: string,
) {
  const { data, error } = await serviceClient
    .from(tableName)
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", recordId)
    .maybeSingle();

  if (error) return { errorResponse: jsonError(`${label} could not be checked.`, 400, error.message) };
  if (!data) return { errorResponse: jsonError(`${label} was not found.`, 404) };
  return { errorResponse: null };
}

async function insertCaterEventWithService(
  serviceClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  userId: string,
  workspaceId: string,
) {
  const safePayload = pickKnownPayload(payload, EVENT_SAVE_COLUMNS);
  safePayload.workspace_id = workspaceId;
  if (!safePayload.created_by) safePayload.created_by = userId;
  if (!safePayload.status) safePayload.status = "draft";

  const { data, error } = await serviceClient
    .from("cater_events")
    .insert(safePayload)
    .select("*")
    .single();

  return { data, error };
}

async function saveCaterProviderWithService(
  serviceClient: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
  userId: string,
  workspaceId: string,
  providerRecordId: number | null,
) {
  const safePayload = pickKnownPayload(payload, PROVIDER_SAVE_COLUMNS);
  safePayload.workspace_id = workspaceId;
  if (!safePayload.created_by) safePayload.created_by = userId;
  if (!safePayload.status) safePayload.status = "active";
  if (!safePayload.source) safePayload.source = "cater_vegas_admin";

  const runSave = async (nextPayload: Record<string, unknown>) => {
    if (providerRecordId) {
      return serviceClient
        .from("cater_providers")
        .update(nextPayload)
        .eq("workspace_id", workspaceId)
        .eq("id", providerRecordId)
        .select("*")
        .single();
    }

    return serviceClient
      .from("cater_providers")
      .insert(nextPayload)
      .select("*")
      .single();
  };

  let result = await runSave(safePayload);

  if (result.error && isSchemaCacheError(result.error)) {
    result = await runSave(pickKnownPayload(safePayload, PROVIDER_BASE_COLUMNS));
  }

  return { data: result.data, error: result.error };
}

async function validateSyncEventRequest(
  request: Request,
  eventId: number,
  workspaceId: string,
) {
  const context = await validateAuthenticatedWorkspaceRequest(request, workspaceId);
  if (context.errorResponse || !context.serviceClient) {
    return { errorResponse: context.errorResponse, serviceClient: null };
  }

  const record = await assertWorkspaceRecordExists(
    context.serviceClient,
    "cater_events",
    eventId,
    workspaceId,
    "Event",
  );
  if (record.errorResponse) return { errorResponse: record.errorResponse, serviceClient: null };

  return { errorResponse: null, serviceClient: context.serviceClient };
}

async function validateSyncProviderRequest(
  request: Request,
  providerRecordId: number,
  workspaceId: string,
) {
  const context = await validateAuthenticatedWorkspaceRequest(request, workspaceId);
  if (context.errorResponse || !context.serviceClient) {
    return { errorResponse: context.errorResponse, serviceClient: null };
  }

  const record = await assertWorkspaceRecordExists(
    context.serviceClient,
    "cater_providers",
    providerRecordId,
    workspaceId,
    "Provider",
  );
  if (record.errorResponse) return { errorResponse: record.errorResponse, serviceClient: null };

  return { errorResponse: null, serviceClient: context.serviceClient };
}

async function persistBeoflowRun(
  request: Request,
  eventId: number | null,
  message: string,
  currentPlan: CaterPlan,
  result: BeoflowResult,
  workspaceId: string,
) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authHeader = request.headers.get("Authorization");

  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authHeader) return;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });

  const {
    data: { user },
  } = await userClient.auth.getUser();

  if (!user) return;

  const serviceClient = createClient(supabaseUrl, serviceRoleKey);
  let targetEventId = eventId;

  const eventCommand = parseEventForCustomerCommand(message);
  const eventAction = await handleEventForCustomerCommand({
    command: eventCommand,
    userClient,
    serviceClient,
    userId: user.id,
    workspaceId,
  });

  if (eventAction) {
    result.eventAction = eventAction;
    result.reply = `${result.reply} ${eventAction.message}`;
    if (eventAction.eventId > 0) targetEventId = eventAction.eventId;
  }

  const customerCommand = eventCommand ? null : parseCustomerCommand(message);
  const customerAction = await handleCustomerCommand({
    command: customerCommand,
    userClient,
    serviceClient,
    userId: user.id,
    workspaceId,
  });

  if (customerAction) {
    result.customerAction = customerAction;
    result.reply = `${result.reply} ${customerAction.message}`;
  }

  const collaboratorCommand = parseCollaboratorCommand(message);
  const collaboratorAction = await handleCollaboratorCommand({
    command: collaboratorCommand,
    userClient,
    serviceClient,
    userId: user.id,
    eventId,
    workspaceId,
  });

  if (collaboratorAction) {
    result.collaboratorAction = collaboratorAction;
    result.reply = `${result.reply} ${collaboratorAction.message}`;
  }

  if (!targetEventId) return;

  const { data: accessibleEvent, error: accessError } = await userClient
    .from("cater_events")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("id", targetEventId)
    .maybeSingle();

  if (accessError || !accessibleEvent) return;

  const nextPlan = mergedPlan(currentPlan, result.updates);

  await serviceClient.from("cater_beoflow_messages").insert([
    {
      workspace_id: workspaceId,
      event_id: targetEventId,
      user_id: user.id,
      sender: "user",
      content: message,
      metadata: { currentPlan },
    },
    {
      workspace_id: workspaceId,
      event_id: targetEventId,
      user_id: user.id,
      sender: "assistant",
      content: result.reply,
      metadata: {
        updates: result.updates,
        suggestions: result.suggestions,
        source: result.source,
        collaboratorAction,
        customerAction,
        eventAction,
      },
    },
  ]);

  const { data: latestVersion } = await serviceClient
    .from("cater_plan_versions")
    .select("version_number")
    .eq("workspace_id", workspaceId)
    .eq("event_id", targetEventId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  const versionNumber = (latestVersion?.version_number || 0) + 1;

  await serviceClient.from("cater_plan_versions").insert({
    workspace_id: workspaceId,
    event_id: targetEventId,
    version_number: versionNumber,
    plan: nextPlan,
    source: "beoflow",
    created_by: user.id,
  });

  const { error: updateEventError } = await serviceClient
    .from("cater_events")
    .update({
      budget: nextPlan.budget || null,
      budget_label: nextPlan.budgetLabel || null,
      event_type: nextPlan.eventType || null,
      menu_style: nextPlan.menuStyle || null,
      services: nextPlan.services || [],
      plan: nextPlan,
    })
    .eq("workspace_id", workspaceId)
    .eq("id", targetEventId);

  if (updateEventError) throw updateEventError;

  result.beoflowSync = await syncCaterEventToBeoflow(
    serviceClient,
    targetEventId,
    workspaceId,
  );
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  }

  try {
    const body = await request.json();
    const action = String(body.action || "").trim();
    const message = String(body.message || "").trim();
    const currentPlan = (body.currentPlan || {}) as CaterPlan;
    const eventId = body.eventId ? Number(body.eventId) : null;
    const providerRecordId = body.providerId ? Number(body.providerId) : null;
    const workspaceId = String(body.workspaceId || body.workspace_id || DEFAULT_WORKSPACE_ID);
    const payload =
      body.payload && typeof body.payload === "object"
        ? (body.payload as Record<string, unknown>)
        : {};

    if (action === "sync-status") {
      const context = await validateAuthenticatedWorkspaceRequest(request, workspaceId);
      if (context.errorResponse || !context.serviceClient || !context.user) return context.errorResponse!;

      const beoflowSync = await getBeoflowSyncStatus();
      return jsonResponse({ beoflowSync });
    }

    if (action === "save-event") {
      const context = await validateAuthenticatedWorkspaceRequest(request, workspaceId);
      if (context.errorResponse || !context.serviceClient || !context.user) return context.errorResponse!;

      const { data: record, error } = await insertCaterEventWithService(
        context.serviceClient,
        payload,
        context.user.id,
        workspaceId,
      );

      if (error || !record?.id) {
        return jsonError("Event could not be saved.", 400, error?.message || "Missing event id.");
      }

      const beoflowSync = await syncCaterEventToBeoflow(
        context.serviceClient,
        Number(record.id),
        workspaceId,
      );

      return jsonResponse({ record, beoflowSync });
    }

    if (action === "save-provider") {
      const context = await validateAuthenticatedWorkspaceRequest(request, workspaceId);
      if (context.errorResponse || !context.serviceClient || !context.user) return context.errorResponse!;

      const { data: record, error } = await saveCaterProviderWithService(
        context.serviceClient,
        payload,
        context.user.id,
        workspaceId,
        providerRecordId,
      );

      if (error || !record?.id) {
        return jsonError("Provider could not be saved.", 400, error?.message || "Missing provider id.");
      }

      const beoflowSync = await syncCaterProviderToBeoflow(
        context.serviceClient,
        Number(record.id),
        workspaceId,
      );

      return jsonResponse({ record, beoflowSync });
    }

    if (action === "sync-event") {
      if (!eventId) {
        return new Response(JSON.stringify({ error: "eventId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
        });
      }

      const { errorResponse, serviceClient } = await validateSyncEventRequest(
        request,
        eventId,
        workspaceId,
      );

      if (errorResponse) return errorResponse;

      const beoflowSync = await syncCaterEventToBeoflow(
        serviceClient!,
        eventId,
        workspaceId,
      );

      return new Response(JSON.stringify({ beoflowSync }), {
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (action === "sync-provider") {
      if (!providerRecordId) {
        return new Response(JSON.stringify({ error: "providerId is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
        });
      }

      const { errorResponse, serviceClient } = await validateSyncProviderRequest(
        request,
        providerRecordId,
        workspaceId,
      );

      if (errorResponse) return errorResponse;

      const beoflowSync = await syncCaterProviderToBeoflow(
        serviceClient!,
        providerRecordId,
        workspaceId,
      );

      return new Response(JSON.stringify({ beoflowSync }), {
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    if (!message) {
      return new Response(JSON.stringify({ error: "Message is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
      });
    }

    const result = await callOpenAI(message, currentPlan);
    await persistBeoflowRun(request, eventId, message, currentPlan, result, workspaceId);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: "BEOFlow request failed",
        details: error instanceof Error ? error.message : String(error),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
      },
    );
  }
});
