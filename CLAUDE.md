# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Voyage is an AI-powered travel agent web app. It provides a conversational UI for trip planning, searches for real flights (Duffel API), hotels (Amadeus API), and processes payments (Stripe). Built with Lovable.

## Development Commands

```bash
# Two servers must run simultaneously:
npm run dev            # Frontend (Vite) — port 8080
npm run server:dev     # Backend (Express via tsx) — port 3001

npm run build          # Production build
npm run lint           # ESLint
npm run test           # Vitest (single run)
npm run test:watch     # Vitest (watch mode)
npm run test:booking   # E2E booking flow test (requires backend running + valid .env keys)
npm run duffel:test    # Switch Supabase Duffel secret to test key
npm run duffel:live    # Switch Supabase Duffel secret to live key
```

## Architecture

### Frontend (`src/`)
- **React 18 + TypeScript + Vite** (SWC plugin), path alias `@/` → `src/`
- **Routing:** react-router-dom v6 — `/` (Index), `/flights` (FlightOptions), `*` (NotFound)
- **State:** Local `useState` only. TanStack Query is wired up but not actively used yet.
- **UI:** shadcn/ui (Radix + Tailwind) components in `src/components/ui/`. Utility: `cn()` from `src/lib/utils.ts`.
- **Animations:** Framer Motion for page transitions, panel slides, chat bubbles.
- **Styling:** Tailwind v3, custom travel theme colors (`ocean`, `teal`, `sand`, `cream`, `sky`), custom CSS utilities (`.glass-card`, `.glass-card-dark`, gradients) in `index.css`. Fonts: Plus Jakarta Sans + DM Sans.

### Main App Flow (`src/pages/Index.tsx`)
1. `LandingView` — onboarding chat with background carousel
2. After 4 questions → Framer Motion transition to `MainLayout`
3. `MainLayout` — 3-panel desktop layout:
   - **Left (380px):** `VoiceAgentPanel` — simulated conversation (hardcoded, no real LLM)
   - **Center (flex):** `TripPlanPanel` — real flight/hotel data + static itinerary
   - **Right (320px):** `CalendarPanel` + `SyncAnimationPanel`

### Backend (`server/`)
- **Express 5 + TypeScript**, run via `tsx watch`
- **Port 3001**, CORS allows `localhost:5173` and `localhost:8080`
- Routes (all POST except health):
  - `/api/search-flights` → Duffel offer search, returns top 3 by price
  - `/api/create-payment-intent` → Fetches Duffel price, creates Stripe PaymentIntent
  - `/api/confirm-payment-test` → Test-only: confirms PI with `pm_card_visa`
  - `/api/place-duffel-order` → Verifies Stripe payment, places Duffel order
- All external API calls use plain `fetch()` (no SDKs)

### Supabase (`supabase/`)
- No database tables — used purely for edge functions (Deno runtime)
- JWT verification disabled on all functions
- Edge functions: `search_flights_duffel` (fallback), `search_hotels_amadeus` (primary), `generate_itinerary_gemini`, `sync_google_calendar`

### API Call Pattern
```typescript
// Primary: local Express backend
const response = await fetch(`${API_BASE}/api/search-flights`, { method: "POST", ... });
// Fallback: Supabase edge function
const { data, error } = await supabase.functions.invoke("search_flights_duffel", { body: params });
```

## Environment Variables

**Backend (.env):** `DUFFEL_API_KEY`, `STRIPE_SECRET_KEY` (with `_TEST`/`_LIVE` variants), debit card details for Duffel balance payments.

**Frontend (VITE_ prefix):** `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID`, `VITE_API_URL` (optional, defaults to `http://[hostname]:3001`).

**Supabase secrets:** `DUFFEL_API_KEY`, `AMADEUS_CLIENT_ID`, `AMADEUS_CLIENT_SECRET` (set via `npx supabase secrets set`).

## TypeScript Configuration

TypeScript is permissive: `strict: false`, `noImplicitAny: false`, `strictNullChecks: false`. ESLint has `no-unused-vars` turned off.

## Testing

Vitest with jsdom environment. Setup in `src/test/setup.ts` (jest-dom matchers + matchMedia mock). Test files go in `src/**/*.{test,spec}.{ts,tsx}`. Currently only a placeholder test exists.

## Payment Flow

1. `POST /api/create-payment-intent` — fetches live Duffel offer price → creates Stripe PI
2. `BookingModal.tsx` collects card via Stripe Elements (or test mode uses `pm_card_visa`)
3. `POST /api/place-duffel-order` — verifies Stripe PI succeeded → creates Duffel order using `balance` payment type
