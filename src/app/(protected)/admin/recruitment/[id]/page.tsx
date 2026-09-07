import { notFound } from "next/navigation";

import { objectIdParamsSchema } from "@/lib/api/schemas/boundary";
import { getAdminRecruitment } from "@/lib/recruitment.server";

import AdminPageHeader from "@/components/admin/AdminPageHeader";
import BackLink from "@/components/shared/BackLink";

import RecruitmentEditor from "./RecruitmentEditor";

export default async function RecruitmentEditPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const parsed = objectIdParamsSchema.safeParse(await params);
  if (!parsed.success) notFound();
  const edition = await getAdminRecruitment(parsed.data.id);
  if (!edition) notFound();
  return (
    <>
      <AdminPageHeader
        title="Configure recruitment"
        lead="Add dates and documents whenever they are ready."
      />
      <BackLink href="/admin/recruitment" label="All recruitment editions" />
      <RecruitmentEditor initialEdition={edition} />
    </>
  );
}
