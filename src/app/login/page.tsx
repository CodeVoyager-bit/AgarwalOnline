import { AuthForm } from "@/components/auth-form";
import Link from "next/link";
import { currentLocale } from "@/lib/i18n";

export default async function Login() {
  const locale = await currentLocale();
  const mr = locale === "mr";
  return (
    <section className="auth-card">
      <span className="eyebrow">{mr ? "तुमचे अग्रवाल खाते" : "YOUR AGARWAL ACCOUNT"}</span>
      <h1>{mr ? "पुन्हा स्वागत आहे." : "Good to see you."}</h1>
      <p>{mr ? "मोबाईल, ईमेल किंवा सुरक्षित OTP वापरून साइन इन करा. दुकानाचे कर्मचारीही येथूनच साइन इन करतात." : "Sign in with your mobile number, email, or a secure OTP. Store staff sign in here too."}</p>
      <AuthForm
        locale={locale}
        mock={
          process.env.NODE_ENV !== "production" &&
          process.env.MOCK_OTP === "true"
        }
      />
      <p className="auth-switch"><Link href="/signup">{mr ? "नवीन ग्राहक? खाते तयार करा →" : "New customer? Create an account →"}</Link></p>
      <p className="auth-switch"><Link href="/catalog">{mr ? "साइन इन न करता खरेदी पाहा →" : "Continue browsing without signing in →"}</Link></p>
    </section>
  );
}
