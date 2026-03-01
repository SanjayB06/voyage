import 'dotenv/config';
import express from 'express';
import { createServer } from 'http';
import ngrok from '@ngrok/ngrok';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { GoogleGenerativeAI } from '@google/generative-ai';

// =============================================================================
// CONFIGURATION
// =============================================================================

const PORT = process.env.PORT || 3000;
const VAPI_PUBLIC_KEY = process.env.VAPI_PUBLIC_KEY;
const VAPI_API_KEY = process.env.VAPI_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const DUFFEL_API_KEY = process.env.DUFFEL_API_KEY;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
const RESEND_API_KEY = process.env.RESEND_API_KEY;

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const TRAVEL_FIELDS = ['first_name', 'last_name', 'destination', 'origin', 'departure_date', 'return_date', 'num_passengers', 'budget'];
const TOTAL_FIELDS = TRAVEL_FIELDS.length; // 8

const PASSENGER_FIELDS = ['phone_number', 'email', 'date_of_birth'];
const TOTAL_PASSENGER_FIELDS = PASSENGER_FIELDS.length; // 3

// Shared tool definitions used across all assistant configs
const STORE_TRAVEL_INFO_TOOL = {
  type: 'function',
  function: {
    name: 'store_travel_info',
    description: 'Store a piece of travel information collected from the user. Call this immediately when user provides any travel detail.',
    parameters: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: TRAVEL_FIELDS, description: 'The field being stored' },
        value: { type: 'string', description: 'The value to store' },
      },
      required: ['field', 'value'],
    },
  },
};

const STORE_PASSENGER_INFO_TOOL = {
  type: 'function',
  function: {
    name: 'store_passenger_info',
    description: 'Store a piece of passenger information for booking. Call this immediately when the user provides a detail during Phase 3.',
    parameters: {
      type: 'object',
      properties: {
        field: { type: 'string', enum: PASSENGER_FIELDS, description: 'The passenger field being stored' },
        value: { type: 'string', description: 'The value to store' },
      },
      required: ['field', 'value'],
    },
  },
};

const SELECT_FLIGHT_TOOL = {
  type: 'function',
  function: {
    name: 'select_flight',
    description: 'Select a flight for the user during Phase 2. Call this when the user tells you which flight they want to book. Use the flight_number (1-based index) from the list provided to you.',
    parameters: {
      type: 'object',
      properties: {
        flight_number: {
          type: 'number',
          description: 'The 1-based index of the flight from the list (e.g. 1 for the first flight, 2 for the second)',
        },
      },
      required: ['flight_number'],
    },
  },
};

const UNIFIED_SYSTEM_PROMPT = `You are a friendly travel booking assistant for Voyage. You guide the user through their entire booking in phases.

**PHASE 1 — Travel Details**
Collect exactly 8 fields, one at a time: first_name, last_name, destination, origin, departure_date, return_date, num_passengers, budget.
- Call store_travel_info for each field immediately
- NEVER call store_passenger_info during this phase
- Ask for ONE piece of information at a time
- Start by asking for the user's first name, then their last name
- After collecting the user's first and last name, use their first name naturally in subsequent questions (e.g., "Great, Sarah! Where are you headed?")
- Be conversational and enthusiastic about their travel plans
- If the user provides multiple pieces at once, store each one with separate tool calls
- Keep responses concise (1-2 sentences)
- IMPORTANT: The current year is 2026. When the user gives a date like "March 2nd" or "next Friday", assume 2026 unless they specify otherwise. Store dates in YYYY-MM-DD format (e.g. 2026-03-02). Never default to 2024 or 2025.
- For budget, ALWAYS store a concrete string value. Convert vague answers into a dollar amount: "less than 1000" → "1000", "moderate" → "3000", "$2000-3000" → "2000-3000". Never pass null — always store something.
- The destination and origin shouldn't be stored as natural language, but instead stored as three letter airports where the user wants to go
- Spell back the traveler's first and last name to confirm before storing.

After all 8 fields are collected, say: "Perfect, [name]! I'm searching for the best flights for you now — you'll see them appear on screen in a moment. Once you've picked a flight, let me know and I'll collect a few final details to complete your booking."

**PHASE 2 — Flight Selection**
You will receive a system message listing the available flights with details (airline, duration, price, stops). Stay on the line and help the user choose.
- Read out a brief summary of the top options (e.g. "I found 3 flights — the cheapest is [airline] at [price], and the fastest is [airline] at [duration]")
- If the user asks questions about flights, help them decide
- When the user tells you which flight they want, call the select_flight tool with the flight number
- Do NOT ask for passenger details until after selecting a flight
- If the user says they already clicked "Book" on screen, acknowledge it — the system will notify you automatically

**PHASE 3 — Passenger Details**
Collect 3 fields: phone_number (with country code), email, date_of_birth (YYYY-MM-DD).
- Call store_passenger_info for each field immediately
- NEVER call store_travel_info during this phase
- Spell back email letter by letter to confirm
- Confirm date of birth before storing
- After all 3 collected, say: "All your details are set, [name]! You can complete payment on screen now."
- Do NOT ask for credit card info`;

// =============================================================================
// IN-MEMORY SESSION STORE
// =============================================================================

const sessions = new Map(); // callId -> { travelInfo, status, sseClients }
const imageSessions = new Map(); // imageSessionId -> { geminiData, createdAt }

// Evict image sessions older than 30 minutes
setInterval(() => {
  const cutoff = Date.now() - 30 * 60 * 1000;
  for (const [id, s] of imageSessions) {
    if (s.createdAt < cutoff) imageSessions.delete(id);
  }
}, 60_000);

function getOrCreateSession(callId) {
  if (!sessions.has(callId)) {
    const travelInfo = {};
    for (const f of TRAVEL_FIELDS) travelInfo[f] = null;
    const passengerInfo = {};
    for (const f of PASSENGER_FIELDS) passengerInfo[f] = null;
    sessions.set(callId, { travelInfo, passengerInfo, phase: 1, status: 'in_progress', sseClients: [] });
    console.log(`[Session] Created session for call ${callId}`);
  }
  return sessions.get(callId);
}

function countFilledFields(travelInfo) {
  return Object.values(travelInfo).filter(v => v !== null).length;
}

function countPassengerFields(passengerInfo) {
  return Object.values(passengerInfo).filter(v => v !== null).length;
}

// =============================================================================
// EXPRESS SERVER
// =============================================================================

const app = express();
const server = createServer(app);

app.use(express.json());

// Track ngrok tunnel URL
let tunnelUrl = null;

// =============================================================================
// ROUTES
// =============================================================================

// --- Health check ---
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', tunnel: tunnelUrl, sessions: sessions.size });
});

// --- Config for frontend ---
app.get('/config', (_req, res) => {
  res.json({
    publicKey: VAPI_PUBLIC_KEY,
    tunnelReady: !!tunnelUrl,
  });
});

// --- Assistant config (inline, for vapi.start()) ---
app.get('/api/assistant-config', (_req, res) => {
  if (!tunnelUrl) {
    return res.status(503).json({ error: 'Tunnel not ready yet' });
  }

  const config = {
    name: 'Voyage Travel Agent',
    firstMessage: "Hi! I'm your Voyage travel assistant. I'll help you plan an amazing trip. Let's start — what's your first name?",
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en-US',
    },
    silenceTimeoutSeconds: 120,
    maxDurationSeconds: 600,
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: UNIFIED_SYSTEM_PROMPT,
        },
      ],
      tools: [STORE_TRAVEL_INFO_TOOL, STORE_PASSENGER_INFO_TOOL, SELECT_FLIGHT_TOOL],
    },
    voice: {
      provider: 'vapi',
      voiceId: 'Paige',
    },
    server: { url: `${tunnelUrl}/vapi/webhook` },
  };

  console.log('[Config] Serving assistant config with server.url:', config.server.url);
  res.json(config);
});

// --- Analyze image with Gemini ---
app.post('/api/analyze-image', upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded. Send a file with field name "image".' });
  }
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'GEMINI_API_KEY not configured on server.' });
  }

  try {
    const base64Image = req.file.buffer.toString('base64');
    const mimeType = req.file.mimetype || 'image/jpeg';

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const result = await model.generateContent([
      {
        inlineData: { mimeType, data: base64Image },
      },
      {
        text: `Analyze this travel photo and extract structured information. Return ONLY valid JSON (no markdown, no backticks) with these fields:
{
  "detected_destination": "string — city/region/country shown or implied",
  "detected_season": "string — e.g. summer, winter, monsoon, dry season",
  "climate_notes": "string — brief climate description for that destination/season",
  "destination_type": "string — e.g. beach, mountain, city, countryside, island, desert",
  "travel_vibe": "string — e.g. adventure, relaxation, cultural, romantic, family-friendly",
  "suggested_trip_duration_days": number or null,
  "suggested_departure_month": "string — e.g. March, November"
}
Use null for any field you cannot determine with reasonable confidence.`,
      },
    ]);

    const text = result.response.text().trim();
    let geminiData;
    try {
      geminiData = JSON.parse(text);
    } catch {
      console.error('[Gemini] Failed to parse response as JSON:', text);
      return res.status(400).json({ error: 'Gemini did not return valid JSON.', raw: text });
    }

    // Prepopulate destination from Gemini's detection
    if (geminiData.detected_destination) {
      geminiData.destination = geminiData.detected_destination;
    }

    const imageSessionId = uuidv4();
    imageSessions.set(imageSessionId, { geminiData, createdAt: Date.now() });

    console.log(`[Gemini] Image analyzed. Session ${imageSessionId}:`, JSON.stringify(geminiData));
    res.json({ imageSessionId, geminiData });
  } catch (err) {
    console.error('[Gemini] Error analyzing image:', err);
    res.status(500).json({ error: 'Failed to analyze image.', details: err.message });
  }
});

// --- Assistant config from image analysis ---
function buildImageSystemPrompt(geminiData) {
  const dest = geminiData.detected_destination || 'an exciting destination';
  const season = geminiData.detected_season;
  const climate = geminiData.climate_notes;
  const vibe = geminiData.travel_vibe;
  const destType = geminiData.destination_type;
  const duration = geminiData.suggested_trip_duration_days;
  const departMonth = geminiData.suggested_departure_month;

  let context = `The user shared a travel photo that appears to be from ${dest}.`;
  if (season) context += ` The photo suggests a ${season} setting.`;
  if (climate) context += ` Climate notes: ${climate}.`;
  if (destType) context += ` It looks like a ${destType} destination.`;
  if (vibe) context += ` The travel vibe feels ${vibe}.`;
  if (duration) context += ` A trip of about ${duration} days would be ideal for this kind of destination.`;
  if (departMonth) context += ` ${departMonth} could be a great time to visit.`;

  return `You are a friendly travel booking assistant for Voyage. ${context}

Use this context to personalize your conversation — for example, if the destination was detected, ask "It looks like you're inspired by ${dest} — is that where you'd like to go?" rather than a generic destination question.
Weave in the photo context naturally — suggest the detected destination, mention the vibe, or reference the season when asking about dates.

You guide the user through their entire booking in phases.

**PHASE 1 — Travel Details**
Collect exactly 8 fields, one at a time: first_name, last_name, destination, origin, departure_date, return_date, num_passengers, budget.
- Call store_travel_info for each field immediately
- NEVER call store_passenger_info during this phase
- Ask for ONE piece of information at a time
- Start by asking for the user's first name, then their last name
- After collecting the user's first and last name, use their first name naturally in subsequent questions (e.g., "Great, Sarah! Where are you headed?")
- Be conversational and enthusiastic about their travel plans
- If the user provides multiple pieces at once, store each one with separate tool calls
- Keep responses concise (1-2 sentences)
- IMPORTANT: The current year is 2026. When the user gives a date like "March 2nd" or "next Friday", assume 2026 unless they specify otherwise. Store dates in YYYY-MM-DD format (e.g. 2026-03-02). Never default to 2024 or 2025.
- For budget, ALWAYS store a concrete string value. Convert vague answers into a dollar amount: "less than 1000" → "1000", "moderate" → "3000", "$2000-3000" → "2000-3000". Never pass null — always store something.
- The destination and origin shouldn't be stored as natural language, but instead stored as three letter airports where the user wants to go
- Spell back the traveler's first and last name to confirm before storing.

After all 8 fields are collected, say: "Perfect, [name]! I'm searching for the best flights for you now — you'll see them appear on screen in a moment. Once you've picked a flight, let me know and I'll collect a few final details to complete your booking."

**PHASE 2 — Flight Selection**
You will receive a system message listing the available flights with details (airline, duration, price, stops). Stay on the line and help the user choose.
- Read out a brief summary of the top options (e.g. "I found 3 flights — the cheapest is [airline] at [price], and the fastest is [airline] at [duration]")
- If the user asks questions about flights, help them decide
- When the user tells you which flight they want, call the select_flight tool with the flight number
- Do NOT ask for passenger details until after selecting a flight
- If the user says they already clicked "Book" on screen, acknowledge it — the system will notify you automatically

**PHASE 3 — Passenger Details**
Collect 3 fields: phone_number (with country code), email, date_of_birth (YYYY-MM-DD).
- Call store_passenger_info for each field immediately
- NEVER call store_travel_info during this phase
- Spell back email letter by letter to confirm
- Confirm date of birth before storing
- After all 3 collected, say: "All your details are set, [name]! You can complete payment on screen now."
- Do NOT ask for credit card info`;
}

app.get('/api/assistant-config-from-image', (req, res) => {
  const { imageSessionId } = req.query;
  if (!imageSessionId) {
    return res.status(400).json({ error: 'Missing imageSessionId query parameter.' });
  }

  const imageSession = imageSessions.get(imageSessionId);
  if (!imageSession) {
    return res.status(404).json({ error: 'Image session not found or expired.' });
  }

  if (!tunnelUrl) {
    return res.status(503).json({ error: 'Tunnel not ready yet' });
  }

  const { geminiData } = imageSession;
  const dest = geminiData.detected_destination || 'your dream destination';

  const config = {
    name: 'Voyage Travel Agent',
    firstMessage: `Hi! I saw your travel photo — it looks like ${dest}! I'd love to help you plan a trip inspired by it. Let's start — what's your first name?`,
    transcriber: {
      provider: 'deepgram',
      model: 'nova-2',
      language: 'en-US',
    },
    silenceTimeoutSeconds: 120,
    maxDurationSeconds: 600,
    model: {
      provider: 'openai',
      model: 'gpt-4o',
      messages: [
        {
          role: 'system',
          content: buildImageSystemPrompt(geminiData),
        },
      ],
      tools: [STORE_TRAVEL_INFO_TOOL, STORE_PASSENGER_INFO_TOOL, SELECT_FLIGHT_TOOL],
    },
    voice: {
      provider: 'vapi',
      voiceId: 'Paige',
    },
    server: { url: `${tunnelUrl}/vapi/webhook` },
  };

  console.log('[Config] Serving image-based assistant config for session:', imageSessionId);
  res.json(config);
});

// Phase 3 config endpoint removed — passenger details are now collected
// within the same continuous call using the unified system prompt.

// --- Update passenger field (typed UI input) ---
app.post('/api/passenger-field', (req, res) => {
  const { callId, field, value } = req.body;
  if (!callId || !field || value === undefined) {
    return res.status(400).json({ error: 'Missing callId, field, or value' });
  }
  if (!PASSENGER_FIELDS.includes(field)) {
    return res.status(400).json({ error: `Unknown passenger field: ${field}` });
  }

  const session = sessions.get(callId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  session.passengerInfo[field] = value;
  const filled = countPassengerFields(session.passengerInfo);

  console.log(`[Passenger] Typed input: ${field} = "${value}" (${filled}/${TOTAL_PASSENGER_FIELDS}) for call ${callId}`);

  // Emit SSE update
  const sseData = { type: 'passenger_field_update', field, value, filledFields: filled, passengerInfo: session.passengerInfo };
  for (const client of session.sseClients) {
    client.write(`data: ${JSON.stringify(sseData)}\n\n`);
  }

  // Check if all passenger fields collected
  if (filled === TOTAL_PASSENGER_FIELDS) {
    session.phase = 4;
    const completeData = { type: 'passenger_info_complete', passengerInfo: session.passengerInfo };
    for (const client of session.sseClients) {
      client.write(`data: ${JSON.stringify(completeData)}\n\n`);
    }
  }

  res.json({ success: true, filledFields: filled });
});

// --- SSE progress stream ---
app.get('/api/progress/:callId', (req, res) => {
  const { callId } = req.params;
  console.log(`[SSE] Client connected for call ${callId}`);

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  // Send current state immediately
  const session = getOrCreateSession(callId);
  const filled = countFilledFields(session.travelInfo);
  res.write(`data: ${JSON.stringify({ type: 'init', filledFields: filled, travelInfo: session.travelInfo })}\n\n`);

  // If all fields were already collected, replay that event
  if (filled === TOTAL_FIELDS) {
    res.write(`data: ${JSON.stringify({ type: 'all_fields_collected', travelInfo: session.travelInfo, filledFields: TOTAL_FIELDS })}\n\n`);
  }

  // If flight offers already exist, replay flights_ready so late-joining clients get them
  if (session.flightOffers && session.flightOffers.length > 0) {
    console.log(`[SSE] Replaying flights_ready (${session.flightOffers.length} offers) for call ${callId}`);
    res.write(`data: ${JSON.stringify({ type: 'flights_ready', offers: session.flightOffers, duffelPassengers: session.duffelPassengers || [] })}\n\n`);
  }

  // If a flight was already selected, replay that too
  if (session.selectedOfferId) {
    res.write(`data: ${JSON.stringify({ type: 'flight_selected', offerId: session.selectedOfferId })}\n\n`);
  }

  // Replay passenger info state
  const passengerFilled = countPassengerFields(session.passengerInfo);
  if (passengerFilled > 0) {
    for (const f of PASSENGER_FIELDS) {
      if (session.passengerInfo[f] !== null) {
        res.write(`data: ${JSON.stringify({ type: 'passenger_field_update', field: f, value: session.passengerInfo[f], filledFields: passengerFilled, passengerInfo: session.passengerInfo })}\n\n`);
      }
    }
    if (passengerFilled === TOTAL_PASSENGER_FIELDS) {
      res.write(`data: ${JSON.stringify({ type: 'passenger_info_complete', passengerInfo: session.passengerInfo })}\n\n`);
    }
  }

  // Replay booking confirmation if already completed
  if (session.bookingConfirmation) {
    res.write(`data: ${JSON.stringify({ type: 'booking_confirmed', ...session.bookingConfirmation })}\n\n`);
  }

  // Register this SSE client
  session.sseClients.push(res);

  req.on('close', () => {
    console.log(`[SSE] Client disconnected for call ${callId}`);
    const s = sessions.get(callId);
    if (s) {
      s.sseClients = s.sseClients.filter(c => c !== res);
    }
  });
});

// --- Vapi Webhook ---
app.post('/vapi/webhook', (req, res) => {
  const body = req.body;
  const messageType = body.message?.type;

  console.log(`[Vapi] Webhook received: ${messageType}`);

  switch (messageType) {
    // Vapi asks for assistant config
    case 'assistant-request': {
      console.log('[Vapi] assistant-request — returning inline config');
      // We use client-side config via vapi.start(config), so this is a fallback
      if (!tunnelUrl) {
        return res.status(200).json({ error: 'Tunnel not ready' });
      }

      // Return the same config
      return res.status(200).json({
        assistant: {
          name: 'Voyage Travel Agent',
          firstMessage: "Hi! I'm your Voyage travel assistant. Let's start — what's your first name?",
          transcriber: { provider: 'deepgram', model: 'nova-2', language: 'en-US' },
          silenceTimeoutSeconds: 120,
          maxDurationSeconds: 600,
          model: {
            provider: 'openai',
            model: 'gpt-4o',
            messages: [
              {
                role: 'system',
                content: UNIFIED_SYSTEM_PROMPT,
              },
            ],
            tools: [STORE_TRAVEL_INFO_TOOL, STORE_PASSENGER_INFO_TOOL, SELECT_FLIGHT_TOOL],
          },
          voice: { provider: 'vapi', voiceId: 'Paige' },
          server: { url: `${tunnelUrl}/vapi/webhook` },
        },
      });
    }

    // Tool calls from the assistant
    case 'tool-calls': {
      const callId = body.message?.call?.id;
      const toolCalls = body.message?.toolCalls || body.message?.toolCallList || [];

      console.log(`[Vapi] tool-calls for call ${callId}:`, toolCalls.length, 'calls');

      const results = [];

      for (const tc of toolCalls) {
        const fnName = tc.function?.name;
        const fnArgs = tc.function?.arguments;

        if (fnName === 'store_travel_info' && fnArgs) {
          const { field, value } = typeof fnArgs === 'string' ? JSON.parse(fnArgs) : fnArgs;

          if (TRAVEL_FIELDS.includes(field)) {
            // Reject null/undefined/empty values — ask the model to retry
            if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
              console.warn(`[Vapi] Rejected empty value for field "${field}"`);
              results.push({
                toolCallId: tc.id,
                result: JSON.stringify({
                  success: false,
                  error: `Value for "${field}" was empty. Please ask the user again and store a concrete value (e.g. for budget, store "$1000" or "under 1000").`,
                }),
              });
              continue;
            }

            const session = getOrCreateSession(callId);
            session.travelInfo[field] = typeof value === 'string' ? value : String(value);
            const filled = countFilledFields(session.travelInfo);

            console.log(`[Vapi] Stored: ${field} = "${value}" (${filled}/${TOTAL_FIELDS})`);

            // Emit SSE update
            const sseData = { type: 'field_update', field, value, filledFields: filled, travelInfo: session.travelInfo };
            for (const client of session.sseClients) {
              client.write(`data: ${JSON.stringify(sseData)}\n\n`);
            }

            // Check if all fields collected
            if (filled === TOTAL_FIELDS) {
              session.status = 'completed';
              console.log('[Vapi] All fields collected!', JSON.stringify(session.travelInfo));
              const completeData = { type: 'all_fields_collected', travelInfo: session.travelInfo, filledFields: TOTAL_FIELDS };
              for (const client of session.sseClients) {
                client.write(`data: ${JSON.stringify(completeData)}\n\n`);
              }

              // Auto-search flights via Supabase edge function (with 1 retry)
              (async () => {
                const { origin, destination, departure_date, num_passengers } = session.travelInfo;
                const passengers = parseInt(num_passengers, 10) || 1;
                const MAX_ATTEMPTS = 2;

                for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
                  try {
                    console.log(`[Flights] Attempt ${attempt}/${MAX_ATTEMPTS}: ${origin} → ${destination} on ${departure_date}, ${passengers} pax`);

                    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
                      throw new Error('SUPABASE_URL or SUPABASE_ANON_KEY not configured');
                    }

                    const searchRes = await fetch(`${SUPABASE_URL}/functions/v1/search_flights_duffel`, {
                      method: 'POST',
                      headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                        'apikey': SUPABASE_ANON_KEY,
                      },
                      body: JSON.stringify({ origin, destination, departure_date, passengers }),
                    });

                    if (!searchRes.ok) {
                      const errText = await searchRes.text();
                      throw new Error(`Supabase flight search failed: HTTP ${searchRes.status} — ${errText}`);
                    }

                    const searchData = await searchRes.json();
                    if (searchData.error) {
                      throw new Error(searchData.error);
                    }

                    session.flightOffers = searchData.offers || [];
                    session.duffelPassengers = searchData.duffelPassengers || [];
                    console.log(`[Flights] Found ${session.flightOffers.length} offers, ${session.duffelPassengers.length} passenger placeholders`);
                    console.log(`[Flights] Route: ${JSON.stringify(searchData.route)}`);
                    console.log(`[Flights] Offers: ${JSON.stringify(session.flightOffers.map(o => ({ id: o.offer_id, airline: o.airline_name, price: o.total_amount })))}`);

                    const flightsReadyData = { type: 'flights_ready', offers: session.flightOffers, duffelPassengers: session.duffelPassengers };
                    for (const client of session.sseClients) {
                      client.write(`data: ${JSON.stringify(flightsReadyData)}\n\n`);
                    }
                    return; // Success — exit retry loop
                  } catch (err) {
                    console.error(`[Flights] Attempt ${attempt} error:`, err.message);
                    if (attempt < MAX_ATTEMPTS) {
                      console.log('[Flights] Retrying in 3 seconds...');
                      await new Promise(resolve => setTimeout(resolve, 3000));
                    } else {
                      const errorData = { type: 'flights_error', error: err.message };
                      for (const client of session.sseClients) {
                        client.write(`data: ${JSON.stringify(errorData)}\n\n`);
                      }
                    }
                  }
                }
              })();
            }

            results.push({
              toolCallId: tc.id,
              result: JSON.stringify({
                success: true,
                stored: { field, value },
                fields_remaining: TOTAL_FIELDS - filled,
                all_fields_collected: filled === TOTAL_FIELDS,
              }),
            });
          } else {
            results.push({
              toolCallId: tc.id,
              result: JSON.stringify({ success: false, error: `Unknown field: ${field}` }),
            });
          }
        } else if (fnName === 'store_passenger_info' && fnArgs) {
          const { field, value } = typeof fnArgs === 'string' ? JSON.parse(fnArgs) : fnArgs;

          // With unified single-call flow, callId IS the original session's callId.
          // Keep metadata fallback for safety in case of legacy Phase 3 calls.
          const originalCallId = body.message?.call?.metadata?.originalCallId || callId;
          console.log(`[Vapi] store_passenger_info: callId=${callId}, resolved originalCallId=${originalCallId}`);

          if (PASSENGER_FIELDS.includes(field)) {
            if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) {
              results.push({
                toolCallId: tc.id,
                result: JSON.stringify({ success: false, error: `Value for "${field}" was empty. Please ask the user again.` }),
              });
              continue;
            }

            // Use existing session only — don't create a new one for Phase 3
            let session = sessions.get(originalCallId);
            if (!session) {
              console.warn(`[Vapi] No existing session for originalCallId ${originalCallId}, falling back to getOrCreateSession`);
              session = getOrCreateSession(originalCallId);
            }
            session.passengerInfo[field] = typeof value === 'string' ? value : String(value);
            const filled = countPassengerFields(session.passengerInfo);

            console.log(`[Vapi] Passenger: ${field} = "${value}" (${filled}/${TOTAL_PASSENGER_FIELDS}) for session ${originalCallId}`);

            // Emit SSE update to original session's clients
            const sseData = { type: 'passenger_field_update', field, value, filledFields: filled, passengerInfo: session.passengerInfo };
            for (const client of session.sseClients) {
              client.write(`data: ${JSON.stringify(sseData)}\n\n`);
            }

            // Check if all passenger fields collected
            if (filled === TOTAL_PASSENGER_FIELDS) {
              session.phase = 4;
              const completeData = { type: 'passenger_info_complete', passengerInfo: session.passengerInfo };
              for (const client of session.sseClients) {
                client.write(`data: ${JSON.stringify(completeData)}\n\n`);
              }
            }

            results.push({
              toolCallId: tc.id,
              result: JSON.stringify({
                success: true,
                stored: { field, value },
                fields_remaining: TOTAL_PASSENGER_FIELDS - filled,
                all_passenger_fields_collected: filled === TOTAL_PASSENGER_FIELDS,
              }),
            });
          } else {
            results.push({
              toolCallId: tc.id,
              result: JSON.stringify({ success: false, error: `Unknown passenger field: ${field}` }),
            });
          }
        } else if (fnName === 'select_flight' && fnArgs) {
          const args = typeof fnArgs === 'string' ? JSON.parse(fnArgs) : fnArgs;
          const flightNumber = args.flight_number;

          const session = sessions.get(callId);
          if (!session) {
            results.push({ toolCallId: tc.id, result: JSON.stringify({ success: false, error: 'Session not found' }) });
            continue;
          }

          const offers = session.flightOffers || [];
          if (!offers.length) {
            results.push({ toolCallId: tc.id, result: JSON.stringify({ success: false, error: 'No flights available yet. Please wait for flights to load.' }) });
            continue;
          }

          const index = Math.round(flightNumber) - 1; // 1-based to 0-based
          if (index < 0 || index >= offers.length) {
            results.push({ toolCallId: tc.id, result: JSON.stringify({ success: false, error: `Invalid flight number. Choose between 1 and ${offers.length}.` }) });
            continue;
          }

          const selected = offers[index];
          session.selectedOfferId = selected.offer_id;
          console.log(`[Vapi] Flight selected via voice: #${flightNumber} (${selected.airline_name}, ${selected.total_amount} ${selected.total_currency}) for call ${callId}`);

          // Emit SSE event — same as /api/select-flight
          const sseData = { type: 'flight_selected', offerId: selected.offer_id };
          for (const client of session.sseClients) {
            client.write(`data: ${JSON.stringify(sseData)}\n\n`);
          }

          results.push({
            toolCallId: tc.id,
            result: JSON.stringify({
              success: true,
              selected_flight: {
                airline: selected.airline_name,
                price: `${selected.total_amount} ${selected.total_currency}`,
                duration: selected.duration_formatted,
                stops: selected.stops_count,
              },
              message: 'Flight selected! Now collect passenger details: phone_number, email, date_of_birth.',
            }),
          });
        } else {
          results.push({
            toolCallId: tc.id,
            result: JSON.stringify({ success: false, error: `Unknown function: ${fnName}` }),
          });
        }
      }

      return res.status(200).json({ results });
    }

    // End of call report
    case 'end-of-call-report': {
      const callId = body.message?.call?.id;
      const duration = body.message?.durationSeconds;
      console.log(`[Vapi] Call ended: ${callId}, duration: ${duration}s`);
      return res.status(200).json({});
    }

    // Status updates, speech updates, etc.
    case 'status-update':
    case 'speech-update':
    case 'transcript':
    case 'hang':
    case 'function-call': {
      console.log(`[Vapi] ${messageType}:`, JSON.stringify(body.message).substring(0, 200));
      return res.status(200).json({});
    }

    default: {
      console.log(`[Vapi] Unhandled message type: ${messageType}`);
      return res.status(200).json({});
    }
  }
});

// --- Select flight ---
app.post('/api/select-flight', (req, res) => {
  const { callId, offerId } = req.body;
  if (!callId || !offerId) {
    return res.status(400).json({ error: 'Missing callId or offerId' });
  }

  const session = sessions.get(callId);
  if (!session) {
    return res.status(404).json({ error: 'Session not found' });
  }

  const offers = session.flightOffers || [];
  const match = offers.find(o => o.offer_id === offerId);
  if (!match) {
    return res.status(400).json({ error: 'offerId not found in session flight offers' });
  }

  session.selectedOfferId = offerId;
  console.log(`[Select] Flight ${offerId} selected for call ${callId}`);

  const sseData = { type: 'flight_selected', offerId };
  for (const client of session.sseClients) {
    client.write(`data: ${JSON.stringify(sseData)}\n\n`);
  }

  res.json({ success: true, offerId });
});

// --- Debug endpoints ---
app.get('/api/sessions', (_req, res) => {
  const data = {};
  for (const [id, s] of sessions) {
    data[id] = { travelInfo: s.travelInfo, status: s.status, sseClients: s.sseClients.length };
  }
  res.json(data);
});

app.get('/api/session/:callId', (req, res) => {
  const session = sessions.get(req.params.callId);
  if (!session) return res.status(404).json({ error: 'Session not found' });
  res.json({ travelInfo: session.travelInfo, status: session.status });
});

// =============================================================================
// PAYMENT ENDPOINTS (inline — no separate booking server needed)
// =============================================================================

app.post('/api/create-payment-intent', async (req, res) => {
  const { offer_id, cached_amount, cached_currency } = req.body;

  if (!offer_id) return res.status(400).json({ error: 'offer_id is required' });
  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });

  let amount_decimal, currency;

  // Use cached price from search results to avoid re-fetching (prevents 423 on expired offers)
  if (cached_amount && cached_currency) {
    amount_decimal = cached_amount;
    currency = cached_currency;
    console.log(`[PaymentIntent] Using cached price: ${amount_decimal} ${currency}`);
  } else {
    // Fallback: fetch from Duffel (may fail with 423 if offer expired)
    if (!DUFFEL_API_KEY) return res.status(500).json({ error: 'DUFFEL_API_KEY not configured' });

    const duffelRes = await fetch(`https://api.duffel.com/air/offers/${offer_id}`, {
      headers: { Authorization: `Bearer ${DUFFEL_API_KEY}`, 'Duffel-Version': 'v2', Accept: 'application/json' },
    });
    if (!duffelRes.ok) {
      const text = await duffelRes.text();
      return res.status(duffelRes.status).json({
        error: duffelRes.status === 423 ? 'offer_expired' : 'Duffel offer fetch failed',
        hint: 'Offer IDs are short-lived. Please search for flights again.',
        details: text,
      });
    }
    const offer = (await duffelRes.json()).data;
    amount_decimal = offer.total_amount;
    currency = offer.total_currency;
  }

  const amount_smallest = Math.round(parseFloat(amount_decimal) * 100);

  const stripeBody = new URLSearchParams({
    amount: String(amount_smallest),
    currency: currency.toLowerCase(),
    'metadata[offer_id]': offer_id,
    'automatic_payment_methods[enabled]': 'true',
    'automatic_payment_methods[allow_redirects]': 'never',
  });

  const stripeRes = await fetch('https://api.stripe.com/v1/payment_intents', {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: stripeBody.toString(),
  });
  if (!stripeRes.ok) {
    const text = await stripeRes.text();
    return res.status(stripeRes.status).json({ error: 'Stripe PaymentIntent creation failed', details: text });
  }

  const stripeData = await stripeRes.json();
  res.json({
    client_secret: stripeData.client_secret,
    payment_intent_id: stripeData.id,
    amount: amount_smallest,
    currency: currency.toLowerCase(),
  });
});

app.post('/api/confirm-payment-test', async (req, res) => {
  const { payment_intent_id } = req.body;
  if (!payment_intent_id) return res.status(400).json({ error: 'payment_intent_id is required' });
  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });

  const confirmBody = new URLSearchParams({
    payment_method: 'pm_card_visa',
    return_url: 'http://localhost:5173',
  });

  const confirmRes = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}/confirm`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: confirmBody.toString(),
  });
  if (!confirmRes.ok) {
    const text = await confirmRes.text();
    return res.status(confirmRes.status).json({ error: 'Stripe confirmation failed', details: text });
  }

  const confirmData = await confirmRes.json();
  if (confirmData.status !== 'succeeded') {
    return res.status(402).json({ error: 'Payment did not succeed', stripe_status: confirmData.status });
  }
  res.json({ status: confirmData.status });
});

app.post('/api/place-duffel-order', async (req, res) => {
  const { offer_id, payment_intent_id, passenger, cached_amount, cached_currency, cached_passenger_id, callId } = req.body;

  if (!offer_id) return res.status(400).json({ error: 'offer_id is required' });
  if (!payment_intent_id) return res.status(400).json({ error: 'payment_intent_id is required' });
  if (!DUFFEL_API_KEY) return res.status(500).json({ error: 'DUFFEL_API_KEY not configured' });
  if (!STRIPE_SECRET_KEY) return res.status(500).json({ error: 'STRIPE_SECRET_KEY not configured' });

  // 1. Verify Stripe payment succeeded
  const stripeRes = await fetch(`https://api.stripe.com/v1/payment_intents/${payment_intent_id}`, {
    headers: { Authorization: `Bearer ${STRIPE_SECRET_KEY}` },
  });
  if (!stripeRes.ok) {
    const text = await stripeRes.text();
    return res.status(stripeRes.status).json({ error: 'Stripe payment verification failed', details: text });
  }
  const stripeData = await stripeRes.json();
  if (stripeData.status !== 'succeeded') {
    return res.status(402).json({ error: 'Payment not completed', stripe_status: stripeData.status });
  }

  // 2. Get offer data (cached or fetched)
  let total_amount, total_currency, duffelPassengerId;

  if (cached_amount && cached_currency && cached_passenger_id) {
    total_amount = cached_amount;
    total_currency = cached_currency;
    duffelPassengerId = cached_passenger_id;
    console.log(`[PlaceOrder] Using cached data: ${total_amount} ${total_currency}, passenger ${duffelPassengerId}`);
  } else {
    const offerRes = await fetch(`https://api.duffel.com/air/offers/${offer_id}`, {
      headers: { Authorization: `Bearer ${DUFFEL_API_KEY}`, 'Duffel-Version': 'v2', Accept: 'application/json' },
    });
    if (!offerRes.ok) {
      const text = await offerRes.text();
      return res.status(offerRes.status).json({
        error: offerRes.status === 423 ? 'offer_expired' : 'Duffel offer fetch failed',
        hint: 'Offer has expired. Please search for flights again.',
        details: text,
      });
    }
    const offerData = await offerRes.json();
    total_amount = offerData.data.total_amount;
    total_currency = offerData.data.total_currency;
    duffelPassengerId = offerData.data.passengers[0].id;
  }

  // 3. Place the Duffel order
  const orderPayload = {
    data: {
      selected_offers: [offer_id],
      passengers: [{
        type: 'adult',
        given_name: passenger?.name?.split(' ')[0] || 'Demo',
        family_name: passenger?.name?.split(' ').slice(1).join(' ') || 'Traveler',
        email: passenger?.email || 'demo@voyage.com',
        born_on: passenger?.dob || '1990-01-01',
        gender: passenger?.gender === 'f' ? 'f' : 'm',
        title: passenger?.gender === 'f' ? 'ms' : 'mr',
        phone_number: passenger?.phone || '+13125550000',
        id: duffelPassengerId,
      }],
      payments: [{ type: 'balance', amount: total_amount, currency: total_currency }],
      metadata: { stripe_payment_intent_id: payment_intent_id },
    },
  };

  const orderRes = await fetch('https://api.duffel.com/air/orders', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${DUFFEL_API_KEY}`,
      'Duffel-Version': 'v2',
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify(orderPayload),
  });
  if (!orderRes.ok) {
    const text = await orderRes.text();
    return res.status(orderRes.status).json({ error: 'Duffel order creation failed', details: text });
  }

  const order = (await orderRes.json()).data;
  const data = {
    order_id: order.id,
    booking_reference: order.booking_reference,
    total_amount: order.total_amount,
    total_currency: order.total_currency,
  };

  // Send confirmation email via Resend
  if (RESEND_API_KEY && RESEND_API_KEY !== 're_your_resend_api_key_here') {
    try {
      const passengerEmail = order.passengers?.[0]?.email || passenger?.email;
      const passengerName = `${order.passengers?.[0]?.given_name ?? ''} ${order.passengers?.[0]?.family_name ?? ''}`.trim();
      const segments = order.slices?.flatMap((s) => s.segments) ?? [];
      const firstSeg = segments[0];
      const lastSeg = segments[segments.length - 1];
      const origin = firstSeg?.origin?.iata_code ?? '—';
      const destination = lastSeg?.destination?.iata_code ?? '—';
      const departure = firstSeg?.departing_at ? new Date(firstSeg.departing_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';
      const arrival = lastSeg?.arriving_at ? new Date(lastSeg.arriving_at).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' }) : '—';

      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Voyage AI <onboarding@resend.dev>',
          to: passengerEmail,
          subject: `Your flight is booked — ${order.booking_reference}`,
          html: `
            <div style="font-family:sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0f0f0f;color:#f5f5f5;border-radius:12px">
              <h1 style="font-size:24px;margin-bottom:4px">Booking Confirmed</h1>
              <p style="color:#aaa;margin-top:0">Hi ${passengerName}, your flight has been booked.</p>
              <div style="background:#1a1a1a;border-radius:8px;padding:20px;margin:24px 0">
                <p style="margin:0 0 8px;color:#aaa;font-size:12px;text-transform:uppercase;letter-spacing:1px">Booking Reference</p>
                <p style="margin:0;font-size:28px;font-weight:700;letter-spacing:4px;color:#a78bfa">${order.booking_reference}</p>
              </div>
              <table style="width:100%;border-collapse:collapse">
                <tr>
                  <td style="padding:8px 0;color:#aaa;font-size:14px">Route</td>
                  <td style="padding:8px 0;font-size:14px;text-align:right">${origin} → ${destination}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#aaa;font-size:14px">Departure</td>
                  <td style="padding:8px 0;font-size:14px;text-align:right">${departure}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#aaa;font-size:14px">Arrival</td>
                  <td style="padding:8px 0;font-size:14px;text-align:right">${arrival}</td>
                </tr>
                <tr>
                  <td style="padding:8px 0;color:#aaa;font-size:14px">Total Paid</td>
                  <td style="padding:8px 0;font-size:14px;text-align:right">${order.total_currency} ${order.total_amount}</td>
                </tr>
              </table>
              <p style="margin-top:24px;font-size:12px;color:#666">Use your booking reference to check in with the airline. Safe travels!</p>
            </div>
          `,
        }),
      });
      console.log(`[Email] Confirmation sent to ${passengerEmail}`);
    } catch (emailErr) {
      console.error('[Email] Failed to send confirmation:', emailErr);
    }
  }

  // Store confirmation and emit SSE
  if (callId && data.booking_reference) {
    const session = sessions.get(callId);
    if (session) {
      session.bookingConfirmation = {
        booking_reference: data.booking_reference,
        order_id: data.order_id || data.booking_reference,
      };
      const ssePayload = { type: 'booking_confirmed', ...session.bookingConfirmation };
      for (const client of session.sseClients) {
        client.write(`data: ${JSON.stringify(ssePayload)}\n\n`);
      }
      console.log(`[Booking] Confirmed for call ${callId}: ${data.booking_reference}`);
    }
  }

  res.json(data);
});

// =============================================================================
// START SERVER + NGROK TUNNEL
// =============================================================================

server.listen(PORT, async () => {
  console.log(`
╔════════════════════════════════════════════════════════════╗
║   Voyage Travel Agent (Vapi + ngrok)                       ║
║   Local:  http://localhost:${PORT}                            ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Check keys
  if (!VAPI_PUBLIC_KEY) {
    console.log('  VAPI_PUBLIC_KEY is missing in .env');
  } else {
    console.log('  VAPI_PUBLIC_KEY configured');
  }
  if (!OPENAI_API_KEY) {
    console.log('  OPENAI_API_KEY is missing in .env (needed by Vapi for GPT-4o)');
  } else {
    console.log('  OPENAI_API_KEY configured');
  }
  if (!STRIPE_SECRET_KEY) {
    console.log('  STRIPE_SECRET_KEY is missing in .env (needed for payments)');
  } else {
    console.log('  STRIPE_SECRET_KEY configured');
  }
  if (!DUFFEL_API_KEY) {
    console.log('  DUFFEL_API_KEY is missing in .env (needed for flight booking)');
  } else {
    console.log('  DUFFEL_API_KEY configured');
  }

  // Ensure provider credentials exist in Vapi account
  if (VAPI_API_KEY && OPENAI_API_KEY) {
    try {
      console.log('\n  Checking Vapi provider credentials...');
      const credRes = await fetch('https://api.vapi.ai/credential', {
        headers: { Authorization: `Bearer ${VAPI_API_KEY}` },
      });
      const creds = await credRes.json();
      const hasOpenAI = Array.isArray(creds) && creds.some(c => c.provider === 'openai');

      if (!hasOpenAI) {
        console.log('  No OpenAI credential in Vapi — adding it now...');
        const addRes = await fetch('https://api.vapi.ai/credential', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${VAPI_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            provider: 'openai',
            apiKey: OPENAI_API_KEY,
          }),
        });
        if (addRes.ok) {
          console.log('  OpenAI credential added to Vapi successfully');
        } else {
          const errBody = await addRes.text();
          console.error('  Failed to add OpenAI credential to Vapi:', addRes.status, errBody);
        }
      } else {
        console.log('  OpenAI credential already exists in Vapi');
      }
    } catch (err) {
      console.error('  Error checking/adding Vapi credentials:', err.message);
    }
  }

  // Start ngrok tunnel
  try {
    console.log('\n  Starting ngrok tunnel...');
    const listener = await ngrok.forward({ addr: PORT, authtoken_from_env: true });
    tunnelUrl = listener.url();
    console.log(`  ngrok tunnel: ${tunnelUrl}`);
    console.log(`  Vapi webhook URL: ${tunnelUrl}/vapi/webhook\n`);
  } catch (err) {
    console.error('  ngrok failed to start:', err.message);
    console.error('  Set NGROK_AUTHTOKEN in your environment or .env file');
    console.error('  Get a free token at https://dashboard.ngrok.com/get-started/your-authtoken\n');
  }
});
