import {
  BriefcaseBusiness,
  Coffee,
  Cookie,
  CookingPot,
  Heart,
  LayoutGrid,
  Milk,
  NotebookPen,
  Palette,
  ShoppingBasket,
  SprayCan,
  Wheat,
} from "lucide-react";

const ICONS: Record<string, typeof Heart> = {
  stationery: NotebookPen,
  paper: NotebookPen,
  "art-craft": Palette,
  office: BriefcaseBusiness,
  household: SprayCan,
  "personal-care": Heart,
  staples: Wheat,
  cooking: CookingPot,
  snacks: Cookie,
  dairy: Milk,
  beverages: Coffee,
  all: LayoutGrid,
};

/** Line icon standing in for a category or product that has no photograph. */
export function AisleIcon({ slug }: { slug: string }) {
  const Icon = ICONS[slug] ?? ShoppingBasket;
  return <Icon size={30} strokeWidth={1.4} aria-hidden="true" className="aisle-icon" />;
}
