import { Router, Request, Response } from "express";

interface SearchParams {
  origin: string;
  destination: string;
  departure_date: string;
  passengers: number;
  cabin_class: "economy" | "premium_economy" | "business" | "first";
  max_connections: number;
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

const router = Router();

const DEFAULT_SEARCH: SearchParams = {
  origin: "ORD",
  destination: "ZRH",
  departure_date: "2026-03-15",
  passengers: 1,
  cabin_class: "economy",
  max_connections: 1,
};

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

router.post("/", async (req: Request, res: Response) => {
  const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY;
  if (!DUFFEL_API_KEY) {
    res.status(500).json({ error: "DUFFEL_API_KEY not configured" });
    return;
  }

  const body = req.body ?? {};
  const searchParams: SearchParams = {
    origin: String(body.origin || DEFAULT_SEARCH.origin).toUpperCase(),
    destination: String(body.destination || DEFAULT_SEARCH.destination).toUpperCase(),
    departure_date: String(body.departure_date || DEFAULT_SEARCH.departure_date),
    passengers: Math.max(1, Math.min(9, Number(body.passengers || DEFAULT_SEARCH.passengers))),
    cabin_class: body.cabin_class || DEFAULT_SEARCH.cabin_class,
    max_connections:
      body.max_connections === undefined
        ? DEFAULT_SEARCH.max_connections
        : Math.max(0, Number(body.max_connections)),
  };

  const passengers = Array.from({ length: searchParams.passengers }, () => ({ type: "adult" }));
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
      cabin_class: searchParams.cabin_class,
      max_connections: searchParams.max_connections,
    },
  };

  const duffelRes = await fetch("https://api.duffel.com/air/offer_requests", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${DUFFEL_API_KEY}`,
      "Duffel-Version": "v2",
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(offerRequestPayload),
  });

  if (!duffelRes.ok) {
    const details = await duffelRes.text();
    res.status(duffelRes.status).json({ error: "Duffel offer request failed", details });
    return;
  }

  const data = await duffelRes.json();
  const offers: DuffelOffer[] = data.data?.offers || [];
  const requestSlices = data.data?.slices || [];
  const firstSlice = requestSlices[0];

  const route = {
    origin_code: firstSlice?.origin?.iata_code || searchParams.origin,
    origin_name: firstSlice?.origin?.name || firstSlice?.origin?.city_name || searchParams.origin,
    destination_code: firstSlice?.destination?.iata_code || searchParams.destination,
    destination_name:
      firstSlice?.destination?.name || firstSlice?.destination?.city_name || searchParams.destination,
    departure_date: firstSlice?.departure_date || searchParams.departure_date,
    passengers: searchParams.passengers,
    cabin_class: data.data?.cabin_class || searchParams.cabin_class,
  };

  const simplifiedOffers = offers
    .map((offer) => {
      const offerSlice = offer.slices[0];
      const segments = offerSlice?.segments || [];
      const firstSegment = segments[0];
      const lastSegment = segments[segments.length - 1];
      const durationMinutes = parseDuration(offerSlice?.duration || "PT0M");

      const segmentDetails = segments.map((seg) => ({
        segment_id: seg.id,
        origin_code: seg.origin.iata_code,
        origin_name: seg.origin.name || seg.origin.city_name || seg.origin.iata_code,
        origin_terminal: seg.origin_terminal || null,
        destination_code: seg.destination.iata_code,
        destination_name: seg.destination.name || seg.destination.city_name || seg.destination.iata_code,
        destination_terminal: seg.destination_terminal || null,
        departing_at: seg.departing_at,
        arriving_at: seg.arriving_at,
        duration_formatted: formatDuration(parseDuration(seg.duration)),
        marketing_carrier_name: seg.marketing_carrier?.name || "Unknown",
        marketing_carrier_code: seg.marketing_carrier?.iata_code || "XX",
        operating_carrier_name: seg.operating_carrier?.name || null,
        operating_carrier_code: seg.operating_carrier?.iata_code || null,
        flight_number: seg.marketing_carrier_flight_number || "",
        aircraft_name: seg.aircraft?.name || null,
      }));

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
        stops_count: Math.max(0, segments.length - 1),
        segments_summary:
          segments.length <= 1
            ? `${firstSegment?.origin?.iata_code || "---"}→${lastSegment?.destination?.iata_code || "---"}`
            : `${firstSegment?.origin?.iata_code || "---"}→${segments
                .slice(0, -1)
                .map((s) => s.destination.iata_code)
                .join("→")}→${lastSegment?.destination?.iata_code || "---"}`,
        total_emissions_kg: offer.total_emissions_kg || null,
        segments: segmentDetails,
      };
    })
    .sort((a, b) => parseFloat(a.total_amount) - parseFloat(b.total_amount))
    .slice(0, 3);

  res.json({
    route,
    offers: simplifiedOffers,
    message: simplifiedOffers.length === 0 ? "No flights found for this route and date" : undefined,
  });
});

export default router;
