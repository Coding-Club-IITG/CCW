import { MODULES } from "@/lib/constants";
import type { RecruitmentModuleDto } from "@/lib/recruitment";

export function emptyRecruitmentModules(): RecruitmentModuleDto[] {
  return MODULES.map((module) => ({
    module,
    resources: { releaseAt: null, document: null },
    task: { releaseAt: null, document: null },
    submissionDeadline: null,
  }));
}

/** A small, valid PDF with a link annotation for native-viewer verification. */
export function recruitmentPdf() {
  const content =
    "BT /F1 24 Tf 50 730 Td (Coding Week) Tj 0 -45 Td /F1 14 Tf (Resources and task instructions) Tj 0 -40 Td (Open the submission link below.) Tj 0 -45 Td (Submit your task) Tj ET";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R /Annots [6 0 R] >>",
    `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    "<< /Type /Annot /Subtype /Link /Rect [50 596 230 616] /Border [0 0 1] /A << /S /URI /URI (https://example.com/submit) >> >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`)
    .join(
      "",
    )}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
