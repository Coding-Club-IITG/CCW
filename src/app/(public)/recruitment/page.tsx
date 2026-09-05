import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";

import { getPublishedRecruitments } from "@/lib/recruitment.server";
import { ogImage, pageMetadata } from "@/lib/seo";
import { errorToLogMetadata, logger } from "@/lib/utils";

import EmptyState from "@/components/shared/EmptyState";
import InlineNotice from "@/components/shared/InlineNotice";
import EditionSwitcher from "@/components/public/recruitment/EditionSwitcher";
import ModuleDocuments from "@/components/public/recruitment/ModuleDocuments";
import RecruitmentHeader from "@/components/public/recruitment/RecruitmentHeader";
import RecruitmentSchedule from "@/components/public/recruitment/RecruitmentSchedule";
import styles from "@/components/public/recruitment/Recruitment.module.scss";

import RecruitmentLoading from "./RecruitmentLoading";

type Props = { searchParams: Promise<{ edition?: string | string[] }> };

const getPageData = cache(async (slug?: string | string[]) => {
  const now = new Date();
  try {
    const editions = await getPublishedRecruitments(now);
    const selected = slug
      ? editions.find((edition) => edition.slug === slug)
      : editions[0];
    return { editions, selected, now, failed: false };
  } catch (error) {
    logger.error("Failed to fetch recruitment editions", {
      route: "/recruitment",
      operation: "list_editions",
      ...errorToLogMetadata(error),
    });
    return { editions: [], selected: undefined, now, failed: true };
  }
});

export async function generateMetadata({ searchParams }: Props) {
  const query = await searchParams;
  const { selected } = await getPageData(query.edition);
  const title = selected ? `Coding Week · ${selected.label}` : "Coding Week";
  return pageMetadata({
    title,
    description:
      "Coding Club IITG recruitment: schedules, resources and tasks across all five modules.",
    path: selected ? `/recruitment?edition=${selected.slug}` : "/recruitment",
    image: ogImage(title, {
      kicker: "Recruitment",
      meta: "Five modules · Coding Club IITG",
    }),
  });
}

export default async function RecruitmentPage(props: Props) {
  if ((await headers()).get("sec-fetch-dest") === "empty") {
    return (
      <Suspense fallback={<RecruitmentLoading />}>
        <RecruitmentContent {...props} />
      </Suspense>
    );
  }
  return RecruitmentContent(props);
}

async function RecruitmentContent({ searchParams }: Props) {
  const query = await searchParams;
  const { editions, selected, now, failed } = await getPageData(query.edition);
  if (!failed && query.edition && !selected) notFound();
  return (
    <div className={styles.page}>
      <RecruitmentHeader />
      <div className={styles.content}>
        {failed ? (
          <div className={styles.loadError}>
            <InlineNotice tone="error">
              Unable to load recruitment. Please try again later.
            </InlineNotice>
          </div>
        ) : selected ? (
          <>
            <p className={styles.intro}>
              Each module publishes resources to explore before its task
              arrives. The task PDF includes the brief and submission
              instructions.
            </p>
            <section
              className={styles.guidelines}
              aria-labelledby="recruitment-guidelines"
            >
              <h2 id="recruitment-guidelines" className={styles.meta}>
                Before you begin
              </h2>
              <ul>
                <li>
                  <strong>Quality over quantity.</strong> One excellent
                  submission is worth more than several average ones.
                </li>
                <li>
                  <strong>AI for learning.</strong> We encourage AI for
                  exploring and understanding concepts, but not for completing
                  the task. Learning a new technical skill is a win, whether or
                  not you join the club.
                </li>
                <li>
                  <strong>Individual work.</strong> All submissions must be
                  completed individually.
                </li>
              </ul>
            </section>
            <EditionSwitcher editions={editions} selected={selected.slug} />
            <RecruitmentSchedule modules={selected.modules} />
            <ModuleDocuments modules={selected.modules} now={now} />
          </>
        ) : (
          <EmptyState
            title="The next Coding Week is on its way."
            hint="Recruitment schedules, resources and tasks will appear here when an edition is announced."
          />
        )}
      </div>
    </div>
  );
}
