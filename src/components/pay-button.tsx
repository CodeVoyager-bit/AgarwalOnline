"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { startPaymentAction } from "@/lib/payments/actions";
type Success = { razorpay_payment_id: string; razorpay_signature: string };
type RazorpayOptions = {
  key: string;
  order_id: string;
  amount: number;
  currency: string;
  name: string;
  handler: (result: Success) => Promise<void>;
  modal: { ondismiss: () => void };
  theme: { color: string };
};
declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => {
      open: () => void;
      on: (name: string, handler: () => void) => void;
    };
  }
}
async function loadCheckout() {
  if (window.Razorpay) return;
  await new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve();
    script.onerror = () => reject(Error("Unable to load payment checkout."));
    document.head.appendChild(script);
  });
}
export function PayButton({
  orderId,
  amount,
}: {
  orderId: string;
  amount: number;
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const router = useRouter();
  async function pay() {
    setBusy(true);
    setMessage("");
    try {
      const data = await startPaymentAction(orderId);
      await loadCheckout();
      if (!window.Razorpay) throw Error("Payment checkout is unavailable.");
      const checkout = new window.Razorpay({
        key: data.key,
        order_id: data.id,
        amount: data.amount,
        currency: data.currency,
        name: "AGARWAL GENERAL STORES",
        theme: { color: "#1e3a8a" },
        modal: { ondismiss: () => setBusy(false) },
        handler: async (result) => {
          try {
            const response = await fetch("/api/payments/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId,
                paymentId: result.razorpay_payment_id,
                signature: result.razorpay_signature,
              }),
            });
            const status = await response.json();
            setMessage(
              response.ok && status.captured
                ? "Payment verified."
                : "Payment is awaiting server confirmation. Please check this order shortly.",
            );
            router.refresh();
          } catch {
            setMessage(
              "Awaiting payment confirmation. Please check this order shortly.",
            );
          } finally {
            setBusy(false);
          }
        },
      });
      checkout.on("payment.failed", () => {
        setMessage(
          "Payment failed. The order will update after provider confirmation.",
        );
        setBusy(false);
        router.refresh();
      });
      checkout.open();
    } catch {
      setMessage(
        "Unable to start payment. Please refresh this order or contact the store.",
      );
      setBusy(false);
    }
  }
  return (
    <div className="panel">
      <p>Complete your payment before the reservation expires.</p>
      <button onClick={pay} disabled={busy} className="primary-button">
        {busy ? "Opening secure checkout…" : `Pay ₹${amount / 100} securely`}
      </button>
      {message && (
        <p role="status" className="muted">
          {message}
        </p>
      )}
    </div>
  );
}
