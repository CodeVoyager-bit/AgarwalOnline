import mongoose from "mongoose";
import { publishScheduled } from "../src/lib/governance/service";
console.log(JSON.stringify({ published: await publishScheduled() }));
await mongoose.disconnect();
