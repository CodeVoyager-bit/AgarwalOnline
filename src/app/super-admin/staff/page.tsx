import { ActionForm } from "@/components/action-form";
import { requirePage } from "@/lib/auth/session";
import { grants, type Role } from "@/lib/auth/permissions";
import { User } from "@/lib/db/models";
import { staffAction } from "@/lib/staff/actions";

const staffRoles = ["delivery", "admin", "super-admin"] as const;
const labels: Record<string, string> = {
  delivery: "Delivery Partner",
  admin: "Admin",
  "super-admin": "Super Admin",
};

export default async function StaffManagement() {
  const actor = await requirePage("staff:manage");
  const staff = await User.find({ role: { $in: staffRoles } })
    .sort({ active: -1, role: 1, name: 1 })
    .select("name phone email role active createdAt");
  return (
    <section className="page-container">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">ACCESS CONTROL</span>
          <h1>Staff & roles</h1>
          <p>Create accounts, assign roles and immediately revoke access.</p>
        </div>
        <span className="live-chip">
          {staff.filter((member) => member.active).length} active
        </span>
      </div>

      <details className="panel create-staff">
        <summary>Add a staff member</summary>
        <ActionForm action={staffAction} submit="Create staff account">
          <input type="hidden" name="operation" value="create" />
          <div className="staff-form-grid">
            <label>
              Name
              <input name="name" minLength={2} maxLength={80} required />
            </label>
            <label>
              Work email
              <input name="email" type="email" maxLength={180} required />
            </label>
            <label>
              Phone
              <input
                name="phone"
                inputMode="numeric"
                pattern="[0-9]{10}"
                required
              />
            </label>
            <label>
              Role
              <select name="role">
                {staffRoles.map((role) => (
                  <option key={role} value={role}>
                    {labels[role]}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Temporary password
              <input
                name="password"
                type="password"
                minLength={8}
                maxLength={128}
                autoComplete="new-password"
                required
              />
            </label>
          </div>
        </ActionForm>
      </details>

      <div className="staff-layout">
        <div>
          <h2>Team accounts</h2>
          {staff.map((member) => (
            <article className="panel staff-card" key={String(member._id)}>
              <div className="staff-card-heading">
                <div>
                  <strong>{member.name}</strong>
                  <small>{member.email}</small>
                </div>
                <span
                  className={`staff-state ${member.active ? "active" : "inactive"}`}
                >
                  {member.active ? "Active" : "Access paused"}
                </span>
              </div>
              {String(member._id) === actor.id ? (
                <p className="notice">
                  This is your account. Self-service security changes use a
                  separate verified flow.
                </p>
              ) : (
                <ActionForm action={staffAction} submit="Save access" confirmMessage="This can change the team member’s role, permissions, sign-in access and active sessions.">
                  <input type="hidden" name="operation" value="update" />
                  <input
                    type="hidden"
                    name="staffId"
                    value={String(member._id)}
                  />
                  <div className="staff-form-grid compact">
                    <label>
                      Name
                      <input name="name" defaultValue={member.name} required />
                    </label>
                    <label>
                      Work email
                      <input
                        name="email"
                        type="email"
                        defaultValue={member.email}
                        required
                      />
                    </label>
                    <label>
                      Phone
                      <input
                        name="phone"
                        defaultValue={member.phone}
                        pattern="[0-9]{10}"
                        required
                      />
                    </label>
                    <label>
                      Role
                      <select name="role" defaultValue={member.role}>
                        {staffRoles.map((role) => (
                          <option key={role} value={role}>
                            {labels[role]}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      New password <small>Leave blank to keep it</small>
                      <input
                        name="password"
                        type="password"
                        minLength={8}
                        maxLength={128}
                        autoComplete="new-password"
                      />
                    </label>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        name="active"
                        defaultChecked={member.active}
                      />{" "}
                      Account can sign in
                    </label>
                  </div>
                </ActionForm>
              )}
            </article>
          ))}
        </div>
        <aside className="panel permission-panel">
          <span className="eyebrow">ROLE GUIDE</span>
          <h2>What each role can do</h2>
          {staffRoles.map((role) => (
            <details key={role} open={role === "super-admin"}>
              <summary>{labels[role]}</summary>
              <ul>
                {grants[role as Role].map((grant) => (
                  <li key={grant}>{grant.replaceAll(":", " · ")}</li>
                ))}
              </ul>
            </details>
          ))}
          <p className="muted">
            Role permissions are code-reviewed. Account changes and session
            revocations appear in the audit trail.
          </p>
        </aside>
      </div>
    </section>
  );
}
