import { useState } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { X, Check, Loader2 } from "lucide-react";
import { Button } from "../ui/button";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";
import { bookHotel } from "@/services/hotelService";

const API_BASE = import.meta.env.VITE_API_URL ?? '';
const stripePromise = loadStripe(import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY ?? "");

interface BookingModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingType: string;
  bookingItem: string;
  offerId?: string;
  passengerName?: string;
  passengerEmail?: string;
  onBookingSuccess?: (ref: string) => void;
}

interface PassengerInfo {
  dob: string;
  gender: "m" | "f" | "other";
  phone: string;
  name?: string;
  email?: string;
}

interface CardFormProps {
  offerId: string;
  useTestCard: boolean;
  passenger: PassengerInfo;
  onSuccess: (ref: string) => void;
  onError: (msg: string) => void;
}

const CardForm = ({ offerId, useTestCard, passenger, onSuccess, onError }: CardFormProps) => {
  const stripe = useStripe();
  const elements = useElements();
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  const handleSubmit = async () => {
    setStatus("loading");

    try {
      // Step 1: Create PaymentIntent
      const piRes = await fetch(`${API_BASE}/api/create-payment-intent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer_id: offerId }),
      });
      if (!piRes.ok) throw new Error("Failed to create payment intent");
      const piData = await piRes.json();

      let paymentIntentId: string;

      if (useTestCard) {
        // Use backend test card confirmation (pm_card_visa)
        const confirmRes = await fetch(`${API_BASE}/api/confirm-payment-test`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ payment_intent_id: piData.payment_intent_id }),
        });
        if (!confirmRes.ok) throw new Error("Payment confirmation failed");
        paymentIntentId = piData.payment_intent_id;
      } else {
        // Use Stripe Elements card entered by user
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

      // Step 3: Place Duffel order
      const orderRes = await fetch(`${API_BASE}/api/place-duffel-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offer_id: offerId, payment_intent_id: paymentIntentId, passenger }),
      });
      if (!orderRes.ok) throw new Error("Failed to place order");
      const orderData = await orderRes.json();

      onSuccess(orderData.booking_reference);
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
      className="flex-1 rounded-xl bg-gradient-to-r from-primary to-sunset-warm text-background hover:opacity-90"
    >
      {status === "loading" ? (
        <span className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          Booking...
        </span>
      ) : "Confirm & Pay"}
    </Button>
  );
};

interface HotelBookFormProps {
  offerId: string;
  passenger: PassengerInfo;
  onSuccess: (ref: string) => void;
  onError: (msg: string) => void;
}

const HotelBookForm = ({ offerId, passenger, onSuccess, onError }: HotelBookFormProps) => {
  const [status, setStatus] = useState<"idle" | "loading">("idle");

  const handleBook = async () => {
    setStatus("loading");
    try {
      const result = await bookHotel({ offer_id: offerId, passenger });
      onSuccess(result.booking_reference);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setStatus("idle");
    }
  };

  return (
    <Button
      onClick={handleBook}
      disabled={status === "loading"}
      className="flex-1 rounded-xl bg-gradient-to-r from-primary to-sunset-warm text-background hover:opacity-90"
    >
      {status === "loading" ? (
        <span className="flex items-center gap-2">
          <Loader2 size={16} className="animate-spin" />
          Booking...
        </span>
      ) : "Confirm Hotel"}
    </Button>
  );
};

export const BookingModal = ({ isOpen, onClose, bookingType, bookingItem, offerId, passengerName, passengerEmail, onBookingSuccess }: BookingModalProps) => {
  const [bookingStatus, setBookingStatus] = useState<"idle" | "success" | "error">("idle");
  const [bookingReference, setBookingReference] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [useTestCard, setUseTestCard] = useState(false);
  const [passenger, setPassenger] = useState<PassengerInfo>({ dob: "", gender: "m", phone: "", name: passengerName, email: passengerEmail });

  const handleSuccess = (ref: string) => {
    setBookingReference(ref);
    setBookingStatus("success");
    onBookingSuccess?.(ref);
  };

  const handleError = (msg: string) => {
    setErrorMessage(msg);
    setBookingStatus("error");
  };

  const handleClose = () => {
    setBookingStatus("idle");
    setBookingReference(null);
    setErrorMessage(null);
    setUseTestCard(false);
    setPassenger({ dob: "", gender: "m", phone: "", name: passengerName, email: passengerEmail });
    onClose();
  };

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
          />

          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <motion.div
            className="w-full max-w-md p-6 pointer-events-auto"
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
          >
            <div className="glass-card p-6 relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-40 h-40 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute -bottom-20 -left-20 w-40 h-40 rounded-full bg-sunset-warm/10 blur-3xl" />

              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 rounded-full hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors"
              >
                <X size={18} />
              </button>

              <div className="relative z-10">
                {/* Icon */}
                <motion.div
                  className="w-16 h-16 mx-auto mb-6 rounded-full bg-gradient-to-br from-primary/20 to-sunset-warm/20 flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                >
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                  >
                    <Check size={32} className="text-primary" />
                  </motion.div>
                </motion.div>

                {bookingStatus === "success" ? (
                  <>
                    <h3 className="font-display text-xl font-semibold text-center text-foreground mb-2">
                      Booking Confirmed!
                    </h3>
                    <p className="text-center text-muted-foreground mb-4">
                      Your flight has been booked successfully.
                    </p>
                    <div className="p-4 rounded-xl bg-muted/30 border border-border/30 mb-6 text-center">
                      <p className="text-xs text-muted-foreground mb-1">Booking Reference</p>
                      <p className="text-2xl font-bold text-gradient-primary">{bookingReference}</p>
                    </div>
                    <Button onClick={handleClose} className="w-full rounded-xl bg-gradient-to-r from-primary to-sunset-warm text-background">
                      Done
                    </Button>
                  </>
                ) : (
                  <>
                    <h3 className="font-display text-xl font-semibold text-center text-foreground mb-2">
                      Ready to Book
                    </h3>
                    <p className="text-center text-muted-foreground mb-4">
                      You're about to book{" "}
                      <span className="text-foreground font-medium">{bookingItem}</span>
                      {" "}({bookingType}).
                    </p>

                    {bookingStatus === "error" && (
                      <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 mb-4 text-center">
                        <p className="text-sm text-destructive">{errorMessage}</p>
                      </div>
                    )}

                    {/* Passenger info */}
                    <div className="space-y-2 mb-4">
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Date of Birth</label>
                        <input
                          type="date"
                          value={passenger.dob}
                          onChange={(e) => setPassenger(p => ({ ...p, dob: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Gender</label>
                        <select
                          value={passenger.gender}
                          onChange={(e) => setPassenger(p => ({ ...p, gender: e.target.value as PassengerInfo["gender"] }))}
                          className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                          <option value="m">Male</option>
                          <option value="f">Female</option>
                          <option value="other">Other</option>
                        </select>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground mb-1 block">Phone Number</label>
                        <input
                          type="tel"
                          placeholder="+1 312 555 0000"
                          value={passenger.phone}
                          onChange={(e) => setPassenger(p => ({ ...p, phone: e.target.value }))}
                          className="w-full px-3 py-2 rounded-xl bg-background border border-border/50 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                        />
                      </div>
                    </div>

                    {/* Hotel booking — no Stripe needed */}
                    {bookingType === "hotel" ? (
                      <div className="flex gap-3">
                        <Button
                          variant="outline"
                          onClick={handleClose}
                          className="flex-1 rounded-xl border-border/50 hover:bg-muted/50"
                        >
                          Cancel
                        </Button>
                        <HotelBookForm
                          offerId={offerId ?? ""}
                          passenger={passenger}
                          onSuccess={handleSuccess}
                          onError={handleError}
                        />
                      </div>
                    ) : (
                      <>
                        {/* Test card toggle */}
                        <label className="flex items-center gap-2 mb-4 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={useTestCard}
                            onChange={(e) => setUseTestCard(e.target.checked)}
                            className="rounded"
                          />
                          <span className="text-sm text-muted-foreground">Use test card (auto)</span>
                        </label>

                        {/* Stripe Elements card form */}
                        {!useTestCard && (
                          <Elements stripe={stripePromise}>
                            <div className="p-3 rounded-xl bg-background border border-border/50 mb-4">
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
                            <div className="flex gap-3">
                              <Button
                                variant="outline"
                                onClick={handleClose}
                                className="flex-1 rounded-xl border-border/50 hover:bg-muted/50"
                              >
                                Cancel
                              </Button>
                              <CardForm
                                offerId={offerId ?? ""}
                                useTestCard={false}
                                passenger={passenger}
                                onSuccess={handleSuccess}
                                onError={handleError}
                              />
                            </div>
                          </Elements>
                        )}

                        {useTestCard && (
                          <Elements stripe={stripePromise}>
                            <div className="flex gap-3">
                              <Button
                                variant="outline"
                                onClick={handleClose}
                                className="flex-1 rounded-xl border-border/50 hover:bg-muted/50"
                              >
                                Cancel
                              </Button>
                              <CardForm
                                offerId={offerId ?? ""}
                                useTestCard={true}
                                passenger={passenger}
                                onSuccess={handleSuccess}
                                onError={handleError}
                              />
                            </div>
                          </Elements>
                        )}
                      </>
                    )}
                  </>
                )}
              </div>
            </div>
          </motion.div>
          </div>{/* end flex centering wrapper */}
        </>
      )}
    </AnimatePresence>,
    document.body
  );
};
