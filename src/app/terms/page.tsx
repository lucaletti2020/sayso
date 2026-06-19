import Link from "next/link";

export const metadata = {
  title: "Terms of Service — TalktheTalk",
};

const UPDATED = "19 June 2026";

function H({ children }: { children: React.ReactNode }) {
  return <h2 className="font-display text-2xl leading-tight mt-10 mb-3">{children}</h2>;
}
function P({ children }: { children: React.ReactNode }) {
  return <p className="text-sm leading-relaxed text-muted-foreground mb-3">{children}</p>;
}

export default function TermsPage() {
  return (
    <main className="grain min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-5 py-10 sm:px-8">
        <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>

        <h1 className="font-display text-4xl leading-tight mt-6 mb-1">Terms of Service</h1>
        <p className="text-xs text-muted-foreground mb-2">Last updated: {UPDATED}</p>
        <P>
          These Terms of Service (&ldquo;Terms&rdquo;) govern your use of TalktheTalk (the
          &ldquo;Service&rdquo;), operated by <strong>Sundae Education Technologies SL</strong>
          (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By using the Service, you agree to these Terms.
        </P>

        <H>1. Who we are</H>
        <P>
          Sundae Education Technologies SL, Carrer de Joan Oliver, 22D, 2-1, Sant Cugat del Vallès,
          08172, Spain. Contact: <a href="mailto:support@getsundae.ai" className="underline">support@getsundae.ai</a>.
        </P>

        <H>2. Eligibility</H>
        <P>You must be at least 18 years old to use the Service. By using it, you confirm that you are.</P>

        <H>3. The Service</H>
        <P>
          TalktheTalk creates a personalised English speaking course based on your professional
          profile and lets you practise work conversations with an AI partner, including pronunciation
          practice and automated feedback. The Service is <strong>currently free of charge</strong>.
          We may introduce paid features in the future; if we do, we will update these Terms and give
          you notice before any charges apply.
        </P>

        <H>4. Your account</H>
        <P>
          You sign in using a third-party provider (Google). You are responsible for activity under
          your account and for keeping your sign-in credentials secure.
        </P>

        <H>5. Acceptable use</H>
        <P>You agree not to:</P>
        <ul className="list-disc pl-5 text-sm leading-relaxed text-muted-foreground mb-3 flex flex-col gap-1">
          <li>use the Service for any unlawful purpose or in breach of these Terms;</li>
          <li>submit content that infringes others&rsquo; rights or that you have no right to share;</li>
          <li>attempt to disrupt, reverse-engineer, scrape, or gain unauthorised access to the Service;</li>
          <li>misuse the AI features, including attempts to generate harmful or abusive content.</li>
        </ul>

        <H>6. Your content</H>
        <P>
          You retain ownership of the content you provide (such as your profile details and what you
          say during practice). You grant us a limited licence to process this content solely to
          operate and provide the Service to you, as described in our{" "}
          <Link href="/privacy" className="underline">Privacy Policy</Link>.
        </P>

        <H>7. AI-generated content</H>
        <P>
          Courses, scenarios, practice sentences, pronunciation scores and feedback are generated
          automatically using AI and may contain errors or inaccuracies. They are provided for
          language-learning purposes only and do not constitute professional, linguistic, career, or
          other advice. Use your own judgement.
        </P>

        <H>8. Third-party services</H>
        <P>
          The Service relies on third-party providers (for authentication, hosting, AI, voice, and
          email). Your use of the Service may also be subject to their terms. We are not responsible
          for third-party services outside our control.
        </P>

        <H>9. Intellectual property</H>
        <P>
          The Service, including its software, design, and branding, is owned by Sundae Education
          Technologies SL and protected by intellectual property laws. These Terms do not grant you
          any rights to our trademarks or branding.
        </P>

        <H>10. Disclaimers</H>
        <P>
          The Service is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo;, without
          warranties of any kind, to the maximum extent permitted by law. We do not warrant that the
          Service will be uninterrupted, error-free, or that results will improve your English.
        </P>

        <H>11. Limitation of liability</H>
        <P>
          To the maximum extent permitted by law, we will not be liable for any indirect, incidental,
          or consequential damages arising from your use of the Service. Nothing in these Terms limits
          liability that cannot be limited under applicable law (including your statutory consumer
          rights under Spanish and EU law).
        </P>

        <H>12. Suspension and termination</H>
        <P>
          You may stop using the Service and request deletion of your account at any time by contacting
          us. We may suspend or terminate access if you breach these Terms or to protect the Service or
          other users.
        </P>

        <H>13. Changes</H>
        <P>
          We may update these Terms from time to time. We will post the updated version here and change
          the &ldquo;Last updated&rdquo; date. Continued use after changes means you accept them.
        </P>

        <H>14. Governing law and jurisdiction</H>
        <P>
          These Terms are governed by the laws of Spain. Disputes will be subject to the competent
          courts of Spain, without prejudice to any mandatory consumer-protection rights that allow you
          to bring proceedings in your country of residence.
        </P>

        <H>15. Contact</H>
        <P>
          Questions about these Terms? Email{" "}
          <a href="mailto:support@getsundae.ai" className="underline">support@getsundae.ai</a>.
        </P>

        <p className="mt-10 text-xs text-muted-foreground">
          <Link href="/privacy" className="underline">Privacy Policy</Link>
        </p>
      </div>
    </main>
  );
}
