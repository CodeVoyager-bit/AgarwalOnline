import Link from "next/link";
import mongoose from "mongoose";
import { requirePage } from "@/lib/auth/session";
import { AuditLog, User } from "@/lib/db/models";

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
      key,
      /password|secret|token|code|signature/i.test(key)
        ? "[redacted]"
        : redact(entry),
    ]),
  );
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePage("audit:read");
  const params = await searchParams;
  const query: Record<string, unknown> = {};
  if (params.actor && mongoose.isValidObjectId(params.actor))
    query.actorId = params.actor;
  if (params.q) {
    const term = new RegExp(escapeRegex(params.q.trim().slice(0, 80)), "i");
    query.$or = [{ action: term }, { target: term }];
  }
  const from = params.from ? new Date(`${params.from}T00:00:00+05:30`) : null;
  const to = params.to ? new Date(`${params.to}T23:59:59.999+05:30`) : null;
  if (
    (from && !Number.isNaN(from.getTime())) ||
    (to && !Number.isNaN(to.getTime()))
  )
    query.at = {
      ...(from && !Number.isNaN(from.getTime()) ? { $gte: from } : {}),
      ...(to && !Number.isNaN(to.getTime()) ? { $lte: to } : {}),
    };
  const [events, actors, total] = await Promise.all([
    AuditLog.find(query)
      .sort({ at: -1 })
      .limit(200)
      .populate("actorId", "name email role"),
    User.find({ role: { $in: ["delivery", "admin", "super-admin"] } })
      .sort({ name: 1 })
      .select("name role"),
    AuditLog.countDocuments(query),
  ]);
  return (
    <section className="page-container">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">ACCOUNTABILITY</span>
          <h1>Audit trail</h1>
          <p>Immutable records of sensitive store and staff actions.</p>
        </div>
        <span className="live-chip">{total} matching</span>
      </div>
      <form className="audit-filters">
        <label>
          Action or target
          <input
            name="q"
            defaultValue={params.q}
            placeholder="staff.update"
            maxLength={80}
          />
        </label>
        <label>
          Team member
          <select name="actor" defaultValue={params.actor ?? ""}>
            <option value="">Everyone</option>
            {actors.map((actor) => (
              <option key={String(actor._id)} value={String(actor._id)}>
                {actor.name} · {actor.role}
              </option>
            ))}
          </select>
        </label>
        <label>
          From
          <input name="from" type="date" defaultValue={params.from} />
        </label>
        <label>
          To
          <input name="to" type="date" defaultValue={params.to} />
        </label>
        <button className="primary-button">Filter</button>
        <Link className="secondary-button" href="/super-admin/audit">
          Clear
        </Link>
      </form>
      <div className="panel audit-list">
        {events.length ? (
          events.map((event) => {
            const actor = event.actorId as unknown as {
              name?: string;
              email?: string;
              role?: string;
            } | null;
            return (
              <article className="audit-row" key={String(event._id)}>
                <span className="audit-icon" aria-hidden="true">
                  {event.action.split(".")[0].slice(0, 1).toUpperCase()}
                </span>
                <div className="audit-copy">
                  <strong>{event.action}</strong>
                  <small>
                    {actor?.name ?? "System"}
                    {actor?.role ? ` · ${actor.role}` : ""} ·{" "}
                    {new Date(event.at).toLocaleString("en-IN", {
                      timeZone: "Asia/Kolkata",
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </small>
                  {event.target && <span>Target: {event.target}</span>}
                </div>
                {event.details && (
                  <details>
                    <summary>Details</summary>
                    <pre>{JSON.stringify(redact(event.details), null, 2)}</pre>
                  </details>
                )}
              </article>
            );
          })
        ) : (
          <div className="empty-state">
            <h2>No matching activity</h2>
            <p>Try a broader action, person or date range.</p>
          </div>
        )}
      </div>
      {total > events.length && (
        <p className="muted">Showing the newest {events.length} records.</p>
      )}
    </section>
  );
}
