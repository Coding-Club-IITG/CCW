import Link from "next/link";
import styles from "./Home.module.scss";
import type { Metadata } from "next";
import JsonLd from "@/components/shared/JsonLd";
import {
  CLUB_EMAIL,
  IITG_ADDRESS,
  pageMetadata,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_URL,
  SOCIAL_PROFILES,
} from "@/lib/seo";

export const metadata: Metadata = {
  ...pageMetadata({
    title: SITE_NAME,
    description: SITE_DESCRIPTION,
    path: "/",
  }),
  title: { absolute: SITE_NAME },
};

interface Props {
  searchParams: Promise<{ error?: string }>;
}

export default async function Home({ searchParams }: Props) {
  const { error } = await searchParams;
  const isUnauthorized = error === "unauthorized";

  return (
    <div className={styles.container}>
      <JsonLd
        data={[
          {
            "@context": "https://schema.org",
            "@type": "Organization",
            name: SITE_NAME,
            url: SITE_URL,
            email: CLUB_EMAIL,
            address: { "@type": "PostalAddress", ...IITG_ADDRESS },
            sameAs: SOCIAL_PROFILES,
          },
          {
            "@context": "https://schema.org",
            "@type": "WebSite",
            name: SITE_NAME,
            url: SITE_URL,
            description: SITE_DESCRIPTION,
          },
        ]}
      />
      {isUnauthorized && (
        <div className={styles.errorBanner}>
          <strong>Access denied.</strong> Your account is not authorised to use
          this application.
        </div>
      )}
      {/* TODO */}
      <div className={styles.wipBanner} role="status">
        <strong>Work in progress:</strong> This website is still under heavy
        development.
      </div>

      <h1 className={styles.title}>Coding Club IITG</h1>
      <p className={styles.subtitle}>
        The heartbeat of technology and innovation at IIT Guwahati. We build, we
        learn, and we excel together.
      </p>
      <div className={styles.actions}>
        <Link href="/blog" className={styles.primaryBtn}>
          View the Blog
        </Link>
        <Link href="/events" className={styles.secondaryBtn}>
          Club Events
        </Link>
        <Link href="/projects" className={styles.secondaryBtn}>
          Explore Projects
        </Link>
        <Link href="/team" className={styles.secondaryBtn}>
          Meet the Team
        </Link>
      </div>
      <div className={styles.features}>
        <div className={styles.featureCard}>
          <h3>Software Development</h3>
          <p>Building scalable solutions and modern applications.</p>
        </div>
        <div className={styles.featureCard}>
          <h3>Competitive Programming</h3>
          <p>
            Sharpening problem-solving skills through algorithmic contests and
            challenges.
          </p>
        </div>
        <div className={styles.featureCard}>
          <h3>Machine Learning</h3>
          <p>Harnessing the power of data and artificial intelligence.</p>
        </div>
        <div className={styles.featureCard}>
          <h3>Cybersecurity</h3>
          <p>Securing the digital frontier and exploring vulnerabilities.</p>
        </div>
        <div className={styles.featureCard}>
          <h3>Design</h3>
          <p>
            Crafting intuitive interfaces and compelling visual experiences.
          </p>
        </div>
      </div>
    </div>
  );
}
