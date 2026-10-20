import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/Legal";
import { DEFAULT_LIMITS as L, ALLOWED_EXTENSIONS, CONTACT_EMAIL, CONTACT_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Terms of Service" };

const MB = L.maxFileBytes / 1024 / 1024;

const sections: LegalSection[] = [
  {
    id: "about",
    title: "About VTA and these Terms",
    body: (
      <>
        <p>
          VTA — Virtual Teaching Assistant — is an independently hosted beta educational platform led by {CONTACT_NAME}. It lets
          teachers upload course materials and lets enrolled students ask questions that are answered from those materials.
        </p>
        <p>
          By creating an account or using VTA you agree to these Terms of Service and to the <Link href="/privacy">Privacy Policy</Link>.
          If you do not agree, do not use VTA.
        </p>
      </>
    ),
  },
  {
    id: "accounts",
    title: "Accounts",
    body: (
      <ul>
        <li>VTA has two account types: <strong>teacher</strong> and <strong>student</strong>. They are separate; an email registered as one type is not automatically an account of the other type.</li>
        <li>You sign in with an email address and password. Give accurate information and keep your password private. You are responsible for activity under your account.</li>
        <li>You must be at least <strong>13 years old</strong>. Children under 13 may not create or use an account.</li>
        <li>Do not share your account or try to access anyone else&rsquo;s account or data.</li>
        <li>When you sign up we record that you accepted these Terms, which version you accepted, and when.</li>
      </ul>
    ),
  },
  {
    id: "limits",
    title: "Usage limits",
    body: (
      <>
        <p>During the beta, every account has the following fixed allowance. The limits are enforced by the VTA server.</p>
        <p><strong>Teachers</strong></p>
        <ul>
          <li>Up to <strong>{L.teacherMaxSubjects} subjects</strong> per teacher account.</li>
          <li>Up to <strong>{L.teacherMaxDocsPerSubject} documents</strong> in each subject.</li>
          <li>Accepted file types: {ALLOWED_EXTENSIONS.join(", ")}. Each file may be at most {MB} MB.</li>
          <li>Deleting a document or subject frees its place. A document that fails processing does not use up a place.</li>
        </ul>
        <p><strong>Students</strong></p>
        <ul>
          <li>Up to <strong>{L.studentMaxQuestionsPerSubject} questions</strong> in each class (subject) you join. Each class has its own allowance.</li>
          <li>The allowance is for the life of your enrolment in that class. It does <strong>not</strong> reset when you start a new chat, sign out, or delete a chat.</li>
          <li>A question counts only when an answer is delivered. If VTA cannot produce an answer, the question is not counted.</li>
          <li>Each question may be at most {L.maxQuestionChars} characters.</li>
          <li>When you reach the limit you can still read your saved chat history for that class, but you cannot ask more questions in it.</li>
        </ul>
        <p>We may change these limits in the future. Trying to get around a limit (for example by creating extra accounts) is not permitted.</p>
      </>
    ),
  },
  {
    id: "materials",
    title: "Teacher materials",
    body: (
      <ul>
        <li>Upload only materials you own or are authorized to use. You keep ownership of what you upload.</li>
        <li>You give VTA permission to store your materials, extract and index their text, and send that text to our AI provider (see the Privacy Policy) so the assistant can work. You also permit students enrolled in your subject to view the documents you upload to it.</li>
        <li>Do not upload confidential student records, passwords, financial or medical information, government identification numbers, or other sensitive personal data.</li>
        <li>Deleting a document removes the stored file and its indexed text. Deleting a subject removes all of its documents, its enrolments and its chat history.</li>
        <li>We may remove content if the owner asks, or if reasonably necessary for legal, security or operational reasons.</li>
      </ul>
    ),
  },
  {
    id: "students",
    title: "Student questions and visibility",
    body: (
      <ul>
        <li>The teacher of a class you join can see your <strong>name, email address, when you joined and were last active, how many questions you have used, and your full conversations in that class — every question you ask, the answers VTA gives, and the sources it cites</strong>.</li>
        <li>Joining a class requires its class code. Anyone who has the code can join, so teachers should share it only with their students.</li>
        <li>Do not include personal, sensitive or confidential information in your questions.</li>
      </ul>
    ),
  },
  {
    id: "ai",
    title: "AI-generated answers",
    body: (
      <>
        <p>
          Answers are generated by an artificial-intelligence model (Google Gemini) from excerpts of the teacher&rsquo;s materials. Answers can be
          incomplete, inaccurate or out of date, and the cited source may not support every statement.
        </p>
        <p>
          Check important information against the original materials and your teacher. VTA is not a substitute for your teacher&rsquo;s instruction,
          and must not be the sole basis for legal, medical, financial, safety-related or other consequential decisions. Teachers remain
          responsible for instruction, assessment and grading. Follow your school&rsquo;s academic-integrity rules when using AI assistance.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "Acceptable use",
    body: (
      <>
        <p>You agree not to:</p>
        <ul>
          <li>use VTA for unlawful, harmful, harassing or misleading activity;</li>
          <li>upload content that infringes someone else&rsquo;s rights or contains malware;</li>
          <li>try to bypass security, usage limits or access controls, or access another user&rsquo;s information;</li>
          <li>try to make the assistant ignore its instructions or reveal other users&rsquo; data;</li>
          <li>disrupt, overload, scrape, reverse-engineer or misuse the platform with automated tools.</li>
        </ul>
        <p>We may suspend or remove access if these Terms are violated or if continued access creates legal, security or operational risk.</p>
      </>
    ),
  },
  {
    id: "availability",
    title: "Beta service, availability and liability",
    body: (
      <>
        <p>
          VTA is a beta service provided <strong>&ldquo;as is&rdquo; and &ldquo;as available&rdquo;</strong>. Features may change or be withdrawn, and the service may be
          unavailable at times. We do not promise uninterrupted access or that any answer is accurate or suitable for a particular purpose.
        </p>
        <p>
          To the extent permitted by law, VTA and its project team are not liable for losses resulting from reliance on AI-generated answers,
          unauthorized use of an account, or materials uploaded by users.
        </p>
      </>
    ),
  },
  {
    id: "independent",
    title: "Independent platform and grant support",
    body: (
      <>
        <p>VTA is independently hosted and is not connected to any learning management system.</p>
        <p>
          VTA was developed through research supported by the NVIDIA Academic Grant Program. NVIDIA does not operate VTA, provide its responses, or
          control its data practices. Grant support does not imply NVIDIA&rsquo;s endorsement of the platform.
        </p>
      </>
    ),
  },
  {
    id: "ending",
    title: "Ending your use and deleting data",
    body: (
      <p>
        You can stop using VTA at any time. To have your account and its data deleted, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>{" "}
        from the address registered on the account. What is deleted, and what may remain, is described in the <Link href="/privacy#retention">Privacy Policy</Link>.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these Terms",
    body: (
      <p>
        We may update these Terms as VTA develops. The updated Terms will be posted on this page with a new effective date. Continuing to use VTA
        after an update means you accept the updated Terms.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about these Terms: {CONTACT_NAME}, <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro="The rules for using VTA as a teacher or a student, including the usage limits that apply to every account."
      sections={sections}
      other={{ href: "/privacy", label: "Privacy Policy" }}
    />
  );
}
