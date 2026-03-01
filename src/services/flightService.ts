// Flight Service - Uses Supabase edge function proxy for Duffel API (same pattern as hotelService)
import { supabase } from "@/integrations/supabase/client";

export interface SegmentDetail {
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

export interface FlightOffer {
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

export interface FlightRoute {
  origin_code: string;
  origin_name: string;
  destination_code: string;
  destination_name: string;
  departure_date: string;
  passengers: number;
  cabin_class: string;
}

export interface SearchFlightsParams {
  origin?: string;
  destination?: string;
  departure_date?: string;
  passengers?: number;
  cabin_class?: "economy" | "premium_economy" | "business" | "first";
  max_connections?: number;
}

export interface SearchFlightsResult {
  route: FlightRoute;
  offers: FlightOffer[];
  message?: string;
}

export async function searchFlights(params?: SearchFlightsParams): Promise<SearchFlightsResult> {
  console.log("[flightService] searchFlights called with:", JSON.stringify(params));

  const { data, error } = await supabase.functions.invoke("search_flights_duffel", {
    body: params || {},
  });

  if (error) {
    console.error("[flightService] Supabase edge function error:", error);
    throw new Error(error.message || "Failed to fetch flights");
  }

  if (data?.error) {
    console.error("[flightService] Duffel API error:", data.error);
    throw new Error(data.error);
  }

  console.log("[flightService] Got", data?.offers?.length ?? 0, "offers, route:", JSON.stringify(data?.route));

  return {
    route: data?.route || {
      origin_code: params?.origin || "JFK",
      origin_name: params?.origin || "JFK",
      destination_code: params?.destination || "LAX",
      destination_name: params?.destination || "LAX",
      departure_date: params?.departure_date || "",
      passengers: params?.passengers || 1,
      cabin_class: params?.cabin_class || "economy",
    },
    offers: data?.offers || [],
    message: data?.message,
  };
}

// TODO: implement Duffel order creation
export async function bookFlight(_offerId: string): Promise<void> {
  throw new Error("bookFlight not yet implemented");
}
