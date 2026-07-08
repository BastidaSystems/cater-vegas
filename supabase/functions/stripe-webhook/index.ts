import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type StripeCheckoutSession = {
  id?: string;
  amount_total?: number;
  currency?: string;
  customer_email?: string;
  payment_intent?: string;
  metadata?: Record<string, string>;
};

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function hex(buffer: ArrayBuffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(left: string, right: string) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) {
    result |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return result === 0;
}

async function verifyStripeSignature(rawBody: string, signatureHeader: string, webhookSecret: string) {
  const timestamp = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .find((part) => part.startsWith("t="))
    ?.slice(2);
  const signatures = signatureHeader
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part.startsWith("v1="))
    .map((part) => part.slice(3));

  if (!timestamp || !signatures.length) return false;

  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(webhookSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = hex(await crypto.subtle.sign("HMAC", key, encoder.encode(`${timestamp}.${rawBody}`)));
  return signatures.some((candidate) => timingSafeEqual(candidate, signature));
}

Deno.serve(async (request) => {
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET") || "";
  if (!supabaseUrl || !serviceRoleKey || !webhookSecret) {
    return jsonResponse({ error: "Stripe webhook is not configured." }, 500);
  }

  const signatureHeader = request.headers.get("Stripe-Signature") || "";
  const rawBody = await request.text();
  if (!(await verifyStripeSignature(rawBody, signatureHeader, webhookSecret))) {
    return jsonResponse({ error: "Invalid Stripe signature." }, 400);
  }

  const event = JSON.parse(rawBody);
  if (event.type !== "checkout.session.completed") {
    return jsonResponse({ ok: true, ignored: true });
  }

  const session = event.data?.object as StripeCheckoutSession;
  const checkoutId = String(session?.metadata?.checkout_id || "").trim();
  if (!checkoutId) {
    return jsonResponse({ error: "Missing checkout_id metadata." }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const { data: pending, error: pendingError } = await serviceClient
    .from("cater_pending_checkouts")
    .select("id,workspace_id,full_name,email,phone,guest_count,notes,event_date,event_type,plan,created_event_id")
    .eq("workspace_id", "cater-vegas")
    .eq("id", checkoutId)
    .maybeSingle();

  if (pendingError) return jsonResponse({ error: pendingError.message }, 400);
  if (!pending) return jsonResponse({ error: "Pending checkout not found." }, 404);

  const paidPlan = {
    ...((pending.plan || {}) as Record<string, unknown>),
    payment_status: "paid",
    paid_at: new Date().toISOString(),
    stripe_checkout_session_id: session.id || "",
    stripe_payment_intent: session.payment_intent || "",
    amount_total: Number(session.amount_total || 0) / 100,
    currency: session.currency || "usd",
  };

  let eventId = Number(pending.created_event_id || 0);
  if (!eventId) {
    const { data: created, error: createError } = await serviceClient.rpc("cater_submit_public_request", {
      p_full_name: pending.full_name,
      p_email: pending.email,
      p_phone: pending.phone || null,
      p_guest_count: pending.guest_count,
      p_notes: pending.notes || null,
      p_event_date: pending.event_date,
      p_event_type: pending.event_type || "Event Order",
      p_plan: paidPlan,
    });

    if (createError) return jsonResponse({ error: createError.message }, 400);

    eventId = Number(created?.event_id || created?.order_id || created?.request_id || 0);
    if (!eventId) return jsonResponse({ error: "Could not create paid order." }, 500);
  }

  const { error: updateEventError } = await serviceClient
    .from("cater_events")
    .update({
      status: "confirmed",
      plan: paidPlan,
    })
    .eq("workspace_id", "cater-vegas")
    .eq("id", eventId);

  if (updateEventError) return jsonResponse({ error: updateEventError.message }, 400);

  const { error: updatePendingError } = await serviceClient
    .from("cater_pending_checkouts")
    .update({
      status: "paid",
      created_event_id: eventId,
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", "cater-vegas")
    .eq("id", checkoutId);

  if (updatePendingError) return jsonResponse({ error: updatePendingError.message }, 400);

  return jsonResponse({ ok: true, event_id: eventId, status: "confirmed" });
});
