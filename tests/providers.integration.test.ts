import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { connectDB } from "../src/lib/db/connect";
import { AuditLog, Category, InventoryItem, Product, ProductVariant, User } from "../src/lib/db/models";
import { ApprovalHistory, ApprovalRequest } from "../src/lib/governance/models";
import { Notification } from "../src/lib/engagement/models";
import { reviewApproval, submitProduct } from "../src/lib/governance/service";
import { updateProductMetadata } from "../src/lib/catalog/manage";
import { catalog } from "../src/lib/catalog/queries";
import { Provider } from "../src/lib/providers/models";
import { decideProvider, saveProvider, updateProvider } from "../src/lib/providers/service";

const uri = process.env.TEST_MONGODB_URI;
describe.skipIf(!uri)("Providers: other shops' items, sold by us", () => {
  let staff: string, owner: string, categoryId: string;
  beforeAll(async () => {
    if (!uri?.includes("/ags_test")) throw Error("Isolated DB required");
    Object.assign(process.env, { MONGODB_URI: uri, APP_ORIGIN: "http://127.0.0.1:3000", AUTH_SECRET: "test-secret-".repeat(4) });
    await connectDB();
    for (const model of [User, Category, Product, ProductVariant, InventoryItem, ApprovalRequest, ApprovalHistory, Provider, AuditLog])
      await model.init();
  });
  beforeEach(async () => {
    for (const model of Object.values(mongoose.models)) await model.deleteMany({});
    staff = String((await User.create({ name: "Ravi", phone: "9000000071", roles: ["customer", "admin"] }))._id);
    owner = String((await User.create({ name: "Owner", phone: "9000000072", roles: ["customer", "super-admin"] }))._id);
    categoryId = String((await Category.create({ slug: "gifts", name: { en: "Gifts", mr: "भेटवस्तू" } }))._id);
  });
  afterAll(async () => {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  });
  const product = (extra: Record<string, unknown> = {}) => ({
    slug: "gift-hamper",
    nameEn: "Gift hamper",
    nameMr: "भेट हॅम्पर",
    descriptionEn: "A small gift hamper",
    descriptionMr: "छोटा भेट हॅम्पर",
    brand: "",
    categoryId,
    aliases: "",
    sku: "GIFT-HAMPER",
    label: "1 box",
    unit: "piece",
    packQuantity: 1,
    pricePaise: 44900,
    mrpPaise: 49900,
    stock: 5,
    ...extra,
  });
  const approveProduct = async () =>
    reviewApproval(owner, {
      requestId: String((await ApprovalRequest.findOne({ kind: "product" }))._id),
      decision: "approved",
      comment: "Checked",
    });

  it("keeps a provider staff add waiting for an owner, who is told; an owner's is live at once", async () => {
    const added = await saveProvider(staff, { name: "Sharma Stationers", town: "Roha", phone: "9876543210" });
    expect(added).toMatchObject({ status: "pending", created: true });
    expect(await Notification.countDocuments({ userId: owner, title: /New provider to approve: Sharma Stationers, Roha/ })).toBe(1);
    expect((await Provider.findById(added.id)).slug).toBe("sharma-stationers-roha");
    expect(await saveProvider(owner, { name: "Patil Gifts", town: "Pen" })).toMatchObject({ status: "active", created: true });
    // the same shop typed again, in other capitals, is found instead of added twice
    expect(await saveProvider(owner, { name: "sharma stationers", town: "ROHA" })).toEqual({ id: added.id, status: "pending", created: false });
    expect(await Provider.countDocuments()).toBe(2);
    await expect(saveProvider(staff, { name: "S", town: "Roha" })).rejects.toThrow("Give the provider's shop name.");
  });

  it("declines with a reason and tells whoever added it; asking again sends it back", async () => {
    const { id } = await saveProvider(staff, { name: "Gupta Party Store", town: "Nagothane" });
    await expect(decideProvider(staff, { providerId: id, decision: "approve" })).rejects.toThrow("FORBIDDEN");
    await expect(decideProvider(owner, { providerId: id, decision: "decline", reason: "no" })).rejects.toThrow(
      "A reason for declining is required.",
    );
    await decideProvider(owner, { providerId: id, decision: "decline", reason: "We don't stock party goods" });
    expect(await Provider.findById(id)).toMatchObject({ status: "declined", declineReason: "We don't stock party goods" });
    expect(await Notification.countDocuments({ userId: staff, title: /was not approved/ })).toBe(1);
    await expect(decideProvider(owner, { providerId: id, decision: "approve" })).rejects.toThrow("already been decided");
    expect(await saveProvider(staff, { name: "Gupta Party Store", town: "Nagothane" })).toEqual({ id, status: "pending", created: true });
    expect(await AuditLog.countDocuments({ action: /^provider\./ })).toBe(3);
  });

  it("lets staff fix details but only an owner rename a live provider", async () => {
    const { id } = await saveProvider(owner, { name: "Patil Gifts", town: "Pen" });
    await updateProvider(staff, { providerId: id, name: "Patil Gifts", town: "Pen", phone: "9123456780", notes: "Settle monthly" });
    expect(await Provider.findById(id)).toMatchObject({ phone: "9123456780", notes: "Settle monthly" });
    await expect(updateProvider(staff, { providerId: id, name: "Patil Gift House", town: "Pen" })).rejects.toThrow(
      "Only an owner can rename",
    );
    await updateProvider(owner, { providerId: id, name: "Patil Gift House", town: "Pen" });
    expect((await Provider.findById(id)).name).toBe("Patil Gift House");
  });

  it("publishes a staff product with a new provider only once the provider is approved, then shows it", async () => {
    await submitProduct(staff, product({ providerId: "new", newProviderName: "Kale Toys", newProviderTown: "Pali" }));
    const provider = await Provider.findOne({ name: "Kale Toys" });
    expect(provider.status).toBe("pending");
    expect((await ApprovalRequest.findOne({ kind: "product" })).after.providerId).toBe(String(provider._id));
    // never live looking like our own while the provider waits
    await expect(approveProduct()).rejects.toThrow("Approve the provider Kale Toys first");
    expect(await Product.countDocuments()).toBe(0);
    await decideProvider(owner, { providerId: String(provider._id), decision: "approve" });
    await approveProduct();
    const live = await Product.findOne({ slug: "gift-hamper" });
    expect(String(live.providerId)).toBe(String(provider._id));
    const [card] = await catalog({});
    expect(card.provider).toEqual({ name: "Kale Toys", town: "Pali" });
  });

  it("puts an owner's product with a new provider live at once, and lets the provider be changed or cleared", async () => {
    await submitProduct(owner, product({ providerId: "new", newProviderName: "Patil Gifts", newProviderTown: "Pen" }));
    const live = await Product.findOne({ slug: "gift-hamper" });
    expect((await catalog({}))[0].provider).toEqual({ name: "Patil Gifts", town: "Pen" });
    const edit = (providerId: string, extra: Record<string, unknown> = {}) =>
      updateProductMetadata(staff, {
        productId: String(live._id),
        nameEn: "Gift hamper",
        nameMr: "भेट हॅम्पर",
        descriptionEn: "A small gift hamper",
        descriptionMr: "छोटा भेट हॅम्पर",
        brand: "",
        categoryId,
        aliases: "",
        featured: false,
        bestseller: false,
        providerId,
        ...extra,
      });
    // a provider staff add on the edit form waits, and isn't shown to shoppers until approved
    await edit("new", { newProviderName: "Sharma Stationers", newProviderTown: "Roha" });
    expect((await catalog({}))[0].provider).toBeUndefined();
    // back to our own stock
    await edit("");
    expect((await Product.findById(live._id)).providerId).toBeUndefined();
    // an edit that sends no choice leaves the provider alone
    await Product.updateOne({ _id: live._id }, { $set: { providerId: (await Provider.findOne({ name: "Patil Gifts" }))._id } });
    await updateProductMetadata(staff, {
      productId: String(live._id),
      nameEn: "Gift hamper",
      nameMr: "भेट हॅम्पर",
      descriptionEn: "A small gift hamper",
      descriptionMr: "छोटा भेट हॅम्पर",
      brand: "",
      categoryId,
      aliases: "",
      featured: false,
      bestseller: false,
    });
    expect((await catalog({}))[0].provider).toEqual({ name: "Patil Gifts", town: "Pen" });
  });

  it("refuses a declined provider on a product", async () => {
    const { id } = await saveProvider(staff, { name: "Gupta Party Store", town: "Nagothane" });
    await decideProvider(owner, { providerId: id, decision: "decline", reason: "Not a fit for us" });
    await expect(submitProduct(staff, product({ providerId: id }))).rejects.toThrow("was declined");
    expect(await ApprovalRequest.countDocuments()).toBe(0);
  });
});
