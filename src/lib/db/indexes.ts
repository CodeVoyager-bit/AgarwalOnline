import mongoose from "mongoose";
import { log } from "../logger";

/**
 * Every file that defines models, so all of them are known wherever the indexes are built: a page
 * only loads the models it uses. tests/db-indexes.test.ts fails when a new file is missing here.
 */
const MODEL_FILES = [
  () => import("./models"),
  () => import("../aftercare/models"),
  () => import("../chat/models"),
  () => import("../commerce/models"),
  () => import("../engagement/models"),
  () => import("../evidence/models"),
  () => import("../family/models"),
  () => import("../feedback/models"),
  () => import("../governance/models"),
  () => import("../lists/models"),
  () => import("../operations/models"),
  () => import("../payments/models"),
  () => import("../promotions/models"),
  () => import("../providers/models"),
  () => import("../push/models"),
  () => import("../reviews/models"),
  () => import("../schools/models"),
];

/**
 * What Mongoose does for each model at server start, done on request instead: makes the collection
 * and every index its schema declares. An index that exists costs one short command. Returns the
 * models that failed (a new unique index over rows that already repeat, say), already logged.
 */
export async function buildIndexes() {
  await Promise.all(MODEL_FILES.map((load) => load()));
  const failed: string[] = [];
  // one model at a time: the free cluster allows 100 commands a second and shoppers are using it meanwhile
  for (const model of Object.values(mongoose.models))
    try {
      await model.createCollection();
      await model.createIndexes();
    } catch (error) {
      failed.push(model.modelName);
      log("warn", "db.index-failed", { model: model.modelName, error });
    }
  return failed;
}
