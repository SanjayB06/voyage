import { useState } from "react";
import { motion } from "framer-motion";
import { Check, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import type { FlightOffer } from "@/services/flightService";

const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "");

interface PassengerDetailsPanelProps {
  callId: string;
  passengerInfo: Record<string, string | null> | null;
  isPassengerInfoComplete: boolean;
  travelInfo: Record<string, string | null> | null;
  selectedOfferId: string | null;
  selectedFlightOffer?: FlightOffer | null;
  duffelPassengerId?: string | null;
  onBookingConfirmed?: (ref: string, orderId: string) => void;
}

interface InlineCardFormProps {
  offerId: string;
  callId: string;
  passenger: { name: string; email: string; phone: string; dob: string; gender: string };
  useTestCard: boolean;
  cachedAmount?: string;
  cachedCurrency?: string;
  duffelPassengerId?: string | null;
  onSuccess: (ref: string, orderId: string) => void;
  onError: (msg: string) => void;
}

const InlineCardForm = ({ offerId, callId, passenger, useTestCard, cachedAmount, cachedCurrency, duffelPassengerId, onSuccess, onError }: InlineCardFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  const handleSubmit = async () => {
    setStatus("loading");
    try {
      // Step 1: Create PaymentIntent (pass cached price to avoid Duffel re-fetch)
      const piRes = await fetch("/api/create-payment-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offer_id: offerId,
          cached_amount: cachedAmount,
          cached_currency: cachedCurrency,
        }),
      });
      if (!piRes.ok) {
        const errData = await piRes.json().catch(() => ({}));
        throw new Error(
          errData.error === "offer_expired"
            ? "Flight offer has expired. Please search for flights again."
            : errData.error || "Failed to create payment intent"
        );
      }
      const piData = await piRes.json();

      let paymentIntentId: string;

      if (useTestCard) {
        const confirmRes = await fetch("/api/confirm-payment-test", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_intent_id: piData.payment_intent_id }),
        });
        if (!confirmRes.ok) throw new Error("Payment confirmation failed");
        paymentIntentId = piData.payment_intent_id;
      } else {
        if (!stripe || !elements) throw new Error("Stripe not loaded");
        const cardElement = elements.getElement(CardElement);
        if (!cardElement) throw new Error("Card element not found");

        const { error, paymentIntent } = await stripe.confirmCardPayment(piData.client_secret, {
          payment_method: { card: cardElement },
        });
        if (error) throw new Error(error.message ?? "Payment failed");
        if (paymentIntent?.status !== "succeeded") throw new Error("Payment did not succeed");
        paymentIntentId = paymentIntent.id;
      }

      // Step 2: Place Duffel order (pass cached data to avoid Duffel re-fetch / 423)
      const orderRes = await fetch("/api/place-duffel-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          offer_id: offerId,
          payment_intent_id: paymentIntentId,
          callId,
          cached_amount: cachedAmount,
          cached_currency: cachedCurrency,
          cached_passenger_id: duffelPassengerId,
          passenger: {
            name: passenger.name,
            email: passenger.email,
            phone: passenger.phone,
            dob: passenger.dob,
            gender: passenger.gender,
          },
        }),
      });
      if (!orderRes.ok) {
        const errData = await orderRes.json().catch(() => ({}));
        throw new Error(
          errData.error === "offer_expired"
            ? "Flight offer has expired. Please search for flights again."
            : errData.error || "Failed to place order"
        );
      }
      const orderData = await orderRes.json();

      onSuccess(orderData.booking_reference, orderData.order_id || orderData.booking_reference);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <Button
      onClick={handleSubmit}
      disabled={status === "loading" || (!useTestCard && !stripe)}
      className="w-full rounded-xl bg-gradient-to-r from-primary to-sunset-warm text-background hover:opacity-90"
    >
      {status === "loading" ? (
        <span className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          Booking...
        </span>
      ) : (
        "Confirm & Pay"
      )}
    </Button>
  );
};

export const PassengerDetailsPanel = ({
  callId,
  passengerInfo,
  isPassengerInfoComplete,
  travelInfo,
  selectedOfferId,
  selectedFlightOffer,
  duffelPassengerId,
  onBookingConfirmed,
}: PassengerDetailsPanelProps) => {
  const [gender, setGender] = useState<string>("m");
  const [useTestCard, setUseTestCard] = useState(false);
  const [bookingRef, setBookingRef] = useState<string | null>(null);
  const [orderId, setOrderId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Local state for in-progress typing. Only used while the field is focused.
  const [localPhone, setLocalPhone] = useState<string>("");
  const [localEmail, setLocalEmail] = useState<string>("");
  const [localDob, setLocalDob] = useState<string>("");
  const [focusedField, setFocusedField] = useState<string | null>(null);

  // passengerInfo from SSE is the source of truth; local state only used for the actively-focused field
  const phone = focusedField === "phone_number" ? localPhone : (passengerInfo?.phone_number || localPhone);
  const email = focusedField === "email" ? localEmail : (passengerInfo?.email || localEmail);
  const dob = focusedField === "date_of_birth" ? localDob : (passengerInfo?.date_of_birth || localDob);

  const passengerName = travelInfo
    ? `${travelInfo.first_name || ""} ${travelInfo.last_name || ""}`.trim()
    : "";

  const handleFieldFocus = (field: string) => {
    setFocusedField(field);
    // Initialize local state from current displayed value so editing is seamless
    if (field === "phone_number") setLocalPhone(passengerInfo?.phone_number || localPhone);
    if (field === "email") setLocalEmail(passengerInfo?.email || localEmail);
    if (field === "date_of_birth") setLocalDob(passengerInfo?.date_of_birth || localDob);
  };

  const handleFieldBlur = (field: string, value: string) => {
    setFocusedField(null);
    if (!value.trim()) return;
    fetch("/api/passenger-field", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callId, field, value }),
    }).catch((err) => console.error("Failed to sync passenger field:", err));
  };

  const handleSuccess = (ref: string, oid: string) => {
    setBookingRef(ref);
    setOrderId(oid);
    onBookingConfirmed?.(ref, oid);
  };

  const handleError = (msg: string) => {
    setErrorMessage(msg);
  };

  const showPayment = isPassengerInfoComplete && gender;

  // Confirmation view
  if (bookingRef) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 space-y-4"
      >
        <div className="text-center">
          <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-500/20 flex items-center justify-center">
            <Check size={32} className="text-green-500" />
          </div>
          <h3 className="font-display text-lg font-semibold text-foreground mb-1">
            Booking Confirmed!
          </h3>
          <p className="text-sm text-muted-foreground">Your flight has been booked successfully.</p>
        </div>
        <div className="p-4 rounded-xl bg-muted/30 border border-border/30 text-center">
          <p className="text-xs text-muted-foreground mb-1">Booking Reference</p>
          <p className="text-xl font-bold text-gradient-primary">{bookingRef}</p>
          {orderId && orderId !== bookingRef && (
            <>
              <p className="text-xs text-muted-foreground mt-2 mb-1">Order ID</p>
              <p className="text-sm font-medium text-foreground">{orderId}</p>
            </>
          )}
        </div>
      </motion.div>
    );
  }

  return (
    <div className="p-4 space-y-4">
      {/* Passenger fields */}
      <div className="space-y-3">
        <h4 className="text-sm font-medium text-foreground">Passenger Details</h4>
        <p className="text-xs text-muted-foreground">
          Fill in below or let the voice agent collect these for you.
        </p>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Phone Number</label>
          <input
            type="tel"
            placeholder="+1 312 555 0000"
            value={phone}
            onFocus={() => handleFieldFocus("phone_number")}
            onChange={(e) => setLocalPhone(e.target.value)}
            onBlur={(e) => handleFieldBlur("phone_number", e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Email</label>
          <input
            type="email"
            placeholder="traveler@example.com"
            value={email}
            onFocus={() => handleFieldFocus("email")}
            onChange={(e) => setLocalEmail(e.target.value)}
            onBlur={(e) => handleFieldBlur("email", e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Date of Birth</label>
          <input
            type="date"
            value={dob}
            onFocus={() => handleFieldFocus("date_of_birth")}
            onChange={(e) => {
              setLocalDob(e.target.value);
              handleFieldBlur("date_of_birth", e.target.value);
            }}
            onBlur={() => setFocusedField(null)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Gender</label>
          <select
            value={gender}
            onChange={(e) => setGender(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
          >
            <option value="m">Male</option>
            <option value="f">Female</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>

      {/* Price summary */}
      {selectedFlightOffer && (
        <div className="p-3 rounded-xl bg-primary/5 border border-primary/20">
          <div className="flex justify-between items-center">
            <span className="text-sm text-muted-foreground">
              {selectedFlightOffer.airline_name} &middot; {selectedFlightOffer.duration_formatted}
            </span>
            <span className="font-bold text-foreground">
              {new Intl.NumberFormat("en-US", {
                style: "currency",
                currency: selectedFlightOffer.total_currency,
              }).format(parseFloat(selectedFlightOffer.total_amount))}
            </span>
          </div>
        </div>
      )}

      {/* Payment section */}
      {showPayment && selectedOfferId ? (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="space-y-3"
        >
          <h4 className="text-sm font-medium text-foreground">Payment</h4>

          {errorMessage && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-center">
              <p className="text-sm text-destructive">{errorMessage}</p>
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={useTestCard}
              onChange={(e) => setUseTestCard(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm text-muted-foreground">Use test card (auto)</span>
          </label>

          <Elements stripe={stripePromise}>
            {!useTestCard && (
              <div className="p-3 rounded-xl bg-background border border-border/50 mb-3">
                <CardElement
                  options={{
                    disableLink: true,
                    style: {
                      base: {
                        fontSize: "15px",
                        color: "var(--foreground)",
                        "::placeholder": { color: "var(--muted-foreground)" },
                      },
                    },
                  }}
                />
              </div>
            )}
            <InlineCardForm
              offerId={selectedOfferId}
              callId={callId}
              passenger={{
                name: passengerName,
                email: email || "",
                phone: phone || "",
                dob: dob || "",
                gender,
              }}
              useTestCard={useTestCard}
              cachedAmount={selectedFlightOffer?.total_amount}
              cachedCurrency={selectedFlightOffer?.total_currency}
              duffelPassengerId={duffelPassengerId}
              onSuccess={handleSuccess}
              onError={handleError}
            />
          </Elements>
        </motion.div>
      ) : !isPassengerInfoComplete ? (
        <div className="p-3 rounded-xl bg-muted/30 border border-border/50 text-center">
          <p className="text-xs text-muted-foreground">
            Complete all passenger details above (or via voice) to proceed to payment.
          </p>
        </div>
      ) : null}
    </div>
  );
};
