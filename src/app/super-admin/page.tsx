import Link from "next/link";
import { requirePage } from "@/lib/auth/session";
import { AuditLog, ServiceArea, SearchSynonym, User } from "@/lib/db/models";
import { DeliverySlot, SystemSetting } from "@/lib/commerce/models";
import { ApprovalRequest } from "@/lib/governance/models";
import { Complaint } from "@/lib/aftercare/models";
import { deliveryRules } from "@/lib/commerce/service";
import { paymentsEnabled } from "@/lib/payments/provider";
import { ActionForm } from "@/components/action-form";
import {
  serviceAreaAction,
  slotAction,
  rulesAction,
  synonymAction,
  stockThresholdAction,
} from "@/lib/admin/actions";
import {
  Activity,
  ArrowUpRight,
  ShieldCheck,
  UserCog,
  IndianRupee,
  ChartNoAxesCombined,
  Sparkles,
} from "lucide-react";
export default async function SuperAdmin() {
  const user = await requirePage("settings:write");
  const [
    areas,
    rules,
    slots,
    synonyms,
    staffCount,
    pendingApprovals,
    openComplaints,
    auditToday,
    stockThreshold,
  ] = await Promise.all([
    ServiceArea.find({}),
    deliveryRules(),
    DeliverySlot.find({}).sort({ date: 1 }).limit(50),
    SearchSynonym.find({}).limit(100),
    User.countDocuments({
      role: { $in: ["delivery", "admin", "super-admin"] },
      active: true,
    }),
    ApprovalRequest.countDocuments({ state: "pending" }),
    Complaint.countDocuments({ status: { $in: ["open", "reviewing"] } }),
    AuditLog.countDocuments({}),
    SystemSetting.findOne({ key: "large-stock-threshold" }).select("value"),
  ]);
  return (
    <section className="page-container">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">STORE GOVERNANCE</span>
          <h1>Good morning, {user.name}</h1>
          <p>Control access, review changes and tune store operations.</p>
        </div>
        <span className="live-chip">
          <i /> Systems ready
        </span>
      </div>
      <div className="governance-stats">
        <Link href="/super-admin/staff">
          <span>{staffCount}</span>
          <small>Active staff</small>
        </Link>
        <Link href="/super-admin/approvals">
          <span>{pendingApprovals}</span>
          <small>Pending approvals</small>
        </Link>
        <Link href="/admin/complaints">
          <span>{openComplaints}</span>
          <small>Open complaints</small>
        </Link>
        <Link href="/super-admin/audit">
          <span>{auditToday}</span>
          <small>Audit records</small>
        </Link>
      </div>
      <nav
        className="workspace-actions"
        aria-label="Governance workspaces"
      >
        <Link href="/admin/analytics">
          <ChartNoAxesCombined size={21} />
          <span>
            <strong>Analytics</strong>
            <small>Revenue and operations</small>
          </span>
          <ArrowUpRight size={17} />
        </Link>
        <Link href="/super-admin/refunds">
          <IndianRupee size={21} />
          <span>
            <strong>Refunds</strong>
            <small>Money returned to customers</small>
          </span>
          <ArrowUpRight size={17} />
        </Link>
        <Link href="/super-admin/promotions">
          <Sparkles size={21} />
          <span><strong>Promotions</strong><small>Coupons and automatic offers</small></span>
          <ArrowUpRight size={17} />
        </Link>
        <Link href="/super-admin/staff">
          <UserCog size={21} />
          <span>
            <strong>Staff & roles</strong>
            <small>Accounts and access</small>
          </span>
          <ArrowUpRight size={17} />
        </Link>
        <Link href="/super-admin/approvals">
          <ShieldCheck size={21} />
          <span>
            <strong>Approvals</strong>
            <small>Products, prices and stock</small>
          </span>
          <ArrowUpRight size={17} />
        </Link>
        <Link href="/super-admin/audit">
          <Activity size={21} />
          <span>
            <strong>Audit trail</strong>
            <small>Review sensitive actions</small>
          </span>
          <ArrowUpRight size={17} />
        </Link>
      </nav>
        <div className="panel integration-status">
          <span className="eyebrow">INTEGRATIONS</span>
          <h2>Provider readiness</h2>
          <p>
            <span
              className={`staff-state ${paymentsEnabled() ? "active" : "inactive"}`}
            >
              Razorpay {paymentsEnabled() ? "configured" : "test adapter only"}
            </span>
          </p>
          <p>
            <span
              className={`staff-state ${process.env.CLOUDINARY_CLOUD_NAME ? "active" : "inactive"}`}
            >
              Cloudinary{" "}
              {process.env.CLOUDINARY_CLOUD_NAME
                ? "configured"
                : "local mock storage"}
            </span>
          </p>
          <p>
            <span
              className={`staff-state ${process.env.SMS_API_URL ? "active" : "inactive"}`}
            >
              SMS {process.env.SMS_API_URL ? "configured" : "mock OTP"}
            </span>
          </p>
          <p className="muted">
            Secrets are managed through the deployment environment and are never
            shown or stored in browser-accessible settings.
          </p>
        </div>
        <div className="panel">
          <h2>Inventory approval threshold</h2>
          <p className="muted">
            Adjustments at or above this absolute quantity require independent
            approval.
          </p>
          <ActionForm action={stockThresholdAction} submit="Save threshold">
            <label>
              Units
              <input
                name="threshold"
                type="number"
                min={1}
                max={100000}
                defaultValue={Number(stockThreshold?.value ?? 100)}
                required
              />
            </label>
          </ActionForm>
        </div>
      <div className="section-heading">
        <div>
          <span className="eyebrow">Where we deliver</span>
          <h2>Service areas &amp; delivery</h2>
        </div>
      </div>
      <p className="muted">
        Changes take effect at checkout. Only enable PIN codes that the store
        has confirmed it can serve.
      </p>
      <div className="settings-grid">
        <div className="panel">
          <h2>Delivery rules</h2>
          <ActionForm action={rulesAction} submit="Save rules">
            <label>
              Same-day cutoff hour (IST, 0–23)
              <input
                name="cutoffHour"
                type="number"
                min={0}
                max={23}
                defaultValue={rules.cutoffHour}
              />
            </label>
            <label>
              Free-delivery threshold (paise)
              <input
                name="freeThresholdPaise"
                type="number"
                min={0}
                defaultValue={rules.freeThresholdPaise}
              />
            </label>
            <label>
              Blackout dates (YYYY-MM-DD, comma separated)
              <input
                name="blackoutDates"
                defaultValue={rules.blackoutDates.join(",")}
              />
            </label>
            <label>
              Weekly holidays (0 = Sunday, 6 = Saturday)
              <input name="holidays" defaultValue={rules.holidays.join(",")} />
            </label>
          </ActionForm>
        </div>
        {areas.map((a) => (
          <div className="panel" key={String(a._id)}>
            <h2>{a.name}</h2>
            <ActionForm action={serviceAreaAction} submit="Save area">
              <input name="areaId" type="hidden" value={String(a._id)} />
              <label>
                PIN codes, separated by commas
                <input
                  name="pincodes"
                  defaultValue={a.pincodes.join(", ")}
                  placeholder="Confirmed service PIN codes"
                  required
                />
              </label>
              <label>
                Delivery fee (paise)
                <input
                  name="feePaise"
                  type="number"
                  min={0}
                  max={100000}
                  defaultValue={a.feePaise}
                  required
                />
              </label>
              <label>
                COD limit (paise)
                <input
                  name="codLimitPaise"
                  type="number"
                  min={0}
                  max={10000000}
                  defaultValue={a.codLimitPaise}
                  required
                />
              </label>
              <label>
                <input
                  type="checkbox"
                  name="enabled"
                  defaultChecked={a.enabled}
                />{" "}
                Enable delivery
              </label>
              <label>
                <input
                  type="checkbox"
                  name="codEnabled"
                  defaultChecked={a.codEnabled}
                />{" "}
                Enable Cash on Delivery
              </label>
            </ActionForm>
          </div>
        ))}
      </div>
        <div className="panel">
          <h2>Create delivery slot</h2>
          <ActionForm action={slotAction} submit="Create slot">
            <label>
              Area
              <select name="areaId">
                {areas
                  .filter((a) => a.enabled)
                  .map((a) => (
                    <option key={String(a._id)} value={String(a._id)}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Date
              <input name="date" type="date" required />
            </label>
            <label>
              Delivery window
              <input
                name="label"
                placeholder="4:00 PM – 7:00 PM"
                minLength={5}
                required
              />
            </label>
            <label>
              Order capacity
              <input
                name="capacity"
                type="number"
                min={1}
                max={10000}
                defaultValue={20}
              />
            </label>
          </ActionForm>
          <ul>
            {slots.map((s) => (
              <li key={String(s._id)}>
                {s.date} · {s.label} · {s.reserved}/{s.capacity} booked
              </li>
            ))}
          </ul>
        </div>
        <div className="panel">
          <h2>Search synonyms</h2>
          <ActionForm action={synonymAction} submit="Save mapping">
            <label>
              Mapping key
              <input
                name="key"
                placeholder="notebook"
                pattern="[a-z0-9-]+"
                required
              />
            </label>
            <label>
              Equivalent terms
              <textarea
                name="terms"
                placeholder="Rice, Chawal, तांदूळ"
                required
                maxLength={1000}
              />
            </label>
          </ActionForm>
          <ul>
            {synonyms.map((s) => (
              <li key={String(s._id)}>
                <strong>{s.key}:</strong> {s.synonyms.join(", ")}
              </li>
            ))}
          </ul>
        </div>
    </section>
  );
}
