import { useState, useEffect, useRef, useCallback } from "react";
import Vapi from "@vapi-ai/web";
import type { FlightOffer } from "@/services/flightService";

export interface VapiMessage {
  id: string;
  role: "agent" | "user";
  content: string;
  isFinal: boolean;
}

export interface BookingConfirmation {
  booking_reference: string;
  order_id: string;
}

export interface VapiState {
  startCall: (imageSessionId?: string) => Promise<void>;
  endCall: () => void;
  sendText: (text: string) => void;
  notifyFlightSelected: (offer: FlightOffer) => void;
  isCallActive: boolean;
  isListening: boolean;
  isProcessing: boolean;
  messages: VapiMessage[];
  callId: string | null;
  travelInfo: Record<string, string | null> | null;
  filledFields: number;
  error: string | null;
  flightOffers: FlightOffer[];
  selectedOfferId: string | null;
  pipelinePhase: 1 | 2 | 3 | 4;
  passengerInfo: Record<string, string | null> | null;
  passengerFieldsFilled: number;
  isPassengerInfoComplete: boolean;
  bookingConfirmation: BookingConfirmation | null;
  duffelPassengerId: string | null;
}

const TOTAL_FIELDS = 8;

export function useVapi(): VapiState {
  const vapiRef = useRef<Vapi | null>(null);
  const sseRef = useRef<EventSource | null>(null);
  const publicKeyRef = useRef<string | null>(null);
  const flightOffersRef = useRef<FlightOffer[]>([]);

  const [isCallActive, setIsCallActive] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [messages, setMessages] = useState<VapiMessage[]>([]);
  const [callId, setCallId] = useState<string | null>(null);
  const [travelInfo, setTravelInfo] = useState<Record<string, string | null> | null>(null);
  const [filledFields, setFilledFields] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [flightOffers, setFlightOffers] = useState<FlightOffer[]>([]);
  const [selectedOfferId, setSelectedOfferId] = useState<string | null>(null);
  const [pipelinePhase, setPipelinePhase] = useState<1 | 2 | 3 | 4>(1);
  const [passengerInfo, setPassengerInfo] = useState<Record<string, string | null> | null>(null);
  const [passengerFieldsFilled, setPassengerFieldsFilled] = useState(0);
  const [isPassengerInfoComplete, setIsPassengerInfoComplete] = useState(false);
  const [bookingConfirmation, setBookingConfirmation] = useState<BookingConfirmation | null>(null);
  const [duffelPassengerId, setDuffelPassengerId] = useState<string | null>(null);

  // Fetch config on mount
  useEffect(() => {
    console.log("[useVapi] Fetching /config...");
    fetch("/config")
      .then((r) => r.json())
      .then((data) => {
        console.log("[useVapi] Config received, publicKey:", data.publicKey ? "present" : "missing", "tunnelReady:", data.tunnelReady);
        publicKeyRef.current = data.publicKey;
      })
      .catch((err) => {
        console.error("[useVapi] Failed to fetch config:", err);
        setError("Failed to connect to server. Is server.js running?");
      });
  }, []);

  // Initialize Vapi instance lazily
  const getVapi = useCallback(() => {
    if (vapiRef.current) return vapiRef.current;

    const pk = publicKeyRef.current;
    if (!pk) {
      console.error("[useVapi] No public key available");
      return null;
    }

    console.log("[useVapi] Initializing Vapi SDK...");
    const vapi = new Vapi(pk);

    // --- Event listeners ---

    vapi.on("speech-start", () => {
      console.log("[useVapi] Speech started (user speaking)");
      setIsListening(true);
      setIsProcessing(false);
    });

    vapi.on("speech-end", () => {
      console.log("[useVapi] Speech ended");
      setIsListening(false);
      setIsProcessing(true);
    });

    vapi.on("call-start", () => {
      console.log("[useVapi] Call started");
      setIsCallActive(true);
      setError(null);
    });

    vapi.on("call-end", () => {
      console.log("[useVapi] Call ended");
      setIsCallActive(false);
      setIsListening(false);
      setIsProcessing(false);
      // Keep SSE open — flight search runs asynchronously after call ends.
      // SSE is cleaned up on unmount or when endCall() is explicitly called.
    });

    vapi.on("message", (msg: any) => {
      // Handle transcript messages
      if (msg.type === "transcript") {
        const role = msg.role === "assistant" ? "agent" : "user";
        const isFinal = msg.transcriptType === "final";
        const text = msg.transcript || "";

        // Skip raw Vapi event payloads that leak through as transcripts
        if (text.startsWith("{") && text.includes('"type"')) return;

        if (isFinal && text.trim()) {
          console.log(`[useVapi] ${role} transcript (final): ${text.substring(0, 80)}`);
          const id = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
          setMessages((prev) => {
            // Remove any partial messages from same role at the end
            const cleaned = [...prev];
            if (cleaned.length > 0 && !cleaned[cleaned.length - 1].isFinal && cleaned[cleaned.length - 1].role === role) {
              cleaned.pop();
            }
            return [...cleaned, { id, role, content: text, isFinal: true }];
          });
        } else if (!isFinal && text.trim()) {
          // Partial transcript - update or add
          setMessages((prev) => {
            const cleaned = [...prev];
            if (cleaned.length > 0 && !cleaned[cleaned.length - 1].isFinal && cleaned[cleaned.length - 1].role === role) {
              cleaned[cleaned.length - 1] = { ...cleaned[cleaned.length - 1], content: text };
              return cleaned;
            }
            const id = `${role}-partial-${Date.now()}`;
            return [...cleaned, { id, role, content: text, isFinal: false }];
          });
        }
      }
    });

    vapi.on("error", (err: any) => {
      console.error("[useVapi] Vapi error:", JSON.stringify(err, null, 2));
      const errorMsg =
        typeof err === "string"
          ? err
          : err?.error?.message || err?.error || err?.message || err?.msg || "Voice agent error";
      setError(typeof errorMsg === "string" ? errorMsg : JSON.stringify(errorMsg));
    });

    (vapi as any).on("call-start-failed", (payload: any) => {
      console.error("[useVapi] call-start-failed:", JSON.stringify(payload, null, 2));
      setError(payload?.error || "Call failed to start");
      setIsCallActive(false);
    });

    (vapi as any).on("call-start-success", (payload: any) => {
      console.log("[useVapi] call-start-success, callId:", payload?.callId);
      if (payload?.callId) {
        setCallId((prev) => {
          if (!prev) {
            // connectSSE will be called from startCall when callId is set
            return payload.callId;
          }
          return prev;
        });
      }
    });

    vapiRef.current = vapi;
    return vapi;
  }, []);

  // Notify the active Vapi call that a flight has been selected
  const notifyFlightSelected = useCallback((offer: FlightOffer) => {
    const vapi = vapiRef.current;
    if (!vapi) return;

    vapi.send({
      type: "add-message",
      message: {
        role: "system",
        content: `The user has selected a flight: ${offer.airline_name}, ${offer.duration_formatted}, ${offer.total_amount} ${offer.total_currency}. Please acknowledge their selection and begin collecting passenger details (phone_number, email, date_of_birth).`,
      },
    });
  }, []);

  // Connect SSE when callId changes
  const connectSSE = useCallback((cId: string) => {
    if (sseRef.current) {
      sseRef.current.close();
    }

    console.log(`[useVapi] Opening SSE to /api/progress/${cId}`);
    const sse = new EventSource(`/api/progress/${cId}`);
    sseRef.current = sse;

    sse.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[useVapi] SSE event:", data.type, "filledFields:", data.filledFields);

        if (data.type === "init" || data.type === "field_update") {
          setFilledFields(data.filledFields);
        }

        if (data.type === "all_fields_collected") {
          console.log("[useVapi] All fields collected!", JSON.stringify(data.travelInfo));
          setFilledFields(TOTAL_FIELDS);
          setTravelInfo(data.travelInfo);
        }

        if (data.type === "flights_ready") {
          console.log("[useVapi] Flights ready:", data.offers?.length, "offers");
          const offers: FlightOffer[] = data.offers || [];
          setFlightOffers(offers);
          flightOffersRef.current = offers;
          setPipelinePhase(2);

          // Store Duffel passenger placeholder ID for booking without re-fetching
          const passengers = data.duffelPassengers || [];
          if (passengers.length > 0) {
            setDuffelPassengerId(passengers[0].id);
            console.log("[useVapi] Duffel passenger ID:", passengers[0].id);
          }

          // Send flight list to the active Vapi call so the agent can help the user choose
          const vapi = vapiRef.current;
          if (vapi && offers.length > 0) {
            const summary = offers.map((o: FlightOffer, i: number) =>
              `${i + 1}. ${o.airline_name} — ${o.duration_formatted}, ${o.stops_count === 0 ? 'nonstop' : o.stops_count + ' stop(s)'}, ${o.total_amount} ${o.total_currency}`
            ).join('\n');
            vapi.send({
              type: "add-message",
              message: {
                role: "system",
                content: `Flights are now available on screen. Here are the options:\n${summary}\n\nHelp the user choose. When they decide, call select_flight with the flight number.`,
              },
            });
          }
        }

        if (data.type === "flights_error") {
          console.error("[useVapi] Flights error:", data.error);
          setError(`Flight search failed: ${data.error}`);
        }

        if (data.type === "flight_selected") {
          console.log("[useVapi] Flight selected:", data.offerId);
          setSelectedOfferId(data.offerId);
          setPipelinePhase(3);
          // Initialize passenger state
          setPassengerInfo({ phone_number: null, email: null, date_of_birth: null });
          setPassengerFieldsFilled(0);
          setMessages([]); // Clear chat for Phase 3
          // Notify the active call about the selection
          const offer = flightOffersRef.current.find(o => o.offer_id === data.offerId);
          if (offer) notifyFlightSelected(offer);
        }

        if (data.type === "passenger_field_update") {
          console.log("[useVapi] Passenger field update:", data.field, "=", data.value);
          setPassengerInfo(data.passengerInfo);
          setPassengerFieldsFilled(data.filledFields);
        }

        if (data.type === "passenger_info_complete") {
          console.log("[useVapi] Passenger info complete!", JSON.stringify(data.passengerInfo));
          setPassengerInfo(data.passengerInfo);
          setIsPassengerInfoComplete(true);
          setPipelinePhase(4);
        }

        if (data.type === "booking_confirmed") {
          console.log("[useVapi] Booking confirmed:", data.booking_reference);
          setBookingConfirmation({ booking_reference: data.booking_reference, order_id: data.order_id });
        }
      } catch (err) {
        console.error("[useVapi] SSE parse error:", err);
      }
    };

    sse.onerror = (err) => {
      console.error("[useVapi] SSE error:", err);
    };
  }, [notifyFlightSelected]);

  // Start call
  const startCall = useCallback(async (imageSessionId?: string) => {
    console.log("[useVapi] startCall() invoked", imageSessionId ? `with imageSessionId: ${imageSessionId}` : "");

    setError(null);
    setMessages([]);
    setTravelInfo(null);
    setFilledFields(0);
    setFlightOffers([]);
    setSelectedOfferId(null);
    setPipelinePhase(1);
    setDuffelPassengerId(null);

    // Ensure we have the public key
    if (!publicKeyRef.current) {
      try {
        const r = await fetch("/config");
        const data = await r.json();
        publicKeyRef.current = data.publicKey;
        console.log("[useVapi] Config fetched, publicKey:", data.publicKey ? "present" : "missing");
      } catch (err) {
        setError("Cannot reach server. Is server.js running on port 3000?");
        return;
      }
    }

    const vapi = getVapi();
    if (!vapi) {
      setError("Failed to initialize voice agent");
      return;
    }

    // Fetch assistant config from server
    try {
      const configUrl = imageSessionId
        ? `/api/assistant-config-from-image?imageSessionId=${encodeURIComponent(imageSessionId)}`
        : "/api/assistant-config";
      console.log("[useVapi] Fetching assistant config from:", configUrl);
      const r = await fetch(configUrl);
      if (!r.ok) {
        const errData = await r.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${r.status}`);
      }
      const config = await r.json();
      console.log("[useVapi] Assistant config loaded, server.url:", config.server?.url);

      // Start the call with inline config
      console.log("[useVapi] Starting Vapi call...");
      const call = await vapi.start(config);
      console.log("[useVapi] Vapi call started, call object:", call);

      // Extract callId — Vapi returns it in the call object
      const cId = call?.id || (call as any)?.callId;
      if (cId) {
        console.log("[useVapi] Call ID:", cId);
        setCallId(cId);
        connectSSE(cId);
      } else {
        console.warn("[useVapi] No callId in response, will try to get it from events");
        // Some Vapi versions emit callId via events
        const handler = (msg: any) => {
          if (msg?.call?.id) {
            const id = msg.call.id;
            console.log("[useVapi] Got callId from event:", id);
            setCallId(id);
            connectSSE(id);
            vapi.off?.("message", handler);
          }
        };
        vapi.on("message", handler);
      }
    } catch (err: any) {
      console.error("[useVapi] Failed to start call:", err);
      setError(err.message || "Failed to start voice call");
    }
  }, [getVapi, connectSSE]);

  // End call
  const endCall = useCallback(() => {
    console.log("[useVapi] endCall() invoked");
    vapiRef.current?.stop();
    setIsCallActive(false);
    setIsListening(false);
    setIsProcessing(false);
    if (sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  }, []);

  // Send text message
  const sendText = useCallback((text: string) => {
    if (!text.trim()) return;
    console.log("[useVapi] sendText:", text.substring(0, 50));

    // Add as user message in chat
    const id = `user-text-${Date.now()}`;
    setMessages((prev) => [...prev, { id, role: "user", content: text, isFinal: true }]);

    // Send via Vapi SDK
    vapiRef.current?.send({
      type: "add-message",
      message: {
        role: "user",
        content: text,
      },
    });
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      console.log("[useVapi] Unmounting — cleaning up");
      vapiRef.current?.stop();
      sseRef.current?.close();
    };
  }, []);

  return {
    startCall,
    endCall,
    sendText,
    notifyFlightSelected,
    isCallActive,
    isListening,
    isProcessing,
    messages,
    callId,
    travelInfo,
    filledFields,
    error,
    flightOffers,
    selectedOfferId,
    pipelinePhase,
    passengerInfo,
    passengerFieldsFilled,
    isPassengerInfoComplete,
    bookingConfirmation,
    duffelPassengerId,
  };
}
