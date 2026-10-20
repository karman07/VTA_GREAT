import { ArrowRight, BookOpenCheck, Quote, GraduationCap, FileText, Link2, MessageSquareQuote, ShieldCheck, Gauge, History } from "lucide-react";
import { PublicShell } from "@/components/PublicShell";
import { AuthButton, AuthTextButton } from "@/components/AuthDialog";
import { DEFAULT_LIMITS as L } from "@/lib/constants";
import { HeroDemo } from "@/components/HeroDemo";
import { CountUp, Reveal } from "@/components/motion";

const STEPS = [
  { Icon: FileText, title: "Teachers add materials", body: "Create a subject and upload your notes, slides or readings (PDF, DOCX, PPTX, TXT or Markdown)." },
  { Icon: Link2, title: "Students join with a code", body: "Each subject has a short class code. Students sign up, enter the code and they are in." },
  { Icon: MessageSquareQuote, title: "Answers cite the source", body: "VTA answers only from the class materials and shows the document and page behind every answer." },
];

export function Landing() {
  return (
    <PublicShell>
      {/* Hero */}
      <section className="grain relative overflow-hidden">
        <div aria-hidden className="float-a pointer-events-none absolute -left-24 top-10 size-[28rem] rounded-full bg-forest-100/70 blur-3xl" />
        <div aria-hidden className="float-b pointer-events-none absolute -right-20 bottom-0 size-[26rem] rounded-full bg-gold-100/80 blur-3xl" />
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-20 lg:grid-cols-[1.1fr_0.9fr] lg:py-28">
          <div className="rise">
            <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-forest-600">
              <span className="size-1.5 rounded-full bg-forest-500" /> Beta · for teachers and students
            </span>
            <h1 className="font-display mt-6 text-[2.75rem] leading-[1.05] text-forest-900 sm:text-6xl">
              {["A", "teaching", "assistant", "that", "only", "knows"].map((w, i) => (
                <span key={w + i} className="stagger inline-block pr-[0.25em]" style={{ "--i": i + 1 } as React.CSSProperties}>{w}</span>
              ))}
              {["what", "you", "teach."].map((w, i) => (
                <span key={w} className="stagger inline-block pr-[0.25em] italic text-forest-600" style={{ "--i": i + 7 } as React.CSSProperties}>{w}</span>
              ))}
            </h1>
            <p className="stagger mt-6 max-w-xl text-lg leading-relaxed text-ink-soft [--i:9]">
              VTA turns a teacher&rsquo;s own course materials into an assistant students can question at any hour — grounded in the
              documents, with every answer pointing back to its source.
            </p>
            <div className="stagger mt-9 flex flex-wrap gap-3 [--i:10]">
              <AuthButton role="teacher" mode="signup" size="lg">
                <BookOpenCheck className="size-5" aria-hidden /> I&rsquo;m a teacher
              </AuthButton>
              <AuthButton role="student" mode="signup" variant="secondary" size="lg">
                <GraduationCap className="size-5" aria-hidden /> I&rsquo;m a student
              </AuthButton>
            </div>
            <p className="mt-5 text-sm text-ink-muted">
              Already have an account? <AuthTextButton mode="login" className="font-medium text-forest-700 hover:underline">Sign in</AuthTextButton>
            </p>
          </div>

          {/* Product preview */}
          <div className="rise relative [animation-delay:350ms]" aria-hidden>
            <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-forest-100/60 blur-2xl" />
            <HeroDemo />
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how" className="scroll-mt-20 border-y border-cream-300 bg-cream-50">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal>
            <h2 className="font-display text-center text-4xl text-forest-900">How it works</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-ink-muted">Three steps from a folder of notes to a classroom assistant.</p>
          </Reveal>
          <ol className="mt-14 grid gap-6 md:grid-cols-3">
            {STEPS.map(({ Icon, title, body }, i) => (
              <Reveal key={title} as="li" delay={i * 120}>
                <div className="group relative h-full rounded-2xl border border-cream-300 bg-cream-100 p-7 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-1.5 hover:border-forest-300 hover:shadow-lift">
                  <span className="font-display absolute right-6 top-5 text-5xl text-cream-400 transition-colors duration-300 group-hover:text-forest-200">{i + 1}</span>
                  <div className="grid size-11 place-items-center rounded-xl bg-forest-800 text-cream-50 transition-transform duration-300 group-hover:scale-110 group-hover:-rotate-6"><Icon className="size-5" aria-hidden /></div>
                  <h3 className="font-display mt-5 text-xl text-forest-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-ink-muted">{body}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* Limits */}
      <section id="limits" className="scroll-mt-20">
        <div className="mx-auto max-w-6xl px-5 py-20">
          <Reveal>
            <h2 className="font-display text-center text-4xl text-forest-900">Simple, fixed usage limits</h2>
            <p className="mx-auto mt-3 max-w-xl text-center text-ink-muted">
              During the beta every account gets the same allowance, shown clearly inside the app.
            </p>
          </Reveal>
          <div className="mt-12 grid gap-6 md:grid-cols-2">
            <Reveal>
            <div className="h-full rounded-2xl border border-cream-300 bg-cream-50 p-8 shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lift">
              <div className="flex items-center gap-3 text-forest-800"><BookOpenCheck className="size-6" aria-hidden /><h3 className="font-display text-2xl">Teachers</h3></div>
              <dl className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-forest-50 p-5"><dt className="text-sm text-ink-muted">Subjects</dt><dd className="font-display mt-1 text-4xl text-forest-900"><CountUp value={L.teacherMaxSubjects} /></dd></div>
                <div className="rounded-xl bg-forest-50 p-5"><dt className="text-sm text-ink-muted">Documents per subject</dt><dd className="font-display mt-1 text-4xl text-forest-900"><CountUp value={L.teacherMaxDocsPerSubject} /></dd></div>
              </dl>
              <p className="mt-4 text-sm text-ink-muted">Up to {L.maxFileBytes / 1024 / 1024} MB per file. Delete a document or subject to free its place.</p>
            </div>
            </Reveal>
            <Reveal delay={140}>
            <div className="h-full rounded-2xl border border-cream-300 bg-cream-50 p-8 shadow-card transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:shadow-lift">
              <div className="flex items-center gap-3 text-forest-800"><GraduationCap className="size-6" aria-hidden /><h3 className="font-display text-2xl">Students</h3></div>
              <dl className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-xl bg-forest-50 p-5"><dt className="text-sm text-ink-muted">Questions per class</dt><dd className="font-display mt-1 text-4xl text-forest-900"><CountUp value={L.studentMaxQuestionsPerSubject} /></dd></div>
                <div className="rounded-xl bg-forest-50 p-5"><dt className="text-sm text-ink-muted">Chat history</dt><dd className="font-display mt-1 text-4xl text-forest-900">Kept</dd></div>
              </dl>
              <p className="mt-4 text-sm text-ink-muted">Questions that fail to get an answer are never counted. Your history stays readable after the limit is reached.</p>
            </div>
            </Reveal>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="border-t border-cream-300 bg-forest-900 text-cream-50">
        <div className="mx-auto grid max-w-6xl gap-10 px-5 py-16 md:grid-cols-3">
          {[
            { Icon: Quote, t: "Cited answers", b: "Responses are drawn from the uploaded materials and list the documents they used." },
            { Icon: ShieldCheck, t: "Teachers stay in control", b: "Teachers choose the materials, can remove them any time, and see the questions their class asks." },
            { Icon: History, t: "Nothing gets lost", b: "Every conversation is saved to the student's account so they can return to it later." },
          ].map(({ Icon, t, b }, i) => (
            <Reveal key={t} delay={i * 120}>
              <Icon className="size-6 text-forest-300" aria-hidden />
              <h3 className="font-display mt-4 text-xl">{t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-forest-200">{b}</p>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal as="section" className="mx-auto max-w-3xl px-5 py-20 text-center">
        <Gauge className="mx-auto size-7 text-forest-600" aria-hidden />
        <h2 className="font-display mt-4 text-4xl text-forest-900">Ready to try it in your class?</h2>
        <p className="mt-3 text-ink-muted">Create an account in under a minute. No learning-management-system setup required.</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <AuthButton role="teacher" mode="signup" size="lg">Start as a teacher <ArrowRight className="size-5" aria-hidden /></AuthButton>
          <AuthButton role="student" mode="signup" variant="secondary" size="lg">Join as a student</AuthButton>
        </div>
      </Reveal>
    </PublicShell>
  );
}
