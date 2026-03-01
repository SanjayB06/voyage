import { Router, Request, Response } from "express";

const router = Router();

// TEMPORARY: confirms a Stripe PaymentIntent using pm_card_visa test token
// Replace this with Stripe Elements on the frontend when ready
router.post("/", async (req: Request, res: Response) => {
  const { payment_intent_id } = req.body;

  if (!payment_intent_id) {
    res.status(400).json({ error: "payment_intent_id is required" });
    return;
  }

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  if (!STRIPE_SECRET_KEY) {
    res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });
    return;
  }

  const confirmBody = new URLSearchParams({
    payment_method: "pm_card_visa",
    return_url: "http://localhost:5173",
  });

  const confirmRes = await fetch(
    `https://api.stripe.com/v1/payment_intents/${payment_intent_id}/confirm`,
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
    const text = await confirmRes.text();
    res.status(confirmRes.status).json({ error: "Stripe confirmation failed", details: text });
    return;
  }

  const confirmData = await confirmRes.json();

  if (confirmData.status !== "succeeded") {
    res.status(402).json({ error: "Payment did not succeed", stripe_status: confirmData.status });
    return;
  }

  res.json({ status: confirmData.status });
});

export default router;
