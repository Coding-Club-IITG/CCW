import type { Metadata } from "next";

import { pageMetadata, SITE_URL } from "@/lib/seo/metadata";

import PageHeader from "@/components/public/PageHeader";

import styles from "./Privacy.module.scss";

export const metadata: Metadata = pageMetadata({
  title: "Privacy Policy",
  description:
    "How Coding Club IITG handles personal information and Google sign-in data, and how to request deletion.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <>
      <PageHeader
        kicker="Coding Club IIT Guwahati"
        title="Privacy Policy"
        lead="How we handle your information and the choices you have."
      />
      <div className={styles.page}>
        <article className={styles.policy} aria-label="Privacy policy">
          <p className={styles.updated}>
            Last updated: <time dateTime="2026-10-01">1 October 2026</time>
          </p>
          <p>
            Coding Club IIT Guwahati operates{" "}
            <a href={SITE_URL}>codingclub.in</a>. This policy explains how we
            handle your information when you use our website.
          </p>

          <section aria-labelledby="information">
            <h2 id="information">Information we collect</h2>
            <p>
              Google sign-in uses the <code>openid</code>, <code>email</code>,
              and <code>profile</code> permissions to access your name, email,
              verification status, account identifier, and profile picture. We
              may store authentication tokens Google provides. We do not access
              your Google password, Gmail, Drive, Contacts, or Calendar.
            </p>
            <p>
              We also collect information you provide, basic account and
              activity records, and technical details such as your IP address
              and browser information to operate and secure the website.
            </p>
          </section>

          <section aria-labelledby="use">
            <h2 id="use">How we use and share information</h2>
            <p>
              We use Google data to verify your identity and manage sign-in and
              account access. Other information supports club services,
              communication, and security. Relevant details may be visible to
              club administrators and members. Published profiles and
              contributions are public.
            </p>
            <p>
              Service providers process information needed for authentication,
              hosting, storage, and notifications. We may also disclose
              information for legal or security reasons. We do not sell personal
              data or use Google data for advertising or AI model training. Our
              use and transfer of Google data follows the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy">
                Google API Services User Data Policy
              </a>
              , including applicable Limited Use requirements.
            </p>
          </section>

          <section aria-labelledby="storage">
            <h2 id="storage">Storage, security, and cookies</h2>
            <p>
              Information is stored in our server-side databases and file
              storage. We use HTTPS and access controls to protect it. Cookies
              and browser storage support sign-in and remember preferences. You
              can clear them in your browser, which may sign you out or reset
              preferences.
            </p>
          </section>

          <section aria-labelledby="retention">
            <h2 id="retention">Retention and your choices</h2>
            <p>
              We retain account and Google sign-in data while your account
              remains active or until a deletion request is processed. Some
              shared content and records may remain for club history, security,
              or legal needs. You can request access, correction, or deletion
              using the email link in our <a href="#contact">footer</a>. We may
              verify your identity before acting.
            </p>
            <p>
              You can revoke Google access through your{" "}
              <a href="https://myaccount.google.com/connections">
                Google Account connections
              </a>
              . This does not automatically delete data already stored by us.
            </p>
          </section>

          <section aria-labelledby="updates">
            <h2 id="updates">Updates and contact</h2>
            <p>
              We will update this page when our practices change and obtain any
              required consent before new uses of Google data. For privacy
              questions or data requests, see the contact links in our{" "}
              <a href="#contact">footer</a>.
            </p>
          </section>
        </article>
      </div>
    </>
  );
}
