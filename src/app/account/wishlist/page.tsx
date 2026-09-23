import Link from "next/link";
import { Heart } from "lucide-react";
import { requirePage } from "@/lib/auth/session";
import { WishlistItem } from "@/lib/engagement/models";
import { catalog } from "@/lib/catalog/queries";
import { ProductCard } from "@/components/product-card";
import { currentLocale } from "@/lib/i18n";

export default async function WishlistPage() {
  const user = await requirePage("profile:own");
  const locale = await currentLocale();
  const saved = await WishlistItem.find({ customerId: user.id }).select(
    "productId",
  );
  const ids = new Set(saved.map((item) => String(item.productId)));
  const products = (await catalog()).filter((product) => ids.has(product.id));
  return (
    <section className="page-container">
      <div className="workspace-heading">
        <div>
          <span className="eyebrow">SAVED FOR LATER</span>
          <h1>Your wishlist</h1>
          <p>Keep favourites close and add them whenever you need them.</p>
        </div>
        <span className="profile-mark" aria-hidden="true">
          <Heart size={22} />
        </span>
      </div>
      {products.length ? (
        <div className="product-grid">
          {products.map((product, index) => (
            <ProductCard
              key={product.id}
              product={product}
              locale={locale}
              saved
              eager={index === 0}
            />
          ))}
        </div>
      ) : (
        <div className="panel empty-state">
          <Heart size={40} strokeWidth={1.5} className="empty-icon" aria-hidden="true" />
          <h2>Your wishlist is ready for favourites</h2>
          <p>Tap Save on a product and it will appear here.</p>
          <Link className="primary-button" href="/catalog">
            Browse products
          </Link>
        </div>
      )}
    </section>
  );
}
