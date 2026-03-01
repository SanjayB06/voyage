import { Router, Request, Response } from "express";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { offer_id, cached_amount, cached_currency } = req.body;

  if (!offer_id) {
    res.status(400).json({ error: "offer_id is required" });
    return;
  }

  const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY;
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

  if (!STRIPE_SECRET_KEY) {
    res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });
    return;
  }

  let amount_decimal: string;
  let currency: string;

  // Use cached price from the search results to avoid re-fetching (and hitting 423 on expired offers)
  if (cached_amount && cached_currency) {
    amount_decimal = cached_amount;
    currency = cached_currency;
    console.log(`[PaymentIntent] Using cached price: ${amount_decimal} ${currency}`);
  } else {
    // Fallback: fetch from Duffel (may fail with 423 if offer expired)
    if (!DUFFEL_API_KEY) {
      res.status(500).json({ error: "DUFFEL_API_KEY not configured" });
      return;
    }

    const duffelRes = await fetch(`https://api.duffel.com/air/offers/${offer_id}`, {
      headers: {
        Authorization: `Bearer ${DUFFEL_API_KEY}`,
        "Duffel-Version": "v2",
        Accept: "application/json",
      },
    });

    if (!duffelRes.ok) {
      const text = await duffelRes.text();
      const status = duffelRes.status;
      res.status(status).json({
        error: status === 423 ? "offer_expired" : "Duffel offer fetch failed",
        hint: "Offer IDs are short-lived. Please search for flights again.",
        details: text,
      });
      return;
    }

    const duffelData = await duffelRes.json();
    const offer = duffelData.data;
    amount_decimal = offer.total_amount;
    currency = offer.total_currency;
  }

  // Convert to smallest currency unit (e.g. cents)
  const amount_smallest = Math.round(parseFloat(amount_decimal) * 100);

  // 2. Create a Stripe PaymentIntent
  const stripeBody = new URLSearchParams({
    amount: String(amount_smallest),
    currency: currency.toLowerCase(),
    "metadata[offer_id]": offer_id,
    "automatic_payment_methods[enabled]": "true",
    "automatic_payment_methods[allow_redirects]": "never",
  });

  const stripeRes = await fetch("https://api.stripe.com/v1/payment_intents", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: stripeBody.toString(),
  });

  if (!stripeRes.ok) {
    const text = await stripeRes.text();
    res.status(stripeRes.status).json({ error: "Stripe PaymentIntent creation failed", details: text });
    return;
  }

  const stripeData = await stripeRes.json();

  res.json({
    client_secret: stripeData.client_secret,
    payment_intent_id: stripeData.id,
    amount: amount_smallest,
    currency: currency.toLowerCase(),
  });
});

export default router;
