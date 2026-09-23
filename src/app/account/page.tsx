import Link from "next/link";
import {
  ArrowUpRight,
  Headphones,
  MapPinned,
  PackageCheck,
  RotateCcw,
  Store,
  Heart,
  Bell,
} from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { logoutAction } from "@/lib/auth/actions";
import { ActionForm } from "@/components/action-form";
import { profileAction } from "@/lib/profile/actions";
import { Order } from "@/lib/commerce/models";
import { WishlistItem, Notification } from "@/lib/engagement/models";
import { User } from "@/lib/db/models";
import { currentLocale } from "@/lib/i18n";
export default async function Account() {
  const user = await requirePage("profile:own");
  const locale = await currentLocale();
  const mr = locale === "mr";
  const profile = await User.findById(user.id).select("preferredPaymentMethod substitutionPreference");
  const customerOverview =
    user.role === "customer"
      ? await Promise.all([
          Order.findOne({
            customerId: user.id,
            orderStatus: { $in: ["placed", "confirmed"] },
          })
            .sort({ createdAt: -1 })
            .select("number deliveryStatus deliveryDate"),
          Order.countDocuments({ customerId: user.id }),
          WishlistItem.countDocuments({ customerId: user.id }),
          Notification.countDocuments({ userId: user.id, readAt: null }),
        ])
      : null;
  return (
    <section className="page-container">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">{mr ? "माझे खाते" : "MY ACCOUNT"}</span>
          <h1>{mr ? `नमस्कार, ${user.name}` : `Hello, ${user.name}`}</h1>
          <p>+91 ••••••{user.phone.slice(-4)}</p>
        </div>
        <span className="profile-mark" aria-hidden="true">
          {user.name.slice(0, 1).toUpperCase()}
        </span>
      </div>
      {customerOverview && (
        <>
          <div className="governance-stats account-stats">
            <Link href="/account/orders">
              <span>{customerOverview[1]}</span>
              <small>{mr ? "ऑर्डर" : "Orders"}</small>
            </Link>
            <Link href="/account/wishlist">
              <span>{customerOverview[2]}</span>
              <small>{mr ? "जतन केलेल्या वस्तू" : "Saved items"}</small>
            </Link>
            <Link href="/account/notifications">
              <span>{customerOverview[3]}</span>
              <small>{mr ? "न वाचलेल्या सूचना" : "Unread updates"}</small>
            </Link>
          </div>
          {customerOverview[0] && (
            <Link
              className="panel active-order-card"
              href={`/account/orders/${customerOverview[0]._id}`}
            >
              <span>
                <small>{mr ? "सक्रिय ऑर्डर" : "ACTIVE ORDER"}</small>
                <strong>{customerOverview[0].number}</strong>
              </span>
              <span>
                {customerOverview[0].deliveryStatus.replaceAll("-", " ")} ·{" "}
                {customerOverview[0].deliveryDate}
              </span>
              <ArrowUpRight size={20} />
            </Link>
          )}
        </>
      )}
      <div className="dashboard-links">
        {(user.role === "customer"
          ? [
              [
                mr ? "ऑर्डर" : "Orders",
                mr ? "मागोवा, रद्द करणे किंवा मदत" : "Track, cancel or get help",
                "/account/orders",
                PackageCheck,
              ],
              [
                mr ? "जतन केलेले पत्ते" : "Saved addresses",
                mr ? "वितरण तपशील तयार ठेवा" : "Keep delivery details ready",
                "/account/addresses",
                MapPinned,
              ],
              [
                mr ? "इच्छायादी" : "Wishlist",
                mr ? "लक्षात ठेवायच्या सर्व वस्तू" : "Everything you want to remember",
                "/account/wishlist",
                Heart,
              ],
              [
                mr ? "सूचना" : "Notifications",
                mr ? "ऑर्डर, पेमेंट आणि वितरण अपडेट" : "Order, payment and delivery updates",
                "/account/notifications",
                Bell,
              ],
              [
                mr ? "दुकानाशी बोला" : "Talk to the store",
                mr ? "आमच्या स्थानिक टीमशी चॅट करा" : "Chat with our local team",
                "/account/support",
                Headphones,
              ],
              [
                mr ? "तक्रारी आणि परतावा" : "Complaints & returns",
                mr ? "आम्ही योग्य तोडगा काढू" : "We’ll help make it right",
                "/account/complaints",
                RotateCcw,
              ],
            ]
          : [
              [
                "Open your workspace",
                "Manage today’s store work",
                user.role === "delivery"
                  ? "/delivery"
                  : user.role === "super-admin"
                    ? "/super-admin"
                    : "/admin",
                Store,
              ],
            ]
        ).map(([label, description, href, Icon]) => (
          <Link className="account-tile" key={String(href)} href={String(href)}>
            <span className="account-tile-icon">
              <Icon size={22} />
            </span>
            <span>
              <strong>{String(label)}</strong>
              <small>{String(description)}</small>
            </span>
            <ArrowUpRight size={18} />
          </Link>
        ))}
      </div>
      <details className="panel profile-settings">
        <summary>{mr ? "प्रोफाइल सेटिंग्ज" : "Profile settings"}</summary>
        <ActionForm action={profileAction} submit={mr ? "प्रोफाइल जतन करा" : "Save profile"}>
          <label>
            {mr ? "दिसणारे नाव" : "Display name"}
            <input
              name="name"
              defaultValue={user.name}
              minLength={2}
              maxLength={80}
              required
            />
          </label>
          <label>
            {mr ? "पसंतीची पेमेंट पद्धत" : "Preferred payment"}
            <select name="preferredPaymentMethod" defaultValue={profile?.preferredPaymentMethod ?? "cod"}>
              <option value="cod">{mr ? "वितरणावेळी रोख" : "Cash on Delivery"}</option>
              <option value="razorpay">{mr ? "ऑनलाइन पेमेंट" : "Pay online"}</option>
            </select>
          </label>
          <label>
            {mr ? "वस्तू उपलब्ध नसल्यास" : "If an item is unavailable"}
            <select name="substitutionPreference" defaultValue={profile?.substitutionPreference ?? "contact"}>
              <option value="contact">{mr ? "माझ्याशी संपर्क करा" : "Contact me"}</option>
              <option value="best-match">{mr ? "सर्वात जवळचा पर्याय निवडा" : "Choose the closest match"}</option>
              <option value="no-substitutions">{mr ? "पर्याय नको" : "Do not substitute"}</option>
            </select>
          </label>
          <p className="muted">
            {mr ? "मोबाईल क्रमांक बदलण्यासाठी नवीन OTP पडताळणी आवश्यक आहे." : "Phone-number changes require a new OTP-verified account recovery flow."}
          </p>
        </ActionForm>
      </details>
      <form action={logoutAction}>
        <button className="secondary-button">{mr ? "साइन आउट" : "Sign out"}</button>
      </form>
    </section>
  );
}
