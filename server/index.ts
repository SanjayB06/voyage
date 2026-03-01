import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { expand } from "dotenv-expand";
import createPaymentIntent from "./routes/createPaymentIntent.js";
import placeDuffelOrder from "./routes/placeDuffelOrder.js";
import confirmPaymentTest from "./routes/confirmPaymentTest.js";
import searchFlights from "./routes/searchFlights.js";

expand(dotenv.config());

const app = express();
const PORT = Number(process.env.PORT ?? 3001);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  cors({
    origin: ["http://localhost:5173", "http://localhost:8080"],
    methods: ["GET", "POST", "OPTIONS"],
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/create-payment-intent", createPaymentIntent);
app.use("/api/place-duffel-order", placeDuffelOrder);
app.use("/api/confirm-payment-test", confirmPaymentTest);
app.use("/api/search-flights", searchFlights);

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
