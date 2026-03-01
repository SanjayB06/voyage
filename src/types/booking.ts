export interface BookingContext {
  type: "flight" | "hotel";
  item: string;        // display name (airline or hotel)
  offerId?: string;    // Duffel offer_id — required for flight payment
  amount?: string;     // display price — filled in by payment integration
  currency?: string;
}
