import type { Metadata } from "next";
import Link from "next/link";
import { PageHeading } from "@/components/page-heading";
import { DevContacts, TeamPhoto } from "@/components/dev-credit";
import { shopSettings } from "@/lib/settings/shop";

export async function generateMetadata(): Promise<Metadata> {
  const team = await shopSettings("team");
  return { title: "The team", description: `Agarwal Online is built and looked after by ${team.devName}, with ${team.helperName}.` };
}

/** Who built the site, from Settings → Developer and team: the lead developer's card, then the rest of the team. */
export default async function TeamPage() {
  const team = await shopSettings("team");
  return (
    <section className="page-container team-page">
      <PageHeading
        eyebrow="Agarwal Online"
        title="The team behind the site"
        lead={`Built and looked after by ${team.devName}, with ${team.helperName}. Get in touch about the website, or about building one for your business.`}
      />
      <div className="team-grid">
        <article className="panel team-card" aria-labelledby="team-lead">
          <TeamPhoto name={team.devName} photo={team.devPhoto} size={120} />
          <div>
            <h2 id="team-lead">{team.devName}</h2>
            <p className="muted">{team.devRole}</p>
          </div>
          <DevContacts team={team} full />
        </article>
        <article className="panel team-card is-small" aria-labelledby="team-helper">
          <TeamPhoto name={team.helperName} size={72} />
          <div>
            <h2 id="team-helper">{team.helperName}</h2>
            <p className="muted">{team.helperRole}</p>
          </div>
        </article>
      </div>
      <p className="muted team-note">
        A question about an order or the shop? <Link href="/p/contact-and-grievance">Contact the shop</Link> instead.
      </p>
    </section>
  );
}
