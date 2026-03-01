// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SearchParams {
  destination: string;
  check_in_date: string;
  check_out_date: string;
  rooms: number;
  guests: Array<{ type: "adult" | "child"; age?: number }>;
}

interface DuffelAddress {
  line_one: string | null;
  city_name: string | null;
  region: string | null;
  postal_code: string | null;
  country_code: string | null;
}

interface DuffelPhoto {
  url: string;
}

interface DuffelAmenity {
  type: string;
  description: string;
}

interface DuffelAccommodation {
  id: string;
  name: string;
  description: string | null;
  rating: number | null;
  review_score: number | null;
  review_count: number | null;
  photos: DuffelPhoto[];
  amenities: DuffelAmenity[] | null;
  location: {
    address: DuffelAddress;
    geographic_coordinates: {
      latitude: number;
      longitude: number;
    };
  };
}

interface DuffelSearchResult {
  id: string;
  accommodation: DuffelAccommodation;
  cheapest_rate_total_amount: string;
  cheapest_rate_currency: string;
  check_in_date: string;
  check_out_date: string;
}

interface HotelOffer {
  property_id: string;
  search_result_id: string;
  name: string;
  description: string | null;
  star_rating: number | null;
  review_score: number | null;
  review_count: number | null;
  city: string | null;
  photo_url: string | null;
  nightly_rate: string;
  total_amount: string;
  currency: string;
}

// Hardcoded coords for common airports — instant lookup, no API call needed
const AIRPORT_COORDS: Record<string, { latitude: number; longitude: number }> = {
  SJU: { latitude: 18.4394,  longitude: -66.0018  },
  SAN: { latitude: 32.7338,  longitude: -117.1933 },
  LAX: { latitude: 33.9425,  longitude: -118.4081 },
  JFK: { latitude: 40.6413,  longitude: -73.7781  },
  MIA: { latitude: 25.7959,  longitude: -80.2870  },
  ORD: { latitude: 41.9742,  longitude: -87.9073  },
  LHR: { latitude: 51.4775,  longitude: -0.4614   },
  CDG: { latitude: 49.0097,  longitude: 2.5479    },
  NRT: { latitude: 35.7647,  longitude: 140.3864  },
  DXB: { latitude: 25.2532,  longitude: 55.3657   },
  SFO: { latitude: 37.6213,  longitude: -122.3790 },
  BOS: { latitude: 42.3656,  longitude: -71.0096  },
  CUN: { latitude: 21.0366,  longitude: -86.8771  },
  LIS: { latitude: 38.7813,  longitude: -9.1359   },
  BCN: { latitude: 41.2971,  longitude: 2.0785    },
  AMS: { latitude: 52.3086,  longitude: 4.7639    },
  FCO: { latitude: 41.7999,  longitude: 12.2462   },
  MAD: { latitude: 40.4983,  longitude: -3.5676   },
  GRU: { latitude: -23.4356, longitude: -46.4731  },
  SYD: { latitude: -33.9399, longitude: 151.1753  },
};

async function resolveCoordinates(
  iataCode: string,
  apiKey: string
): Promise<{ latitude: number; longitude: number }> {
  const code = iataCode.toUpperCase();

  // Fast path: hardcoded table
  if (AIRPORT_COORDS[code]) {
    console.log(`Using hardcoded coords for ${code}`);
    return AIRPORT_COORDS[code];
  }

  // Slow path: Duffel places suggestions for destinations not in the table
  console.log(`Resolving coords for ${code} via Duffel places API...`);
  const res = await fetch(
    `https://api.duffel.com/places/suggestions?query=${encodeURIComponent(code)}`,
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Duffel-Version": "v2",
        Accept: "application/json",
      },
    }
  );

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Places API error [${res.status}]: ${text}`);
  }

  const json = await res.json();
  console.log("Places suggestions sample:", JSON.stringify(json.data?.[0]));

  const airport = (json.data ?? []).find(
    (p: Record<string, unknown>) =>
      p.type === "airport" &&
      (p.iata_code as string)?.toUpperCase() === code
  );

  if (!airport?.latitude || !airport?.longitude) {
    throw new Error(`No coordinates found for airport: ${code}. Add it to AIRPORT_COORDS.`);
  }

  return { latitude: airport.latitude as number, longitude: airport.longitude as number };
}

function countNights(checkIn: string, checkOut: string): number {
  const diff = new Date(checkOut).getTime() - new Date(checkIn).getTime();
  return Math.max(1, Math.round(diff / (1000 * 60 * 60 * 24)));
}

const DEFAULT_PARAMS: SearchParams = {
  destination: "SJU",
  check_in_date: "2026-04-01",
  check_out_date: "2026-04-08",
  rooms: 1,
  guests: [{ type: "adult" }, { type: "adult" }],
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const DUFFEL_API_KEY = Deno.env.get("DUFFEL_API_KEY");
    if (!DUFFEL_API_KEY) {
      console.error("DUFFEL_API_KEY is not configured");
      return new Response(
        JSON.stringify({ error: "Duffel API key not configured" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    let params: SearchParams = { ...DEFAULT_PARAMS };
    if (req.method === "POST") {
      try {
        const body = await req.json();
        console.log("Received hotel search params:", JSON.stringify(body));
        if (body.destination)    params.destination    = body.destination.toUpperCase();
        if (body.check_in_date)  params.check_in_date  = body.check_in_date;
        if (body.check_out_date) params.check_out_date = body.check_out_date;
        if (body.rooms)          params.rooms          = Math.max(1, body.rooms);
        if (body.guests)         params.guests         = body.guests;
      } catch {
        console.log("No body or invalid JSON, using defaults");
      }
    }

    console.log(
      `Hotel search: ${params.destination} | ${params.check_in_date} → ${params.check_out_date} | ${params.rooms} room(s) | ${params.guests.length} guest(s)`
    );

    // Step 1: Resolve IATA code → coordinates
    let coords: { latitude: number; longitude: number };
    try {
      coords = await resolveCoordinates(params.destination, DUFFEL_API_KEY);
      console.log(
        `Resolved ${params.destination} → lat:${coords.latitude} lon:${coords.longitude}`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error("Coordinate resolution failed:", msg);
      return new Response(
        JSON.stringify({ error: `Could not resolve destination: ${msg}` }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 2: Call Duffel Stays search
    const staysPayload = {
      data: {
        check_in_date: params.check_in_date,
        check_out_date: params.check_out_date,
        rooms: params.rooms,
        guests: params.guests,
        location: {
          geographic_coordinates: {
            latitude: coords.latitude,
            longitude: coords.longitude,
            radius: 10,
          },
        },
      },
    };

    const staysResponse = await fetch("https://api.duffel.com/stays/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${DUFFEL_API_KEY}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(staysPayload),
    });

    if (!staysResponse.ok) {
      const errorText = await staysResponse.text();
      console.error(`Duffel Stays API error [${staysResponse.status}]: ${errorText}`);
      // Always return 200 so the Supabase client can read the error body
      return new Response(
        JSON.stringify({
          error: `Duffel Stays error (${staysResponse.status})`,
          details: errorText,
          hotels: [],
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const staysData = await staysResponse.json();
    const results: DuffelSearchResult[] = staysData?.data?.results ?? [];
    console.log(`Received ${results.length} hotel results from Duffel`);

    if (results.length === 0) {
      return new Response(
        JSON.stringify({
          hotels: [],
          message: `No hotels found near ${params.destination} for these dates`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Step 3: Transform results
    const nights = countNights(params.check_in_date, params.check_out_date);

    const hotelOffers: HotelOffer[] = results.map((result) => {
      const acc = result.accommodation;
      const totalAmount = parseFloat(result.cheapest_rate_total_amount);
      const nightlyRate = (totalAmount / nights).toFixed(2);

      return {
        property_id:      acc.id,
        search_result_id: result.id,
        name:             acc.name,
        description:      acc.description ?? null,
        star_rating:      acc.rating ?? null,
        review_score:     acc.review_score ?? null,
        review_count:     acc.review_count ?? null,
        city:             acc.location?.address?.city_name ?? null,
        photo_url:        acc.photos?.[0]?.url ?? null,
        nightly_rate:     nightlyRate,
        total_amount:     result.cheapest_rate_total_amount,
        currency:         result.cheapest_rate_currency,
      };
    });

    // Sort by total price ascending, take top 3
    hotelOffers.sort(
      (a, b) => parseFloat(a.total_amount) - parseFloat(b.total_amount)
    );
    const topOffers = hotelOffers.slice(0, 3);

    console.log(`Returning top ${topOffers.length} hotel offers`);

    return new Response(JSON.stringify({ hotels: topOffers }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in search_hotels_duffel:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: "Internal server error", details: errorMessage, hotels: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
