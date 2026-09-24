import { ActionForm } from "@/components/action-form";
import { PasswordInput } from "@/components/password-input";
import { RecordHistory } from "@/components/record-history";
import { requirePage } from "@/lib/auth/session";
import { grants, staffRoleOf, staffRoles, type Role } from "@/lib/auth/permissions";
import { User } from "@/lib/db/models";
import { staffAction } from "@/lib/staff/actions";

const labels: Record<string, string> = {
  delivery: "Delivery Partner",
  admin: "Admin",
  "super-admin": "Super Admin",
};

export default async function StaffManagement() {
  const actor = await requirePage("staff:manage");
  const staff = await User.find({ roles: { $in: staffRoles } })
    .sort({ active: -1, name: 1 })
    .select("name phone email roles active createdAt");
  return (
    <section className="page-container">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">ACCESS CONTROL</span>
          <h1>Staff & roles</h1>
          <p>Give a customer a staff role, create a new account, or revoke access at once.</p>
        </div>
        <span className="live-chip">
          {staff.filter((member) => member.active).length} active
        </span>
      </div>

      <details className="panel create-staff">
        <summary>Add a staff member</summary>
        <ActionForm action={staffAction} submit="Create staff account">
          <input type="hidden" name="operation" value="create" />
          <p className="muted">
            If this mobile number already has a customer account, the role is added to
            it and the other fields are optional. Otherwise all fields create a new
            account.
          </p>
          <div className="staff-form-grid">
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
              Name
              <input name="name" minLength={2} maxLength={80} />
            </label>
            <label>
              Work email
              <input name="email" type="email" maxLength={180} />
            </label>
            <label>
              Temporary password
              <PasswordInput
                name="password"
                autoComplete="new-password"
                required={false}
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
                      <select
                        name="role"
                        defaultValue={staffRoleOf(member.roles as Role[]) ?? "customer"}
                      >
                        {staffRoles.map((role) => (
                          <option key={role} value={role}>
                            {labels[role]}
                          </option>
                        ))}
                        <option value="customer">Remove staff access</option>
                      </select>
                    </label>
                    <label>
                      New password <small>Leave blank to keep it</small>
                      <PasswordInput
                        name="password"
                        autoComplete="new-password"
                        required={false}
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
              <RecordHistory target={String(member._id)} />
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
