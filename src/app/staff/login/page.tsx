import { AuthForm } from "@/components/auth-form";
import Link from "next/link";
export default function StaffLogin() {
  return (
    <section className="auth-card">
      <span className="eyebrow">AGARWAL OPERATIONS</span>
      <h1>Team access</h1>
      <p>Secure workspace for authorised store and delivery staff.</p>
      <AuthForm staff />
      <p className="auth-switch"><Link href="/">← Return to the storefront</Link></p>
    </section>
  );
}
