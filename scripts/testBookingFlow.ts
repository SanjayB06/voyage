import dotenv from "dotenv";
import { expand } from "dotenv-expand";

expand(dotenv.config());

const SERVER_URL = "http://localhost:3001";
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

const providedOfferId = process.argv[2];
let offer_id: string | undefined;
if (!STRIPE_SECRET_KEY) {
  console.error("STRIPE_SECRET_KEY not set in .env");
  process.exit(1);
}

async function fetchFreshOfferId(): Promise<string> {
  console.log("▶ Step 0: Fetching a fresh Duffel offer with backend key...");
  const searchRes = await fetch(`${SERVER_URL}/api/search-flights`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      origin: "ORD",
      destination: "LAX",
      departure_date: "2026-04-01",
      passengers: 1,
      cabin_class: "economy",
      max_connections: 1,
    }),
  });

  if (!searchRes.ok) {
    const errText = await searchRes.text();
    throw new Error(`Failed to fetch fresh offer: ${errText}`);
  }

  const searchData = await searchRes.json();
  const firstOffer = searchData?.offers?.[0]?.offer_id;
  if (!firstOffer) {
    throw new Error("No offers returned from /api/search-flights");
  }

  console.log(`✓ Fresh offer received: ${firstOffer}\n`);
  return firstOffer;
}

function shouldRetryWithFreshOffer(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const maybe = err as { error?: string; details?: string };
  return maybe.error === "Duffel offer fetch failed" && typeof maybe.details === "string" && maybe.details.includes("not_found");
}

async function run() {
  if (providedOfferId) {
    console.warn("! Ignoring provided offer_id for now. Forcing a fresh 1-passenger offer.");
  }
  offer_id = await fetchFreshOfferId();

  console.log("\n========================================");
  console.log(" Voyage Payment Flow — End-to-End Test");
  console.log("========================================\n");
  console.log(`Offer ID: ${offer_id}\n`);

  // ── Step 1: Create Stripe PaymentIntent ──────────────────────────────────
  console.log("▶ Step 1: Creating Stripe PaymentIntent...");
  let piRes = await fetch(`${SERVER_URL}/api/create-payment-intent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ offer_id }),
  });

  if (!piRes.ok) {
    const err = await piRes.json();

    if (shouldRetryWithFreshOffer(err)) {
      console.warn("! Offer not found. It may be stale/expired. Retrying with a fresh offer...");
      offer_id = await fetchFreshOfferId();
      piRes = await fetch(`${SERVER_URL}/api/create-payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer_id }),
      });
    }

    if (!piRes.ok) {
      const retryErr = await piRes.json();
      console.error("✗ Failed to create PaymentIntent:", retryErr);
      process.exit(1);
    }
  }

  const piData = await piRes.json();
  console.log("✓ PaymentIntent created");
  console.log(`  payment_intent_id : ${piData.payment_intent_id}`);
  console.log(`  amount            : ${(piData.amount / 100).toFixed(2)} ${piData.currency.toUpperCase()}`);
  console.log(`  client_secret     : ${piData.client_secret.slice(0, 30)}...\n`);

  // ── Step 2: Simulate user paying (confirm PaymentIntent via Stripe API) ──
  console.log("▶ Step 2: Simulating user payment (confirming PaymentIntent with test card pm_card_visa)...");
  const confirmBody = new URLSearchParams({
    payment_method: "pm_card_visa",
    return_url: "http://localhost:3001/noop",
  });

  const confirmRes = await fetch(
    `https://api.stripe.com/v1/payment_intents/${piData.payment_intent_id}/confirm`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: confirmBody.toString(),
    }
  );

  if (!confirmRes.ok) {
    const err = await confirmRes.json();
    console.error("✗ Failed to confirm PaymentIntent:", err);
    process.exit(1);
  }

  const confirmData = await confirmRes.json();
  if (confirmData.status !== "succeeded") {
    console.error(`✗ Payment did not succeed. Stripe status: ${confirmData.status}`);
    process.exit(1);
  }

  console.log("✓ Payment confirmed by Stripe");
  console.log(`  status : ${confirmData.status}`);
  console.log(`  amount : ${(confirmData.amount / 100).toFixed(2)} ${confirmData.currency.toUpperCase()}\n`);

  // ── Step 3: Place Duffel order ───────────────────────────────────────────
  console.log("▶ Step 3: Placing Duffel order (charging our debit card)...");
  const orderRes = await fetch(`${SERVER_URL}/api/place-duffel-order`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      offer_id,
      payment_intent_id: piData.payment_intent_id,
    }),
  });

  if (!orderRes.ok) {
    const err = await orderRes.json();
    console.error("✗ Failed to place Duffel order:", err);
    process.exit(1);
  }

  const orderData = await orderRes.json();
  console.log("✓ Duffel order placed");
  console.log(`  order_id          : ${orderData.order_id}`);
  console.log(`  booking_reference : ${orderData.booking_reference}`);
  console.log(`  total charged     : ${orderData.total_amount} ${orderData.total_currency}\n`);

  console.log("========================================");
  console.log(" Booking Complete!");
  console.log(`  Reference: ${orderData.booking_reference}`);
  console.log("========================================\n");
}

run().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
