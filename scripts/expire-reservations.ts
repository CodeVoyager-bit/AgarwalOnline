import mongoose from "mongoose";
import { expireReservations } from "../src/lib/payments/service";
console.log(JSON.stringify({ released: await expireReservations() }));
await mongoose.disconnect();
