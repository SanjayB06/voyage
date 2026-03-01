// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SearchParams {
  origin: string;
  destination: string;
  departure_date: string;
  passengers?: number;
  cabin_class?: "economy" | "premium_economy" | "business" | "first";
  max_connections?: number;
}

interface DuffelAirport {
  iata_code: string;
  name?: string;
  city_name?: string;
}

interface DuffelCarrier {
  name: string;
  iata_code: string;
}

interface DuffelAircraft {
  name?: string;
  iata_code?: string;
}

interface DuffelSegment {
  id: string;
  origin: DuffelAirport;
  destination: DuffelAirport;
  departing_at: string;
  arriving_at: string;
  duration: string;
  marketing_carrier: DuffelCarrier;
  operating_carrier?: DuffelCarrier;
  marketing_carrier_flight_number: string;
  aircraft?: DuffelAircraft;
  origin_terminal?: string;
  destination_terminal?: string;
}

interface DuffelOffer {
  id: string;
  total_amount: string;
  total_currency: string;
  total_emissions_kg?: string;
  slices: Array<{
    segments: DuffelSegment[];
    duration: string;
    origin: DuffelAirport;
    destination: DuffelAirport;
  }>;
}

interface SegmentDetail {
  segment_id: string;
  origin_code: string;
  origin_name: string;
  origin_terminal: string | null;
  destination_code: string;
  destination_name: string;
  destination_terminal: string | null;
  departing_at: string;
  arriving_at: string;
  duration_formatted: string;
  marketing_carrier_name: string;
  marketing_carrier_code: string;
  operating_carrier_name: string | null;
  operating_carrier_code: string | null;
  flight_number: string;
  aircraft_name: string | null;
}

interface SimplifiedOffer {
  offer_id: string;
  total_amount: string;
  total_currency: string;
  airline_name: string;
  airline_code: string;
  depart_time: string;
  arrive_time: string;
  duration_minutes: number;
  duration_formatted: string;
  stops_count: number;
  segments_summary: string;
  total_emissions_kg: string | null;
  segments: SegmentDetail[];
}

interface FlightRoute {
  origin_code: string;
  origin_name: string;
  destination_code: string;
  destination_name: string;
  departure_date: string;
  passengers: number;
  cabin_class: string;
}

function parseDuration(isoDuration: string): number {
  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?/);
  if (!match) return 0;
  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  return hours * 60 + minutes;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function formatDurationFromISO(isoDuration: string): string {
  return formatDuration(parseDuration(isoDuration));
}

// Default search params - can be overridden by request body
const DEFAULT_SEARCH: SearchParams = {
  origin: "ORD",
  destination: "ZRH",
  departure_date: "2026-03-15",
  passengers: 1,
  cabin_class: "economy",
  max_connections: 1,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const DUFFEL_API_KEY = Deno.env.get("DUFFEL_API_KEY");
    if (!DUFFEL_API_KEY) {
      console.error("DUFFEL_API_KEY is not configured");
      return new Response(JSON.stringify({ error: "Duffel API key not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body for dynamic search params
    let searchParams: SearchParams = { ...DEFAULT_SEARCH };
    
    if (req.method === "POST") {
      try {
        const body = await req.json();
        console.log("Received search params:", JSON.stringify(body));
        
        // Override defaults with provided values
        if (body.origin) searchParams.origin = body.origin.toUpperCase();
        if (body.destination) searchParams.destination = body.destination.toUpperCase();
        if (body.departure_date) searchParams.departure_date = body.departure_date;
        if (body.passengers) searchParams.passengers = Math.max(1, Math.min(9, body.passengers));
        if (body.cabin_class) searchParams.cabin_class = body.cabin_class;
        if (body.max_connections !== undefined) searchParams.max_connections = body.max_connections;
      } catch (parseError) {
        console.log("No body provided or invalid JSON, using defaults");
      }
    }

    console.log(`Creating offer request: ${searchParams.origin} → ${searchParams.destination} on ${searchParams.departure_date}`);

    // Build passengers array
    const passengers = Array.from({ length: searchParams.passengers || 1 }, () => ({ type: "adult" }));

    const offerRequestPayload = {
      data: {
        slices: [
          {
            origin: searchParams.origin,
            destination: searchParams.destination,
            departure_date: searchParams.departure_date,
          },
        ],
        passengers,
        cabin_class: searchParams.cabin_class || "economy",
        max_connections: searchParams.max_connections ?? 1,
      },
    };

    const response = await fetch("https://api.duffel.com/air/offer_requests", {
      method: "POST",
      headers: {

        Authorization: `Bearer ${DUFFEL_API_KEY}`,
        "Duffel-Version": "v2",
        "Content-Type": "application/json",
        Accept: "application/json",

      },
      body: JSON.stringify(offerRequestPayload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Duffel API error [${response.status}]: ${errorText}`);
      return new Response(JSON.stringify({ error: `Duffel API error: ${response.status}`, details: errorText }), {
        status: response.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    console.log(`Received ${data.data?.offers?.length || 0} offers from Duffel`);

    const offers: DuffelOffer[] = data.data?.offers || [];
    const requestSlices = data.data?.slices || [];
    // Passenger placeholders from the offer request — needed to place orders without re-fetching
    const duffelPassengers: Array<{ id: string; type: string }> = data.data?.passengers || [];

    // Build route metadata from API response (not request payload)
    const firstSlice = requestSlices[0];
    const route: FlightRoute = {
      origin_code: firstSlice?.origin?.iata_code || searchParams.origin,
      origin_name: firstSlice?.origin?.name || firstSlice?.origin?.city_name || searchParams.origin,
      destination_code: firstSlice?.destination?.iata_code || searchParams.destination,
      destination_name: firstSlice?.destination?.name || firstSlice?.destination?.city_name || searchParams.destination,
      departure_date: firstSlice?.departure_date || searchParams.departure_date,
      passengers: passengers.length,
      cabin_class: data.data?.cabin_class || searchParams.cabin_class || "economy",
    };

    console.log(`Route metadata: ${route.origin_name} (${route.origin_code}) → ${route.destination_name} (${route.destination_code})`);

    if (offers.length === 0) {
      return new Response(JSON.stringify({ route, offers: [], duffelPassengers, message: "No flights found for this route and date" }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Transform offers with detailed segment info
    const simplifiedOffers: SimplifiedOffer[] = offers.map((offer) => {
      const offerSlice = offer.slices[0];
      const segments = offerSlice?.segments || [];
      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];
      const durationMinutes = parseDuration(offerSlice?.duration || "PT0M");

      // Build detailed segments array
      const segmentDetails: SegmentDetail[] = segments.map((seg) => ({
        segment_id: seg.id,
        origin_code: seg.origin.iata_code,
        origin_name: seg.origin.name || seg.origin.city_name || seg.origin.iata_code,
        origin_terminal: seg.origin_terminal || null,
        destination_code: seg.destination.iata_code,
        destination_name: seg.destination.name || seg.destination.city_name || seg.destination.iata_code,
        destination_terminal: seg.destination_terminal || null,
        departing_at: seg.departing_at,
        arriving_at: seg.arriving_at,
        duration_formatted: formatDurationFromISO(seg.duration),
        marketing_carrier_name: seg.marketing_carrier?.name || "Unknown",
        marketing_carrier_code: seg.marketing_carrier?.iata_code || "XX",
        operating_carrier_name: seg.operating_carrier?.name || null,
        operating_carrier_code: seg.operating_carrier?.iata_code || null,
        flight_number: seg.marketing_carrier_flight_number || "",
        aircraft_name: seg.aircraft?.name || null,
      }));

      // Build segments summary
      let segmentsSummary = "";
      if (segments.length === 1) {
        segmentsSummary = `${firstSegment.origin.iata_code}→${lastSegment.destination.iata_code}`;
      } else {
        const stops = segments
          .slice(0, -1)
          .map((s) => s.destination.iata_code)
          .join("→");
        segmentsSummary = `${firstSegment.origin.iata_code}→${stops}→${lastSegment.destination.iata_code}`;
      }

      return {
        offer_id: offer.id,
        total_amount: offer.total_amount,
        total_currency: offer.total_currency,
        airline_name: firstSegment?.marketing_carrier?.name || "Unknown Airline",
        airline_code: firstSegment?.marketing_carrier?.iata_code || "XX",
        depart_time: firstSegment?.departing_at || "",
        arrive_time: lastSegment?.arriving_at || "",
        duration_minutes: durationMinutes,
        duration_formatted: formatDuration(durationMinutes),
        stops_count: segments.length - 1,
        segments_summary: segmentsSummary,
        total_emissions_kg: offer.total_emissions_kg || null,
        segments: segmentDetails,
      };
    });

    // Sort by price and take top 3
    simplifiedOffers.sort((a, b) => parseFloat(a.total_amount) - parseFloat(b.total_amount));
    const topOffers = simplifiedOffers.slice(0, 3);

    console.log(`Returning top ${topOffers.length} offers with segment details`);

    return new Response(JSON.stringify({ route, offers: topOffers, duffelPassengers }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Error in search_flights_duffel:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: "Internal server error", details: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
