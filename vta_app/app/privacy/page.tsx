import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/Legal";
import { CONTACT_EMAIL, CONTACT_NAME } from "@/lib/constants";

export const metadata: Metadata = { title: "Privacy Policy" };

const sections: LegalSection[] = [
  {
    id: "who",
    title: "Who we are",
    body: (
      <p>
        VTA — Virtual Teaching Assistant — is an independently hosted beta educational platform led by {CONTACT_NAME}. This policy explains what
        information VTA collects, how it is used and shared, and the choices you have. It applies to both teacher and student accounts. Please read it
        together with the <Link href="/terms">Terms of Service</Link>.
      </p>
    ),
  },
  {
    id: "collect",
    title: "Information we collect",
    body: (
      <>
        <p><strong>All users</strong></p>
        <ul>
          <li>Account details: your name, email address, account type (teacher or student), and your password, which is stored only as a salted hash — we cannot read it.</li>
          <li>Which version of the Terms you accepted and when.</li>
          <li>A sign-in token kept in your browser&rsquo;s local storage so you stay signed in until it expires or you sign out. VTA does not use advertising cookies.</li>
        </ul>
        <p><strong>Teachers</strong></p>
        <ul>
          <li>Subject names and class codes.</li>
          <li>The documents you upload (file, file name, size and type), plus the text extracted from them, split into passages and converted into numerical embeddings used for search.</li>
          <li>The questions you ask when you test the assistant on your own materials, and its answers. These are saved as your own chat history and are not shown to students.</li>
        </ul>
        <p><strong>Students</strong></p>
        <ul>
          <li>The classes you join and how many questions you have used in each.</li>
          <li>Your questions, the answers VTA generated, the sources cited, and your saved chat sessions (your chat history).</li>
        </ul>
        <p>
          Hosting and server logs may also record technical data such as IP address and request times, depending on how the service is hosted.
          We do not collect payment information, and VTA does not include third-party advertising or analytics trackers.
        </p>
      </>
    ),
  },
  {
    id: "use",
    title: "How we use information",
    body: (
      <ul>
        <li>To create and secure your account and keep you signed in.</li>
        <li>To index teachers&rsquo; materials and generate answers to students&rsquo; questions from them.</li>
        <li>To enforce usage limits (for example, the per-class question allowance) and keep your chat history.</li>
        <li>To show teachers how their class uses the assistant, and to operate, protect and improve the platform.</li>
      </ul>
    ),
  },
  {
    id: "visibility",
    title: "Who can see what",
    body: (
      <ul>
        <li><strong>Teachers</strong> can see, for each student enrolled in their subjects: name, email address, when the student joined and was last active, the question count, and the full conversations in that subject — the questions asked, the answers generated, and the sources cited.</li>
        <li><strong>Students</strong> can see their teacher&rsquo;s name and email, read the subject&rsquo;s documents inside the app, and see their own chat history. Students cannot see other students&rsquo; questions or details.</li>
        <li>We do not sell personal information.</li>
      </ul>
    ),
  },
  {
    id: "providers",
    title: "Service providers and AI processing",
    body: (
      <>
        <p>
          VTA uses Google&rsquo;s Gemini API to understand documents and write answers. To do this, the following is sent to Google: the text of uploaded
          documents (and descriptions of any images in them) when they are indexed; and, each time a student or teacher asks a question, the question, up to the
          last several messages of that conversation, and the relevant passages retrieved from the class materials.
        </p>
        <p>
          Google processes that data under its own terms for the Gemini API. Because course materials and questions are sent to this provider, do not
          upload or type anything you are not permitted or willing to share with it. We also rely on infrastructure and hosting providers to run the
          platform. We do not otherwise share personal information except where required by law or to protect the platform and its users.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "Retention and deletion",
    body: (
      <ul>
        <li>We keep your information while your account is active, so that chat history and class data remain available.</li>
        <li><strong>Deleting a document</strong> removes the stored file and its indexed passages.</li>
        <li><strong>Deleting a subject</strong> removes its documents and indexed passages, its student enrolments and the chat history of that subject, including the teacher&rsquo;s own test chats. Question records kept for the teacher&rsquo;s usage statistics may remain, without a link to the subject, until the teacher account is deleted.</li>
        <li><strong>Deleting an account:</strong> email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from your registered address and we will delete the account and the data linked to it.</li>
        <li>Chat history is kept so students can return to it; it is not deleted when a question limit is reached.</li>
      </ul>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <p>
        Passwords are stored as salted hashes, sign-in sessions expire automatically, and access to teacher and student data is restricted by role and
        enrolment. No system is perfectly secure, so we cannot guarantee absolute security. Please choose a strong, unique password.
      </p>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: <p>VTA is not for children under 13, and we do not knowingly collect information from them. If you believe a child under 13 has registered, contact us and we will delete the account.</p>,
  },
  {
    id: "rights",
    title: "Your choices",
    body: (
      <p>
        You can read your chat history and, as a teacher, manage or delete your documents and subjects inside the app. To access, correct or delete
        other personal information, or to ask a question about this policy, email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
  {
    id: "independent",
    title: "Independent platform",
    body: (
      <>
        <p>VTA is independently hosted and is not connected to any learning management system, so no information is exchanged with one.</p>
        <p>
          VTA was developed through research supported by the NVIDIA Academic Grant Program. NVIDIA does not operate VTA or control its data practices.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes and contact",
    body: (
      <p>
        We may update this policy as VTA develops; the new version will be posted here with a revised effective date. Contact: {CONTACT_NAME},{" "}
        <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="What VTA collects, who can see it, which provider processes it, and how to have it deleted."
      sections={sections}
      other={{ href: "/terms", label: "Terms of Service" }}
    />
  );
}
