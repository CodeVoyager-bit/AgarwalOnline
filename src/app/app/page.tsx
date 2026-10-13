import { currentLocale } from "@/lib/i18n";
import { InstallApp } from "@/components/install-app";

export const metadata = {
  title: "Get the app",
  description: "Put Agarwal General Stores on your phone's home screen: install the app on Android or iPhone.",
};

/** Built by Bubblewrap from this site (README, "Android app"); it opens agarwalonline.in full-screen. */
const APK = { href: "/downloads/agarwal-online.apk", size: "1.1 MB" };

export default async function GetTheApp() {
  const mr = (await currentLocale()) === "mr";
  return (
    <section className="auth-card utility-card app-card">
      <span className="eyebrow">{mr ? "ॲप मिळवा" : "GET THE APP"}</span>
      <h1>{mr ? "Agarwal तुमच्या होम स्क्रीनवर." : "Agarwal on your home screen."}</h1>
      <p>
        {mr
          ? "एका टॅपमध्ये दुकान उघडते. हेच दुकान आहे, त्यामुळे तुमची बास्केट, ऑर्डर आणि खाते सगळे तिथेच असते."
          : "One tap opens the shop. It’s this same shop, so your basket, orders and account are all there."}
      </p>
      <div className="app-options">
        <InstallApp mr={mr}>
          <div className="app-option">
            <h2>Android</h2>
            <a className="secondary-button" href={APK.href} download>
              {mr ? "Android ॲप डाउनलोड करा (APK)" : "Download the Android app (APK)"}
            </a>
            <p>
              {mr
                ? `सुमारे ${APK.size}. डाउनलोड झालेली फाइल उघडा. Android ने विचारल्यास तुमच्या ब्राउझरमधून इन्स्टॉल करण्याची परवानगी द्या: हे ॲप थेट या दुकानाकडून येते, Play Store वरून नाही.`
                : `About ${APK.size}. Open the downloaded file to install it. If Android asks, allow installs from your browser: the app comes straight from this shop, not the Play Store.`}
            </p>
          </div>
          <div className="app-option">
            <h2>iPhone</h2>
            <p>
              {mr
                ? "ही पेज Safari मध्ये उघडा, शेअर बटण दाबा, मग “Add to Home Screen” निवडा."
                : "Open this page in Safari, tap the Share button, then choose “Add to Home Screen”."}
            </p>
          </div>
        </InstallApp>
      </div>
    </section>
  );
}
