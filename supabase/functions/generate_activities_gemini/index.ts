// @ts-nocheck
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ---------------------------------------------------------------------------
// Static fallback — used when Gemini is unavailable (quota, billing, etc.)
// Generates destination-aware activities so the UI always renders something.
// ---------------------------------------------------------------------------

const FREE_MORNINGS = [
  (d: string) => `Morning walk through ${d}'s historic city centre`,
  (d: string) => `Browse the local morning market in ${d} and sample street food`,
  (d: string) => `Sunrise stroll along ${d}'s waterfront promenade`,
  (d: string) => `Wander through ${d}'s old town neighbourhoods`,
  (d: string) => `Hike to a scenic viewpoint overlooking ${d}`,
  (d: string) => `Explore ${d}'s botanical gardens (free entry)`,
  (d: string) => `Discover ${d}'s street art and murals district`,
];

const FREE_AFTERNOONS = [
  (d: string) => `Relax in ${d}'s main city park`,
  (d: string) => `Visit the free neighbourhood museums and galleries`,
  (d: string) => `Walk ${d}'s famous historic boulevard`,
  (d: string) => `People-watch at the central plaza`,
  (d: string) => `Explore the local food hall (free entry)`,
  (d: string) => `Beach walk and swim near ${d}`,
  (d: string) => `Afternoon café-hop through ${d}'s hidden alleyways`,
];

const FREE_EVENINGS = [
  (d: string) => `Evening stroll through ${d}'s illuminated old town`,
  (d: string) => `Sunset at ${d}'s hilltop lookout`,
  (d: string) => `Night market and street food in ${d}`,
  (d: string) => `Waterfront walk at golden hour in ${d}`,
  (d: string) => `Free outdoor cultural event at ${d}'s main square`,
  (d: string) => `Moonlit walk along the river`,
  (d: string) => `Bar-hop through ${d}'s lively local neighbourhood`,
];

const PAID_ACTIVITIES = [
  (d: string) => `Guided city highlights tour of ${d}`,
  (d: string) => `Skip-the-line entry to ${d}'s top landmark`,
  (d: string) => `Sunset boat or cable car experience in ${d}`,
  (d: string) => `Local food & culture walking tour in ${d}`,
];

const DAY_TITLES = [
  "Arrival & First Impressions",
  "Old Town Wander & Local Flavours",
  "Hidden Gems & Scenic Views",
  "Culture Day & Market Finds",
  "Nature & Neighbourhood Explore",
  "Off the Beaten Path",
  "Farewell & Final Strolls",
  "Deeper Discovery",
  "Art, Markets & Sunsets",
  "Island Day & Easy Vibes",
  "City Outskirts Adventure",
  "Slow Morning, Big Evening",
  "Rooftops & River Walks",
  "Last Light in the City",
];

function buildFallbackItinerary(destination: string, startMs: number, numDays: number) {
  const gygLink = `https://www.getyourguide.com/s/?q=${encodeURIComponent(destination)}`;

  const days = [];
  for (let i = 0; i < numDays; i++) {
    const dayDate = new Date(startMs + i * 86400000).toISOString().split("T")[0];
    const title = DAY_TITLES[i % DAY_TITLES.length];
    const isPaidDay = i % 3 === 0; // paid activity every 3rd day → ~33% paid

    const morning = FREE_MORNINGS[i % FREE_MORNINGS.length](destination);
    const evening = FREE_EVENINGS[i % FREE_EVENINGS.length](destination);

    const afternoonActivity = isPaidDay
      ? PAID_ACTIVITIES[Math.floor(i / 3) % PAID_ACTIVITIES.length](destination)
      : FREE_AFTERNOONS[i % FREE_AFTERNOONS.length](destination);

    days.push({
      day: i + 1,
      date: dayDate,
      title,
      activities: [
        { time: "Morning",   activity: morning,           is_free: true,      booking_link: null },
        { time: "Afternoon", activity: afternoonActivity, is_free: !isPaidDay, booking_link: isPaidDay ? gygLink : null },
        { time: "Evening",   activity: evening,           is_free: true,      booking_link: null },
      ],
    });
  }
  return days;
}

// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("GEMINI_API_KEY");

    let destination = "Paris";
    let startDate = "";
    let endDate = "";
    let numDays = 7;

    if (req.method === "POST") {
      try {
        const body = await req.json();
        console.log("Received itinerary request:", JSON.stringify(body));
        if (body.destination) destination = body.destination;
        if (body.start_date)  startDate  = body.start_date;
        if (body.end_date)    endDate    = body.end_date;
        if (body.num_days)    numDays    = Math.min(Math.max(1, body.num_days), 14);
      } catch {
        console.log("No body or invalid JSON, using defaults");
      }
    }

    const startMs = startDate ? new Date(startDate).getTime() : Date.now();

    console.log(`Generating ${numDays}-day itinerary for: ${destination} (${startDate} → ${endDate})`);

    // If no API key, go straight to fallback
    if (!apiKey) {
      console.warn("No GEMINI_API_KEY set — using static fallback itinerary");
      const days = buildFallbackItinerary(destination, startMs, numDays);
      return new Response(
        JSON.stringify({ destination, days, fallback: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const dateRange = startDate && endDate
      ? `from ${startDate} to ${endDate}`
      : `for ${numDays} days`;

    const prompt = `You are an expert travel planner. Create a ${numDays}-day activity itinerary for a trip to ${destination} ${dateRange}.

Requirements:
- 75% of all activities across all days must be FREE (e.g. parks, beaches, historic plazas, walking tours, viewpoints, local markets, free museums, waterfront walks)
- 25% of activities must be PAID — for each paid activity provide a real working booking URL from GetYourGuide (getyourguide.com), Viator (viator.com), or the attraction's official website
- Each day must have exactly 3 activities: Morning, Afternoon, Evening
- Day titles must be evocative and specific to the destination (e.g. "Old Town Wander & Harbour Sunset")
- booking_link must be null for free activities and a real https:// URL for paid ones
- Spread paid activities across different days — do not cluster them all on one day

Return a JSON array only — no markdown, no explanation, no code fences. Match this exact schema:
[
  {
    "day": 1,
    "date": "YYYY-MM-DD",
    "title": "string",
    "activities": [
      { "time": "Morning",   "activity": "string", "is_free": true,  "booking_link": null },
      { "time": "Afternoon", "activity": "string", "is_free": false, "booking_link": "https://..." },
      { "time": "Evening",   "activity": "string", "is_free": true,  "booking_link": null }
    ]
  }
]`;

    let useFallback = false;
    let geminiDays: any[] | null = null;

    try {
      const geminiResp = await fetch(`${GEMINI_BASE}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
            maxOutputTokens: 4096,
          },
        }),
      });

      if (!geminiResp.ok) {
        const errText = await geminiResp.text();
        console.warn(`Gemini API error [${geminiResp.status}] — falling back to static itinerary. Error: ${errText}`);
        useFallback = true;
      } else {
        const geminiData = await geminiResp.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text;

        if (!rawText) {
          console.warn("Gemini returned empty response — using fallback");
          useFallback = true;
        } else {
          console.log("Gemini raw response length:", rawText.length);
          try {
            const parsed = JSON.parse(rawText);
            if (Array.isArray(parsed)) {
              geminiDays = parsed;
            } else {
              useFallback = true;
            }
          } catch {
            const stripped = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/, "").trim();
            try {
              const parsed = JSON.parse(stripped);
              geminiDays = Array.isArray(parsed) ? parsed : null;
              if (!geminiDays) useFallback = true;
            } catch {
              useFallback = true;
            }
          }
        }
      }
    } catch (fetchErr) {
      console.warn("Gemini fetch threw — using fallback:", fetchErr);
      useFallback = true;
    }

    let days: any[];

    if (useFallback || !geminiDays) {
      console.log("Using static fallback itinerary");
      days = buildFallbackItinerary(destination, startMs, numDays);
    } else {
      // Enrich Gemini output with proper dates
      days = geminiDays.map((day: any, idx: number) => {
        const dayDate = new Date(startMs + idx * 86400000).toISOString().split("T")[0];
        return {
          day:   day.day   ?? idx + 1,
          date:  day.date && day.date !== "YYYY-MM-DD" ? day.date : dayDate,
          title: day.title ?? `Day ${idx + 1}`,
          activities: (day.activities ?? []).map((a: any) => ({
            time:         a.time         ?? "Morning",
            activity:     a.activity     ?? "",
            is_free:      a.is_free      ?? true,
            booking_link: a.booking_link ?? null,
          })),
        };
      });
    }

    console.log(`Returning ${days.length}-day itinerary (fallback=${useFallback})`);

    return new Response(
      JSON.stringify({ destination, days, fallback: useFallback }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Unhandled error in generate_activities_gemini:", error);
    const msg = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: msg, days: [] }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
