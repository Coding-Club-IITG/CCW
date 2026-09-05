import { getAdminRecruitments } from "@/lib/recruitment.server";

import AdminPageHeader from "@/components/admin/AdminPageHeader";

import RecruitmentList from "./RecruitmentList";

export default async function RecruitmentAdminPage() {
  const editions = await getAdminRecruitments();
  return (
    <>
      <AdminPageHeader
        title="Recruitment"
        lead="Configure Coding Week editions."
      />
      <RecruitmentList editions={editions} />
    </>
  );
}
