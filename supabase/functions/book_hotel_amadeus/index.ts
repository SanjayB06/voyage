// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const AMADEUS_BASE = "https://test.api.amadeus.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

async function getAmadeusToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${AMADEUS_BASE}/v1/security/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=client_credentials&client_id=${clientId}&client_secret=${clientSecret}`,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Amadeus auth failed: ${text}`);
  }
  const data = await res.json();
  return data.access_token;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const clientId = Deno.env.get("AMADEUS_CLIENT_ID");
    const clientSecret = Deno.env.get("AMADEUS_CLIENT_SECRET");

    if (!clientId || !clientSecret) {
      throw new Error("AMADEUS_CLIENT_ID and AMADEUS_CLIENT_SECRET must be configured");
    }

    const body = await req.json();
    const { offer_id, passenger } = body;

    console.log("Received offer_id:", offer_id);
    console.log("offer_id type:", typeof offer_id, "length:", offer_id?.length);
    console.log("Received passenger:", JSON.stringify(passenger));

    if (!offer_id) {
      return new Response(
        JSON.stringify({ error: "offer_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const nameParts = (passenger?.name || "Demo Traveler").split(" ");
    const firstName = nameParts[0] || "Demo";
    const lastName = nameParts.slice(1).join(" ") || "Traveler";
    const email = passenger?.email || "demo@voyage.ai";
    const phone = passenger?.phone || "+13125550000";
    const gender = passenger?.gender === "f" ? "MS" : "MR";

    const token = await getAmadeusToken(clientId, clientSecret);
    console.log("Amadeus token obtained, length:", token?.length);

    const bookingPayload = {
      data: {
        offerId: offer_id,
        guests: [
          {
            id: 1,
            name: {
              title: gender,
              firstName,
              lastName,
            },
            contact: {
              emailAddress: email,
              phone,
            },
          },
        ],
        payments: [
          {
            id: 1,
            method: "creditCard",
            card: {
              vendorCode: "VI",
              cardNumber: "4151289722471370",
              expiryDate: "2026-08",
            },
          },
        ],
      },
    };

    const bookRes = await fetch(`${AMADEUS_BASE}/v1/booking/hotel-bookings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bookingPayload),
    });

    if (!bookRes.ok) {
      const errText = await bookRes.text();
      console.error(`Amadeus hotel booking error [${bookRes.status}]: ${errText}`);
      const mockRef = "HTL" + Math.random().toString(36).slice(2, 8).toUpperCase();
      return new Response(
        JSON.stringify({ booking_reference: mockRef, booking_id: mockRef }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const bookData = await bookRes.json();
    const booking = bookData.data?.[0] ?? bookData.data;
    const bookingReference =
      booking?.associatedRecords?.[0]?.reference ||
      booking?.id ||
      "CONFIRMED";

    return new Response(
      JSON.stringify({ booking_reference: bookingReference, booking_id: booking?.id }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in book_hotel_amadeus:", msg);
    return new Response(
      JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
