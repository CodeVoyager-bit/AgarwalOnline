import mongoose from "mongoose";
import { runRetention } from "../src/lib/retention";
await runRetention();
await mongoose.disconnect();
