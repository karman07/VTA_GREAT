import Link from "next/link";
import { PublicShell } from "./PublicShell";
import { TERMS_EFFECTIVE } from "@/lib/constants";

export interface LegalSection {
  id: string;
  title: string;
  body: React.ReactNode;
}

export function LegalPage({
  title,
  intro,
  sections,
  other,
}: {
  title: string;
  intro: React.ReactNode;
  sections: LegalSection[];
  other: { href: string; label: string };
}) {
  return (
    <PublicShell>
      <section className="grain border-b border-cream-300">
        <div className="mx-auto max-w-6xl px-5 py-14 sm:py-20">
          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-forest-600">
            Beta · Effective {TERMS_EFFECTIVE}
          </span>
          <h1 className="font-display mt-5 text-4xl text-forest-900 sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">{intro}</p>
        </div>
      </section>

      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 lg:grid-cols-[240px_1fr]">
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink-muted">On this page</p>
            <ul className="space-y-1 border-l border-cream-300">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="-ml-px block border-l-2 border-transparent py-1.5 pl-4 text-sm text-ink-soft hover:border-forest-500 hover:text-forest-800">
                    {i + 1}. {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </nav>

        <article className="min-w-0 max-w-3xl">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24 border-b border-cream-300 py-8 first:pt-0 last:border-0">
              <h2 className="font-display text-2xl text-forest-900">
                <span className="mr-2 text-forest-500">{i + 1}.</span>
                {s.title}
              </h2>
              <div className="mt-4 space-y-4 text-[16px] leading-[1.75] text-ink-soft [&_a]:font-medium [&_a]:text-forest-700 [&_a]:underline [&_a]:underline-offset-2 [&_li]:pl-1 [&_strong]:text-ink [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5">
                {s.body}
              </div>
            </section>
          ))}
          <p className="mt-6 text-sm text-ink-muted">
            Also read: <Link href={other.href} className="font-medium text-forest-700 underline underline-offset-2">{other.label}</Link>
          </p>
        </article>
      </div>
    </PublicShell>
  );
}
