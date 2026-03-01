import { Router, Request, Response } from "express";
import { Resend } from "resend";

const router = Router();

router.post("/", async (req: Request, res: Response) => {
  const { offer_id, payment_intent_id, passenger, cached_amount, cached_currency, cached_passenger_id } = req.body;

  if (!offer_id) {
    res.status(400).json({ error: "offer_id is required" });
    return;
  }
  if (!payment_intent_id) {
    res.status(400).json({ error: "payment_intent_id is required" });
    return;
  }

  const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY;
  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;

  if (!DUFFEL_API_KEY) {
    res.status(500).json({ error: "DUFFEL_API_KEY not configured" });
    return;
  }
  if (!STRIPE_SECRET_KEY) {
    res.status(500).json({ error: "STRIPE_SECRET_KEY not configured" });
    return;
  }

  // 1. Verify Stripe payment actually succeeded
  const stripeRes = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
    headers: {
      Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
    },
  });

  if (!stripeRes.ok) {
    const text = await stripeRes.text();
    res.status(stripeRes.status).json({ error: "Stripe payment verification failed", details: text });
    return;
  }

  const stripeData = await stripeRes.json();
  if (stripeData.status !== "succeeded") {
    res.status(402).json({ error: "Payment not completed", stripe_status: stripeData.status });
    return;
  }

  let total_amount: string;
  let total_currency: string;
  let duffelPassengerId: string;

  // Use cached data from the search results to avoid re-fetching (prevents 423 on expired offers)
  if (cached_amount && cached_currency && cached_passenger_id) {
    total_amount = cached_amount;
    total_currency = cached_currency;
    duffelPassengerId = cached_passenger_id;
    console.log(`[PlaceOrder] Using cached data: ${total_amount} ${total_currency}, passenger ${duffelPassengerId}`);
  } else {
    // Fallback: fetch the offer from Duffel (may fail with 423 if expired)
    const offerRes = await fetch(`https://api.duffel.com/air/offers/${offer_id}`, {
      headers: {
        Authorization: `Bearer ${DUFFEL_API_KEY}`,
        "Duffel-Version": "v2",
        Accept: "application/json",
      },
    });

    if (!offerRes.ok) {
      const text = await offerRes.text();
      const status = offerRes.status;
      res.status(status).json({
        error: status === 423 ? "offer_expired" : "Duffel offer fetch failed",
        hint: "Offer has expired. Please search for flights again.",
        details: text,
      });
      return;
    }

    const offerData = await offerRes.json();
    const offer = offerData.data;
    total_amount = offer.total_amount;
    total_currency = offer.total_currency;
    duffelPassengerId = offerData.data.passengers[0].id;
  }

  // 3. Place the Duffel order (using balance — card access requires Duffel approval)
  const orderPayload = {
    data: {
      selected_offers: [offer_id],
      passengers: [
        {
          type: "adult",
          given_name: passenger?.name?.split(" ")[0] || "Demo",
          family_name: passenger?.name?.split(" ").slice(1).join(" ") || "Traveler",
          email: passenger?.email || "sanjaymbharadwaj@gmail.com",
          born_on: passenger?.dob || "1990-01-01",
          gender: passenger?.gender === "f" ? "f" : "m",
          title: passenger?.gender === "f" ? "ms" : "mr",
          phone_number: passenger?.phone || "+13125550000",
          id: duffelPassengerId,
        },
      ],
      payments: [
        {
          type: "balance",
          amount: total_amount,
          currency: total_currency,
        },
      ],
      metadata: {
        stripe_payment_intent_id: payment_intent_id,
      },
    },
  };

  const orderRes = await fetch("https://api.duffel.com/air/orders", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DUFFEL_API_KEY}`,
      "Duffel-Version": "v2",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(orderPayload),
  });

  if (!orderRes.ok) {
    const text = await orderRes.text();
    res.status(orderRes.status).json({ error: "Duffel order creation failed", details: text });
    return;
  }

  const orderData = await orderRes.json();
  const order = orderData.data;

  // Send confirmation email
  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (RESEND_API_KEY && RESEND_API_KEY !== "re_your_resend_api_key_here") {
    try {
      const resend = new Resend(RESEND_API_KEY);
      const passengerEmail = order.passengers?.[0]?.email || passenger?.email;
      const passengerName = `${order.passengers?.[0]?.given_name ?? ""} ${order.passengers?.[0]?.family_name ?? ""}`.trim();

      const segments = order.slices?.flatMap((s: any) => s.segments) ?? [];
      const firstSeg = segments[0];
      const lastSeg = segments[segments.length - 1];

      const origin = firstSeg?.origin?.iata_code ?? "—";
      const destination = lastSeg?.destination?.iata_code ?? "—";
      const departure = firstSeg?.departing_at ? new Date(firstSeg.departing_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";
      const arrival = lastSeg?.arriving_at ? new Date(lastSeg.arriving_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "—";

      await resend.emails.send({
        from: "Voyage AI <onboarding@resend.dev>",
        to: passengerEmail,
        subject: `Your flight is booked — ${order.booking_reference}`,
        html: `
          <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0f0f0f;color:#f5f5f5;border-radius:12px">
            <h1 style="font-size:24px;margin-bottom:4px">Booking Confirmed</h1>
            <p style="color:#aaa;margin-top:0">Hi ${passengerName}, your flight has been booked.</p>
            <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:24px 0">
              <p style="margin:0 0 8px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:1px">Booking Reference</p>
              <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:4px;color:#a78bfa">${order.booking_reference}</p>
            </div>
            <table style="width:100%;border-collapse:collapse">
              <tr>
                <td style="padding:8px 0;color:#aaa;font-size:14px">Route</td>
                <td style="padding:8px 0;font-size:14px;text-align:right">${origin} → ${destination}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#aaa;font-size:14px">Departure</td>
                <td style="padding:8px 0;font-size:14px;text-align:right">${departure}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#aaa;font-size:14px">Arrival</td>
                <td style="padding:8px 0;font-size:14px;text-align:right">${arrival}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#aaa;font-size:14px">Total Paid</td>
                <td style="padding:8px 0;font-size:14px;text-align:right">${order.total_currency} ${order.total_amount}</td>
              </tr>
            </table>
            <p style="margin-top:24px;font-size:12px;color:#666">Use your booking reference to check in with the airline. Safe travels!</p>
          </div>
        `,
      });
    } catch (emailErr) {
      console.error("Failed to send confirmation email:", emailErr);
    }
  }

  res.json({
    order_id: order.id,
    booking_reference: order.booking_reference,
    total_amount: order.total_amount,
    total_currency: order.total_currency,
  });
});

export default router;
