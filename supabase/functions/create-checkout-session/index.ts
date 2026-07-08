import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type CartItem = {
  provider_name?: string;
  quantity?: number;
  unit_price?: number;
  subtotal?: number;
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

function cents(value: unknown) {
  return Math.max(0, Math.round(Number(value || 0) * 100));
}

function safeUrl(value: unknown, fallback: string) {
  const raw = String(value || "").trim();
  try {
    const url = new URL(raw || fallback);
    if (url.protocol === "https:" || url.hostname === "localhost") return url.toString();
  } catch {
    // Use fallback below.
  }
  return fallback;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Method not allowed." }, 405);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY") || "";
  const siteUrl = Deno.env.get("CATER_VEGAS_SITE_URL") || "https://bastidasystems.github.io/cater-vegas/";

  if (!supabaseUrl || !serviceRoleKey || !stripeSecretKey) {
    return jsonResponse({ error: "Payment service is not configured." }, 500);
  }

  const body = await request.json().catch(() => ({}));
  const plan = (body.plan || {}) as Record<string, unknown>;
  const cart = Array.isArray(plan.cart) ? (plan.cart as CartItem[]) : [];
  const estimatedTotal = Number(plan.estimated_total || 0);

  if (!cart.length || estimatedTotal <= 0) {
    return jsonResponse({ error: "Add priced items before payment." }, 400);
  }

  const fullName = String(body.full_name || "").trim();
  const email = String(body.email || "").trim().toLowerCase();
  const guestCount = Number(body.guest_count || 0);
  const eventDate = String(body.event_date || "").trim();
  if (!fullName || !email || !guestCount || !eventDate) {
    return jsonResponse({ error: "Name, email, guest count, and event date are required." }, 400);
  }

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  const checkoutId = crypto.randomUUID();
  const orderPlan = {
    ...plan,
    payment_status: "checkout_pending",
    checkout_created_at: new Date().toISOString(),
  };

  const { error: createError } = await serviceClient.from("cater_pending_checkouts").insert({
    id: checkoutId,
    workspace_id: "cater-vegas",
    full_name: fullName,
    email,
    phone: body.phone || null,
    guest_count: guestCount,
    notes: body.notes || null,
    event_date: eventDate,
    event_type: body.event_type || "Event Order",
    plan: orderPlan,
    status: "created",
  });

  if (createError) {
    return jsonResponse({ error: createError.message }, 400);
  }

  const fallbackSuccess = `${siteUrl}?payment=success&session_id={CHECKOUT_SESSION_ID}#review`;
  const fallbackCancel = `${siteUrl}?payment=cancelled#review`;
  const form = new URLSearchParams({
    mode: "payment",
    success_url: safeUrl(body.success_url, fallbackSuccess),
    cancel_url: safeUrl(body.cancel_url, fallbackCancel),
    customer_email: email,
    "metadata[checkout_id]": checkoutId,
    "metadata[workspace_id]": "cater-vegas",
    "payment_intent_data[metadata][checkout_id]": checkoutId,
    "payment_intent_data[metadata][workspace_id]": "cater-vegas",
  });

  let lineItemIndex = 0;
  cart.forEach((item) => {
    const quantity = Math.max(1, Number(item.quantity || 1));
    const unitAmount = cents(item.unit_price || Number(item.subtotal || 0) / quantity);
    if (!unitAmount) return;
    form.append(`line_items[${lineItemIndex}][price_data][currency]`, "usd");
    form.append(`line_items[${lineItemIndex}][price_data][product_data][name]`, String(item.provider_name || "Cater Vegas item"));
    form.append(`line_items[${lineItemIndex}][price_data][unit_amount]`, String(unitAmount));
    form.append(`line_items[${lineItemIndex}][quantity]`, String(quantity));
    lineItemIndex += 1;
  });

  if (!lineItemIndex) {
    return jsonResponse({ error: "Add priced items before payment." }, 400);
  }

  const stripeResponse = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${stripeSecretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });

  const session = await stripeResponse.json().catch(() => ({}));
  if (!stripeResponse.ok) {
    return jsonResponse({ error: session?.error?.message || "Stripe checkout could not be created." }, 400);
  }

  await serviceClient
    .from("cater_pending_checkouts")
    .update({
      status: "checkout_created",
      stripe_checkout_session_id: session.id,
      plan: { ...orderPlan, payment_status: "checkout_created", stripe_checkout_session_id: session.id },
      updated_at: new Date().toISOString(),
    })
    .eq("workspace_id", "cater-vegas")
    .eq("id", checkoutId);

  return jsonResponse({
    checkout_url: session.url,
    session_id: session.id,
    checkout_id: checkoutId,
  });
});
