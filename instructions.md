# Calendar Integration — Implementation Instructions

## Objective

Sync the frontend calendar with real flight timing data and provide calendar export functionality. Currently, `CalendarPanel` is hardcoded to March 2024 (days 15–22) and has no connection to actual booked flights. After this work, the calendar should reflect real departure/arrival dates and give users a way to export those dates.

---

## Current State

### What exists
- **`CalendarPanel.tsx`** — Renders a static March 2024 calendar with hardcoded `{ start: 15, end: 22 }`. Navigation arrows have no `onClick` handlers. Receives zero props from `MainLayout`.
- **`TripPlanPanel.tsx`** — Fetches `FlightOffer[]` from the backend. Each offer contains full ISO departure/arrival timestamps (`depart_time`, `arrive_time`) and per-segment `SegmentDetail` objects with `departing_at` / `arriving_at`. This data lives in local component state and is never propagated upward or to `CalendarPanel`.
- **`BookingModal.tsx`** — Completes the Stripe + Duffel payment flow. On success, it returns only a `booking_reference` string via `onSuccess(ref)`. No flight timing data flows back to `MainLayout`.
- **`MainLayout.tsx`** — Orchestrates all panels. Passes `tripInfo` to `TripPlanPanel` and `VoiceAgentPanel`, but **not** to `CalendarPanel`. Has no post-booking state for persisting flight details.
- **`supabase/functions/sync_google_calendar/`** — Empty directory (placeholder, never implemented).
- **No ICS/iCal code exists anywhere in the codebase.**

### Key data types (defined in `src/services/flightService.ts`)
```ts
interface FlightOffer {
  offer_id: string;
  depart_time: string;        // ISO datetime of first segment departure
  arrive_time: string;        // ISO datetime of last segment arrival
  duration_formatted: string;
  airline_name: string;
  segments: SegmentDetail[];
  // ... price, stops, emissions, etc.
}

interface SegmentDetail {
  departing_at: string;       // ISO datetime
  arriving_at: string;        // ISO datetime
  origin_code: string;
  destination_code: string;
  flight_number: string;
  marketing_carrier_name: string;
  // ... terminals, aircraft, etc.
}
```

### Data flow today
```
Index.tsx
  └─ tripInfo { start: "2026-04-01", end: "2026-04-08", origin, destination, ... }
       ├─► MainLayout
       │     ├─► TripPlanPanel  → fetches FlightOffer[] (has real times)
       │     ├─► VoiceAgentPanel
       │     ├─► CalendarPanel  → receives NO props, hardcoded March 2024
       │     └─► BookingModal   → returns only booking_reference string
       └─ (tripInfo.start / tripInfo.end are never used by CalendarPanel)
```

---

## Thing 1: Sync Frontend Calendar with Flight Timing

### Goal
After a flight is booked, `CalendarPanel` should display the correct month and highlight the actual departure and arrival dates based on the booked flight's timing data.

### Implementation Steps

**Step 1 — Lift booked flight data into `MainLayout` state**

In `MainLayout.tsx`, add state to hold the booked flight's details:
```ts
const [bookedFlight, setBookedFlight] = useState<{
  departureDate: string;  // ISO datetime from FlightOffer.depart_time
  arrivalDate: string;    // ISO datetime from FlightOffer.arrive_time
  segments: SegmentDetail[];
  airline: string;
  flightNumber: string;
} | null>(null);
```

**Step 2 — Pass booked flight data up from `TripPlanPanel`**

Currently, the `onBook` callback in `TripPlanPanel` only passes `(type, item, offerId)`. Extend it to also pass the full `FlightOffer` so `MainLayout` can capture the timing data when a booking is initiated. Store the selected offer in `MainLayout` and populate `bookedFlight` after `BookingModal` confirms success.

**Step 3 — Wire `CalendarPanel` to use real dates**

Refactor `CalendarPanel` to accept booked flight dates as props. Replace hardcoded values:
- Derive the displayed month/year from `bookedFlight.departureDate` instead of static `"March" / 2024`.
- Compute `start` and `end` day-of-month from the ISO departure and arrival datetimes.
- Make the prev/next navigation arrows functional so users can browse adjacent months.
- Highlight the departure date (outbound) and arrival date (return) distinctly — consider using different colors or labels (e.g., "Depart" vs "Return").

**Step 4 — Handle the pre-booking state**

Before a flight is booked, `CalendarPanel` should use `tripInfo.start` / `tripInfo.end` (the user's requested travel dates) as a preview. After booking, switch to the real flight times. This means `CalendarPanel` needs two data sources with booking data taking priority:
1. `tripInfo.start` / `tripInfo.end` — user's requested dates (available immediately)
2. `bookedFlight.departureDate` / `bookedFlight.arrivalDate` — actual booked times (available post-booking)

### Path 1: Google Calendar Sync

**Goal:** If the user has a Google-compatible email, offer to sync the booked flight to their Google Calendar.

**Implementation Steps:**

1. **Implement the `sync_google_calendar` Supabase edge function** (`supabase/functions/sync_google_calendar/index.ts`). It should:
   - Accept flight details (departure/arrival times, segments, airline, flight numbers, origin/destination) in the request body.
   - Use the Google Calendar API to create calendar events for each flight segment.
   - Each event should include: summary (e.g., "Flight AA1234: SAN → SJU"), start/end times from `departing_at`/`arriving_at`, location (airport codes), and a description with flight details.
   - Handle OAuth — the user will need to authenticate with Google. Consider using a Google OAuth flow triggered from the frontend, passing the access token to the edge function.

2. **Add a "Sync to Google Calendar" button** in `CalendarPanel` (visible only after a flight is booked and the user's email looks Google-compatible — ends in `@gmail.com` or is a Google Workspace domain).

3. **Trigger the edge function** from the frontend via `supabase.functions.invoke("sync_google_calendar", { body: { ... } })`, following the same pattern used by `search_hotels_amadeus` in `hotelService.ts`.

> **Note:** Google Calendar OAuth adds significant complexity (consent screen, token management, refresh tokens). For an MVP, consider generating a Google Calendar URL (`https://calendar.google.com/calendar/render?action=TEMPLATE&...`) that pre-fills event details — this requires no OAuth and works for any Google user.

### Path 2: ICS File Download

**Goal:** Provide a button for all users to download a `.ics` file containing their booked flight as a calendar event. This should always be available regardless of email provider.

**Implementation Steps:**

1. **Create an ICS generation utility** (e.g., `src/utils/generateICS.ts`). It should:
   - Accept the booked flight data (`segments: SegmentDetail[]`, airline name, booking reference).
   - Generate a valid [RFC 5545](https://tools.ietf.org/html/rfc5545) `.ics` file with one `VEVENT` per flight segment.
   - Each event must include:
     - `DTSTART` / `DTEND` — from `segment.departing_at` / `segment.arriving_at` (convert to UTC format `YYYYMMDDTHHMMSSZ`)
     - `SUMMARY` — e.g., `Flight AA1234: SAN → SJU`
     - `LOCATION` — departure airport name/code
     - `DESCRIPTION` — carrier, flight number, aircraft, terminals, booking reference
     - `UID` — unique identifier (e.g., `{segment_id}@voyage-app`)
     - `PRODID`, `VERSION`, `CALSCALE` — required ICS headers

   Example ICS structure:
   ```
   BEGIN:VCALENDAR
   VERSION:2.0
   PRODID:-//Voyage//Flight Booking//EN
   CALSCALE:GREGORIAN
   METHOD:PUBLISH
   BEGIN:VEVENT
   UID:seg_abc123@voyage-app
   DTSTART:20260401T133000Z
   DTEND:20260401T194500Z
   SUMMARY:Flight AA1234: SAN → SJU
   LOCATION:San Diego International Airport (SAN)
   DESCRIPTION:Operated by American Airlines\nFlight AA1234\nAircraft: Boeing 737\nBooking Ref: ABC123
   END:VEVENT
   END:VCALENDAR
   ```

2. **Add a "Download Calendar (.ics)" button** in `CalendarPanel`, visible after a flight is booked. On click:
   - Call the ICS generator with the booked flight's segment data.
   - Create a `Blob` with MIME type `text/calendar`, generate an object URL, and trigger a download with filename like `voyage-flight-SAN-SJU.ics`.

3. **Place the button alongside the Google Calendar button** (if shown) so the user has both options. The ICS download should always be available as a universal fallback.

---

## Validation

- **ICS validity:** Verify the generated `.ics` file is valid RFC 5545. Test by:
  - Importing into Apple Calendar, Google Calendar (via upload), and Outlook.
  - Using an online ICS validator (e.g., [iCalendar Validator](https://icalendar.org/validator.html)).
  - Confirming event times match the flight segment times exactly (watch for timezone handling — Duffel returns local airport times, so consider embedding `TZID` or converting to UTC).
- **Calendar panel accuracy:** After booking, verify the calendar highlights the correct departure/arrival days and displays the right month.
- **Edge cases:**
  - Multi-segment flights (layovers) should produce one ICS event per segment.
  - Flights crossing midnight (red-eyes) should show correct dates.
  - Flights crossing date boundaries (e.g., depart March 31, arrive April 1) should highlight days in the correct months.

---

## File Map

| File | Action |
|------|--------|
| `src/components/app/MainLayout.tsx` | Add `bookedFlight` state, pass to `CalendarPanel`, capture from booking flow |
| `src/components/app/CalendarPanel.tsx` | Accept flight date props, replace hardcoded values, add export buttons |
| `src/components/app/TripPlanPanel.tsx` | Extend `onBook` callback to include full `FlightOffer` data |
| `src/components/app/BookingModal.tsx` | No changes needed (timing data comes from the offer, not the booking response) |
| `src/utils/generateICS.ts` | **New file** — ICS generation utility |
| `src/services/flightService.ts` | No changes needed (types already sufficient) |
| `supabase/functions/sync_google_calendar/index.ts` | **New file** — Google Calendar sync edge function |


## Gemini API Key

Add your Gemini API Key to the .env file as `GEMINI_API_KEY=your_key_here`.