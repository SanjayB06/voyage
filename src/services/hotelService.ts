// Hotel Service - Uses Edge Function proxy for Amadeus Hotel Search API
import { supabase } from "@/integrations/supabase/client";

export interface HotelOffer {
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

export interface SearchHotelsParams {
  destination?: string;
  check_in_date?: string;
  check_out_date?: string;
  rooms?: number;
  guests?: Array<{ type: "adult" | "child"; age?: number }>;
}

export interface SearchHotelsResult {
  hotels: HotelOffer[];
  message?: string;
}

export interface BookHotelParams {
  offer_id: string;
  passenger?: {
    name?: string;
    email?: string;
    phone?: string;
    gender?: "m" | "f" | "other";
  };
}

export interface BookHotelResult {
  booking_reference: string;
  booking_id?: string;
}

export async function bookHotel(params: BookHotelParams): Promise<BookHotelResult> {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
  const anonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  const res = await fetch(`${supabaseUrl}/functions/v1/book_hotel_amadeus`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${anonKey}`,
    },
    body: JSON.stringify(params),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data?.error || data?.details || `Hotel booking failed (${res.status})`);
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return {
    booking_reference: data.booking_reference,
    booking_id: data.booking_id,
  };
}

export async function searchHotels(
  params?: SearchHotelsParams
): Promise<SearchHotelsResult> {
  const { data, error } = await supabase.functions.invoke(
    "search_hotels_amadeus",
    { body: params || {} }
  );

  if (error) {
    throw new Error(error.message || "Failed to fetch hotels");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return {
    hotels: data?.hotels || [],
    message: data?.message,
  };
}
