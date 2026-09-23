import { AuthForm } from "@/components/auth-form";
import Link from "next/link";
import { currentLocale } from "@/lib/i18n";

export default async function Signup() {
  const locale = await currentLocale();
  const mr = locale === "mr";
  return (
    <section className="auth-card">
      <span className="eyebrow">{mr ? "नवीन अग्रवाल खाते" : "NEW AGARWAL ACCOUNT"}</span>
      <h1>{mr ? "चला, खाते तयार करूया." : "Let’s create your account."}</h1>
      <p>{mr ? "मोबाईल एकदा पडताळा, ईमेल जोडा आणि पुढील वेळेसाठी सुरक्षित पासवर्ड तयार करा." : "Verify your mobile once, add your email, and create a secure password for faster sign-in."}</p>
      <AuthForm
        locale={locale}
        initialMode="signup"
        mock={process.env.NODE_ENV !== "production" && process.env.MOCK_OTP === "true"}
      />
      <p className="auth-switch"><Link href="/login">{mr ? "आधीच खाते आहे? साइन इन करा →" : "Already have an account? Sign in →"}</Link></p>
    </section>
  );
}
