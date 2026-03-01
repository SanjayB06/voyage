// Activities Service - Calls Gemini LLM via edge function to generate day-by-day itinerary
import { supabase } from "@/integrations/supabase/client";

export interface ActivitySlot {
  time: "Morning" | "Afternoon" | "Evening";
  activity: string;
  is_free: boolean;
  booking_link: string | null;
}

export interface ActivityDay {
  day: number;
  date: string;
  title: string;
  activities: ActivitySlot[];
}

export async function generateItinerary(
  destination: string,
  startDate: string,
  endDate: string,
  numDays: number
): Promise<ActivityDay[]> {
  const { data, error } = await supabase.functions.invoke(
    "generate_activities_gemini",
    {
      body: {
        destination,
        start_date: startDate,
        end_date:   endDate,
        num_days:   numDays,
      },
    }
  );

  if (error) {
    throw new Error(error.message || "Failed to generate itinerary");
  }

  if (data?.error) {
    throw new Error(data.error);
  }

  return data?.days || [];
}
