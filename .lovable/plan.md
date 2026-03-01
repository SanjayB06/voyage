

# Plan: Add Google Flights-Style Dropdown for Flight Details

## Overview
Add an expandable dropdown under each flight card that shows detailed segment information (terminals, aircraft, flight numbers, layovers, CO2 emissions) retrieved from Duffel API.

---

## Current State

| Component | Status |
|-----------|--------|
| Edge Function (`search_flights_duffel`) | Returns `segments` array with full details |
| Flight Service (`flightService.ts`) | Missing `segments` and `total_emissions_kg` in interface |
| Dropdown Component | Does not exist |
| TripPlanPanel / FlightOptions | No dropdown UI |

---

## Changes Required

### 1. Update Flight Service Types
**File:** `src/services/flightService.ts`

Add the missing interfaces and update `FlightOffer`:

```typescript
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
  // ... existing fields ...
  total_emissions_kg: string | null;  // ADD
  segments: SegmentDetail[];          // ADD
}
```

---

### 2. Create Dropdown Component
**File:** `src/components/flights/FlightDetailsDropdown.tsx` (NEW)

A reusable component with:
- Collapsible trigger ("Show/Hide flight details")
- Animated chevron rotation
- Segment rows showing:
  - Departure/arrival times
  - Airport codes and names
  - Terminal info (if available)
  - Flight duration
  - Flight number (e.g., "UA 1234")
  - Operating carrier (if different from marketing carrier)
  - Aircraft type (e.g., "Boeing 737-800")
- Layover indicators between segments
- CO2 emissions display at bottom

---

### 3. Integrate into TripPlanPanel
**File:** `src/components/app/TripPlanPanel.tsx`

| Change | Description |
|--------|-------------|
| Add state | `expandedFlightId` to track which flight's dropdown is open |
| Import | `FlightDetailsDropdown` component |
| Render | Add dropdown after each flight card's content |

---

### 4. Integrate into FlightOptions Page
**File:** `src/pages/FlightOptions.tsx`

| Change | Description |
|--------|-------------|
| Add state | `expandedOfferId` for tracking expanded flight |
| Import | `FlightDetailsDropdown` component |
| Render | Add dropdown inside each flight card |

---

## Visual Design

```text
+--------------------------------------------------+
| United Airlines              7:30 AM → 9:45 AM   |
| Nonstop • 2h 15m                          $189   |
|                                        [Book]    |
+--------------------------------------------------+
|           [ Show flight details  v ]             |
+--------------------------------------------------+
         (when expanded)
+--------------------------------------------------+
| +----------------------------------------------+ |
| | 7:30 AM • SFO San Francisco Int'l  Terminal 3| |
| |   Duration: 2h 15m                           | |
| |   UA 1234 • Boeing 737-800                   | |
| | 9:45 AM • SAN San Diego Int'l     Terminal 2 | |
| +----------------------------------------------+ |
|                                                  |
| CO2 emissions: 142 kg                            |
+--------------------------------------------------+
```

For flights with connections:
```text
+----------------------------------------------+
| Segment 1: SFO → DEN                         |
+----------------------------------------------+
| 2h 35m layover in Denver (DEN)               |
+----------------------------------------------+
| Segment 2: DEN → SAN                         |
+----------------------------------------------+
```

---

## File Summary

| File | Action |
|------|--------|
| `src/services/flightService.ts` | Update interfaces |
| `src/components/flights/FlightDetailsDropdown.tsx` | Create new |
| `src/components/app/TripPlanPanel.tsx` | Add dropdown integration |
| `src/pages/FlightOptions.tsx` | Add dropdown integration |

---

## Technical Notes

- Uses existing `Collapsible` component from Radix UI
- Framer Motion for chevron animation
- Data already available from Duffel - no backend changes needed
- Only one flight dropdown open at a time (accordion behavior)

