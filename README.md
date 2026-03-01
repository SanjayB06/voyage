# Voyage API Documentation

Two servers must be running simultaneously:
- **server.js** — port 3000 (Vapi voice agent, SSE, image analysis)
- **server/index.ts** — port 3001 (flights, payments, Duffel orders)

---

## server.js — Port 3000

### Health Check
```bash
curl http://localhost:3000/health
```

### Config
Returns Vapi public key and ngrok tunnel status.
```bash
curl http://localhost:3000/config
```

### Assistant Config
Returns the inline Vapi assistant configuration (requires ngrok tunnel to be ready).
```bash
curl http://localhost:3000/api/assistant-config
```

### Analyze Image
Upload a travel photo to extract destination context via Gemini. Returns an `imageSessionId` used to start a context-aware voice call.
```bash
curl -X POST http://localhost:3000/api/analyze-image \
  -F "image=@/path/to/photo.jpg"
```

### Assistant Config from Image
Returns a personalized assistant config based on a previously analyzed image.
```bash
curl "http://localhost:3000/api/assistant-config-from-image?imageSessionId=<imageSessionId>"
```

### Update Passenger Field (typed UI input)
Manually sync a passenger field into a session (mirrors what the voice agent does automatically).
```bash
curl -X POST http://localhost:3000/api/passenger-field \
  -H "Content-Type: application/json" \
  -d '{"callId":"test-call-123","field":"phone_number","value":"+14155552671"}'
```

Valid fields: `phone_number`, `email`, `date_of_birth`

### SSE Progress Stream
Server-sent event stream for a call session. Emits `field_update`, `all_fields_collected`, `flights_ready`, `flight_selected`, `passenger_field_update`, `passenger_info_complete`, `booking_confirmed`.
```bash
# Stays open — Ctrl+C to stop
curl -N http://localhost:3000/api/progress/<callId>
```

---

## server/index.ts — Port 3001

### Health Check
```bash
curl http://localhost:3001/health
```

### Search Flights
Search for flight offers via Duffel. Returns top 3 offers sorted by price.
```bash
curl -X POST http://localhost:3001/api/search-flights \
  -H "Content-Type: application/json" \
  -d '{
    "origin": "SFO",
    "destination": "NRT",
    "departure_date": "2026-04-15",
    "passengers": 1
  }'
```

### Create Payment Intent
Fetches the Duffel offer price and creates a Stripe PaymentIntent. Pass `cached_amount` and `cached_currency` to avoid a Duffel re-fetch (prevents 423 on near-expired offers).
```bash
curl -X POST http://localhost:3001/api/create-payment-intent \
  -H "Content-Type: application/json" \
  -d '{
    "offer_id": "off_0000A...",
    "cached_amount": "450.00",
    "cached_currency": "USD"
  }'
```

### Confirm Payment (Test Mode)
Confirms a Stripe PaymentIntent using the test card `pm_card_visa`. Use this instead of real card details in development.
```bash
curl -X POST http://localhost:3001/api/confirm-payment-test \
  -H "Content-Type: application/json" \
  -d '{"payment_intent_id":"pi_xxx"}'
```

### Place Duffel Order
Verifies Stripe payment succeeded, then places the order with Duffel using `balance` payment type. Sends a confirmation email via Resend if `RESEND_API_KEY` is configured.
```bash
curl -X POST http://localhost:3001/api/place-duffel-order \
  -H "Content-Type: application/json" \
  -d '{
    "offer_id": "off_0000A...",
    "payment_intent_id": "pi_xxx",
    "cached_amount": "450.00",
    "cached_currency": "USD",
    "cached_passenger_id": "pas_0000A...",
    "passenger": {
      "name": "John Smith",
      "email": "john@example.com",
      "phone": "+14155552671",
      "dob": "1990-05-15",
      "gender": "m"
    }
  }'
```

---

## Typical End-to-End Flow

```
1. POST /api/search-flights          → get offer_id, cached_amount, cached_currency
2. POST /api/create-payment-intent   → get payment_intent_id + client_secret
3. POST /api/confirm-payment-test    → confirm payment (test mode)
4. POST /api/place-duffel-order      → book flight, receive booking_reference
```
