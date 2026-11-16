import Image from "next/image";
import Link from "next/link";
import { ArrowRight, BriefcaseBusiness, Camera, Globe, Mail, MessageCircle, type LucideIcon } from "lucide-react";
import type { SectionValues } from "@/lib/settings/shop";

/* The developer credit (Settings → Developer and team, which only Tech can change): a card at the
   bottom of every shop page and the team page. A contact left blank there is not shown. */

export type Team = SectionValues<"team">;
type Contact = { href: string; label: string; Icon: LucideIcon };

/** Each way to reach the developer that's filled in. Email shows its address where there's room. */
export function devContacts(team: Team, full = false): Contact[] {
  return [
    team.devEmail && { href: `mailto:${team.devEmail}`, label: full ? team.devEmail : "Email", Icon: Mail },
    team.devWhatsapp && { href: `https://wa.me/91${team.devWhatsapp}`, label: "WhatsApp", Icon: MessageCircle },
    team.devLinkedin && { href: team.devLinkedin, label: "LinkedIn", Icon: BriefcaseBusiness },
    team.devInstagram && { href: team.devInstagram, label: "Instagram", Icon: Camera },
    team.devPortfolio && { href: team.devPortfolio, label: "Portfolio", Icon: Globe },
  ].filter((contact): contact is Contact => Boolean(contact));
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** The photo from Settings, or the person's initials in its place until there is one. */
export function TeamPhoto({ name, photo, size }: { name: string; photo?: string; size: number }) {
  return photo ? (
    <Image src={photo} alt={name} width={size} height={size} unoptimized className="dev-photo" />
  ) : (
    <span className="dev-photo is-initials" aria-hidden="true">
      {initials(name)}
    </span>
  );
}

export function DevContacts({ team, full = false }: { team: Team; full?: boolean }) {
  const contacts = devContacts(team, full);
  if (!contacts.length) return null;
  return (
    <ul className="dev-contacts">
      {contacts.map(({ href, label, Icon }) => (
        <li key={href}>
          <a href={href} {...(href.startsWith("https:") ? { target: "_blank", rel: "noopener noreferrer" } : {})}>
            <Icon size={18} aria-hidden="true" />
            {label}
          </a>
        </li>
      ))}
    </ul>
  );
}

/** The footer's card: who built the site, how to reach them, and the way to the team page. */
export function DevCredit({ team, mr }: { team: Team; mr: boolean }) {
  return (
    <section className="dev-credit" aria-label={`${mr ? "विकसित केले" : "Developed by"} ${team.devName}`}>
      <TeamPhoto name={team.devName} photo={team.devPhoto} size={64} />
      <div className="dev-credit-text">
        <p className="dev-credit-eyebrow">{mr ? "विकसित केले" : "Developed by"}</p>
        <p className="dev-credit-name">{team.devName}</p>
        <p className="dev-credit-role">{team.devRole}</p>
      </div>
      <DevContacts team={team} />
      <Link href="/p/team" className="dev-team-link">
        {mr ? "टीम पाहा" : "Meet the team"}
        <ArrowRight size={16} aria-hidden="true" />
      </Link>
    </section>
  );
}
