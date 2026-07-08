import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type NotificationResult = {
  channel: "email" | "sms";
  status: "sent" | "skipped" | "failed";
  reason?: string;
};

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
    },
  });
}

function normalizeStatus(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function formatPhoneForSms(value: unknown) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return String(value || "").trim().startsWith("+") ? String(value).trim() : "";
}

function planCartSummary(plan: Record<string, unknown> | null | undefined) {
  const cart = Array.isArray(plan?.cart) ? plan.cart : [];
  if (!cart.length) return "Selected event rental items.";
  return cart
    .map((item) => {
      const entry = item as Record<string, unknown>;
      const quantity = Number(entry.quantity || 0) || 0;
      const name = String(entry.provider_name || "Selected item");
      const subtotal = Number(entry.subtotal || 0) || 0;
      return `${quantity} x ${name}${subtotal ? ` - $${subtotal}` : ""}`;
    })
    .join("\n");
}

function totalLabel(plan: Record<string, unknown> | null | undefined) {
  const total = Number(plan?.estimated_total || 0) || 0;
  return total ? `$${total}` : "To be confirmed";
}

async function sendEmail(params: {
  to: string;
  fullName: string;
  requestId: number;
  eventDate: string;
  plan: Record<string, unknown> | null;
}): Promise<NotificationResult> {
  const apiKey = Deno.env.get("RESEND_API_KEY") || "";
  const from = Deno.env.get("CATER_VEGAS_NOTIFY_FROM") || "";
  if (!apiKey || !from) {
    return { channel: "email", status: "skipped", reason: "Missing RESEND_API_KEY or CATER_VEGAS_NOTIFY_FROM." };
  }
  if (!params.to) return { channel: "email", status: "skipped", reason: "No customer email." };

  const subject = `Cater Vegas request #${params.requestId} confirmed`;
  const text = [
    `Hi ${params.fullName || "there"},`,
    "",
    "Your Cater Vegas request has been confirmed.",
    "",
    `Request: #${params.requestId}`,
    `Date: ${params.eventDate || "To be confirmed"}`,
    `Estimated total: ${totalLabel(params.plan)}`,
    "",
    "Items:",
    planCartSummary(params.plan),
    "",
    "Cater Vegas will contact you with the next steps.",
  ].join("\n");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: [params.to],
      subject,
      text,
    }),
  });

  if (!response.ok) {
    return { channel: "email", status: "failed", reason: await response.text() };
  }

  return { channel: "email", status: "sent" };
}

async function sendSms(params: {
  to: string;
  fullName: string;
  requestId: number;
  eventDate: string;
  plan: Record<string, unknown> | null;
}): Promise<NotificationResult> {
  const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
  const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
  const from = Deno.env.get("TWILIO_FROM_PHONE") || "";
  const to = formatPhoneForSms(params.to);
  if (!accountSid || !authToken || !from) {
    return { channel: "sms", status: "skipped", reason: "Missing Twilio environment variables." };
  }
  if (!to) return { channel: "sms", status: "skipped", reason: "No valid customer phone." };

  const body = `Cater Vegas: your request #${params.requestId} is confirmed for ${params.eventDate || "your event date"}. Estimated total: ${totalLabel(params.plan)}.`;
  const formData = new URLSearchParams({ To: to, From: from, Body: body });
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${accountSid}:${authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: formData.toString(),
  });

  if (!response.ok) {
    return { channel: "sms", status: "failed", reason: await response.text() };
  }

  return { channel: "sms", status: "sent" };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const authHeader = request.headers.get("Authorization") || "";
  if (!supabaseUrl || !anonKey || !serviceRoleKey || !authHeader) {
    return jsonResponse({ error: "Notification service is not configured." }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const requestId = Number(body.request_id || body.event_id || 0);
  const workspaceId = String(body.workspace_id || "cater-vegas");
  const status = normalizeStatus(body.status || "confirmed");
  if (!requestId) return jsonResponse({ error: "request_id is required." }, 400);
  if (status !== "confirmed") {
    return jsonResponse({ ok: true, skipped: true, reason: "Only confirmed requests notify customers." });
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: event, error: eventError } = await userClient
    .from("cater_events")
    .select("id,workspace_id,customer_id,title,event_type,status,event_date,guest_count,plan,notes")
    .eq("workspace_id", workspaceId)
    .eq("id", requestId)
    .maybeSingle();

  if (eventError) return jsonResponse({ error: eventError.message }, 400);
  if (!event) return jsonResponse({ error: "Request not found or not allowed." }, 404);

  const { data: customer, error: customerError } = await serviceClient
    .from("cater_customers")
    .select("id,full_name,email,phone")
    .eq("id", event.customer_id)
    .maybeSingle();

  if (customerError) return jsonResponse({ error: customerError.message }, 400);

  const params = {
    to: "",
    fullName: customer?.full_name || event.title || "there",
    requestId: Number(event.id),
    eventDate: event.event_date || "",
    plan: (event.plan || null) as Record<string, unknown> | null,
  };

  const results = await Promise.all([
    sendEmail({ ...params, to: customer?.email || "" }),
    sendSms({ ...params, to: customer?.phone || "" }),
  ]);

  return jsonResponse({
    ok: true,
    request_id: event.id,
    results,
  });
});
