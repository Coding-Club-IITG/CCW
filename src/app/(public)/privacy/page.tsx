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
            Last updated: <time dateTime="2026-10-09">9 October 2026</time>
          </p>
          <p>
            Coding Club IIT Guwahati operates{" "}
            <a href={SITE_URL}>codingclub.in</a>. This policy explains how we
            handle your information when you use our website.
          </p>

          <section aria-labelledby="information">
            <h2 id="information">Information we collect</h2>
            <p>
              We collect information you submit, account activity, and technical
              records such as IP addresses and browser details.
            </p>
            <p>
              Google sign-in provides your name, email, verification status,
              account identifier, and profile picture. We may store Google
              authentication tokens, but do not access your password, Gmail,
              Drive, Contacts, or Calendar.
            </p>
          </section>

          <section aria-labelledby="use">
            <h2 id="use">How we use and share information</h2>
            <p>
              We use this information to provide club services, manage access,
              communicate with members, secure the website, and estimate public
              page visits. Relevant information is available to club
              administrators, members, and service providers as needed for these
              purposes. Published profiles and contributions are public.
            </p>
            <p>
              We may disclose information for legal or security reasons, but do
              not sell personal data. Google data is used for sign-in and
              account access, not advertising or AI model training, in
              accordance with the{" "}
              <a href="https://developers.google.com/terms/api-services-user-data-policy">
                Google API Services User Data Policy
              </a>
              , including applicable Limited Use requirements.
            </p>
          </section>

          <section aria-labelledby="storage">
            <h2 id="storage">Storage, security, and cookies</h2>
            <p>
              We store information in server-side databases and file storage,
              protected by HTTPS and access controls. Cookies and browser
              storage keep you signed in, remember preferences, and distinguish
              browsers for visitor estimates.
            </p>
          </section>

          <section aria-labelledby="retention">
            <h2 id="retention">Retention and your choices</h2>
            <p>
              Account and sign-in data are retained while your account is active
              or until we process a deletion request. Public-page usage records
              are kept for 90 days. Shared content and records needed for club
              history, security, or legal purposes may be retained longer.
            </p>
            <p>
              You can clear or block cookies in your browser, which may affect
              sign-in and preferences. Blocking the visitor cookie or enabling
              Do Not Track or Global Privacy Control stops analytics collection.
              You can also revoke Google access through{" "}
              <a href="https://myaccount.google.com/connections">
                Google Account connections
              </a>
              , though this does not delete information already stored by us.
            </p>
          </section>

          <section aria-labelledby="updates">
            <h2 id="updates">Updates and contact</h2>
            <p>
              We update this policy when our practices change and obtain any
              required consent for new uses of Google data. For privacy
              questions or requests to access, correct, or delete your data,
              contact us (see the <a href="#contact">footer</a>). We may verify
              your identity before acting on a request.
            </p>
          </section>
        </article>
      </div>
    </>
  );
}
