import {
  Backpack,
  BookMarked,
  BriefcaseBusiness,
  Frame,
  Gift,
  Heart,
  LayoutGrid,
  Mail,
  Notebook,
  NotebookPen,
  NotebookText,
  Palette,
  PartyPopper,
  Pencil,
  PenLine,
  Puzzle,
  Ribbon,
  ShoppingBasket,
} from "lucide-react";

const ICONS: Record<string, typeof Heart> = {
  pens: PenLine,
  pencils: Pencil,
  "long-books": NotebookText,
  notebooks: Notebook,
  diaries: BookMarked,
  stationery: NotebookPen,
  paper: NotebookText,
  school: Backpack,
  "art-craft": Palette,
  office: BriefcaseBusiness,
  "gift-sets": Gift,
  "gift-wrap": Ribbon,
  cards: Mail,
  decor: Frame,
  toys: Puzzle,
  party: PartyPopper,
  all: LayoutGrid,
};

/** Line icon standing in for a category or product that has no photograph. */
export function AisleIcon({ slug }: { slug: string }) {
  const Icon = ICONS[slug] ?? ShoppingBasket;
  return <Icon size={30} strokeWidth={1.4} aria-hidden="true" className="aisle-icon" />;
}
