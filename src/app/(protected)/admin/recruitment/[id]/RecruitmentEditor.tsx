"use client";

import { FileText, Upload } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useRef, useState, type CSSProperties } from "react";

import { appErrorMessage, expectAppData } from "@/lib/api/result";
import {
  recruitmentPdfSchema,
  type RecruitmentPatch,
} from "@/lib/api/schemas/recruitment";
import {
  IST_OFFSET_MS,
  MODULE_ACCENTS,
  MODULE_BARS,
  RECRUITMENT_DOCUMENT_KINDS,
  RECRUITMENT_MAX_YEAR,
  RECRUITMENT_MIN_YEAR,
  type ModuleName,
  type RecruitmentDocumentKind,
  type RecruitmentSeason,
} from "@/lib/constants";
import {
  isDocumentReleased,
  recruitmentDocumentUrl,
  type RecruitmentDto,
  type RecruitmentSlotDto,
} from "@/lib/recruitment";

import { useConfirm } from "@/components/shared/useConfirm";
import InlineNotice from "@/components/shared/InlineNotice";

import EditionFields from "../EditionFields";
import styles from "../Recruitment.module.scss";

function dateInput(value: string | null) {
  if (!value) return "";
  return new Date(new Date(value).getTime() + IST_OFFSET_MS)
    .toISOString()
    .slice(0, 16);
}

function ScheduleField({
  label,
  value,
  busy,
  save,
}: {
  label: string;
  value: string | null;
  busy: boolean;
  save: (value: string | null) => Promise<boolean>;
}) {
  const id = useId();
  const [input, setInput] = useState(dateInput(value));
  return (
    <form
      className={styles.dateForm}
      onSubmit={(event) => {
        event.preventDefault();
        void save(input ? new Date(`${input}:00+05:30`).toISOString() : null);
      }}
    >
      <div className={styles.field}>
        <label htmlFor={id}>{label} · IST</label>
        <input
          id={id}
          type="datetime-local"
          min={`${RECRUITMENT_MIN_YEAR}-01-01T00:00`}
          max={`${RECRUITMENT_MAX_YEAR}-12-31T23:59`}
          value={input}
          disabled={busy}
          onChange={(event) => setInput(event.target.value)}
        />
      </div>
      <div className={styles.actions}>
        <button
          className={styles.secondary}
          disabled={busy || input === dateInput(value)}
        >
          Save date
        </button>
        <button
          type="button"
          className={styles.textButton}
          disabled={busy || (!value && !input)}
          onClick={async () => {
            if (value) {
              if (await save(null)) setInput("");
            } else setInput("");
          }}
        >
          Clear
        </button>
      </div>
    </form>
  );
}

function UploadSlot({
  slot,
  kind,
  module,
  editionStatus,
  busy,
  upload,
  remove,
}: {
  slot: RecruitmentSlotDto;
  kind: RecruitmentDocumentKind;
  module: ModuleName;
  editionStatus: RecruitmentDto["status"];
  busy: boolean;
  upload: (file: File) => Promise<boolean>;
  remove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState("");
  function select(file: File | undefined) {
    if (!file) return;
    const parsed = recruitmentPdfSchema.safeParse(file);
    if (!parsed.success) {
      setFile(null);
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    setFile(file);
  }
  return (
    <div>
      {slot.document && (
        <div className={styles.uploaded}>
          <FileText size={18} aria-hidden="true" />
          <span>{slot.document.originalName}</span>
          <button
            type="button"
            className={styles.textButton}
            disabled={busy}
            onClick={remove}
          >
            Remove PDF
          </button>
        </div>
      )}
      {isDocumentReleased({ status: editionStatus }, slot) && slot.document && (
        <a
          className={styles.previewLink}
          href={recruitmentDocumentUrl(slot.document._id)}
          target="_blank"
          rel="noopener noreferrer"
        >
          Open published PDF
        </a>
      )}
      <button
        type="button"
        className={styles.dropZone}
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          if (!busy) select(event.dataTransfer.files[0]);
        }}
        aria-label={`Choose ${module} ${kind} PDF`}
      >
        <Upload size={20} aria-hidden="true" />
        <span>
          {file
            ? file.name
            : slot.document
              ? "Choose a replacement PDF"
              : "Choose or drop a PDF"}
        </span>
        <small>PDF · up to 20 MB</small>
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => {
          select(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {file && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.secondary}
            disabled={busy}
            onClick={async () => {
              if (await upload(file)) setFile(null);
            }}
          >
            {slot.document ? "Replace PDF" : "Upload PDF"}
          </button>
          <button
            type="button"
            className={styles.textButton}
            disabled={busy}
            onClick={() => setFile(null)}
          >
            Cancel
          </button>
        </div>
      )}
      {error && (
        <div className={styles.feedback}>
          <InlineNotice tone="error">{error}</InlineNotice>
        </div>
      )}
    </div>
  );
}

export default function RecruitmentEditor({
  initialEdition,
}: {
  initialEdition: RecruitmentDto;
}) {
  const router = useRouter();
  const { confirm, confirmDialog } = useConfirm();
  const [edition, setEdition] = useState(initialEdition);
  const [year, setYear] = useState(edition.year);
  const [season, setSeason] = useState<RecruitmentSeason>(edition.season);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const api = `/api/admin/recruitment/${edition._id}`;

  async function mutate(
    url: string,
    init: RequestInit,
    message: string,
  ): Promise<boolean> {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      setEdition(await expectAppData<RecruitmentDto>(await fetch(url, init)));
      setNotice(message);
      return true;
    } catch (error) {
      setError(appErrorMessage(error, "Could not save this change."));
      return false;
    } finally {
      setBusy(false);
    }
  }
  const patch = (data: RecruitmentPatch, message = "Saved.") =>
    mutate(
      api,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      },
      message,
    );
  const saveDate = (
    module: ModuleName,
    field: "resourcesReleaseAt" | "taskReleaseAt" | "submissionDeadline",
    value: string | null,
  ) =>
    patch(
      { modules: [{ module, [field]: value }] },
      value ? "Date saved." : "Date cleared.",
    );

  async function removePdf(module: ModuleName, kind: RecruitmentDocumentKind) {
    if (
      !(await confirm({
        title: "Remove this PDF?",
        description: `Remove ${module} ${kind}.`,
        confirmLabel: "Remove PDF",
        variant: "danger",
      }))
    )
      return;
    await mutate(
      `${api}/documents`,
      {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ module, kind }),
      },
      "PDF removed.",
    );
  }

  return (
    <div className={styles.editor}>
      <div className={styles.editionHeading}>
        <h2>{edition.label}</h2>
        <span className={styles.badge}>{edition.status}</span>
        {edition.status === "published" && (
          <Link
            href={`/recruitment?edition=${edition.slug}`}
            className={styles.previewLink}
          >
            View public edition ↗
          </Link>
        )}
      </div>
      <form
        className={styles.editionForm}
        onSubmit={(event) => {
          event.preventDefault();
          void patch(
            {
              ...(year !== edition.year ? { year } : {}),
              ...(season !== edition.season ? { season } : {}),
            },
            "Edition details saved.",
          );
        }}
      >
        <EditionFields
          year={year}
          season={season}
          disabled={busy}
          onYearChange={setYear}
          onSeasonChange={setSeason}
        />
        <button
          className={styles.secondary}
          disabled={
            busy || (year === edition.year && season === edition.season)
          }
        >
          Save edition details
        </button>
      </form>
      <div className={styles.publishRow}>
        <div>
          <p>Every date and PDF can be added/cleared independently.</p>
          <p className={styles.hint}>
            Published editions appear immediately. A document becomes public
            only when it is uploaded and its release time has arrived.
          </p>
        </div>
        <button
          type="button"
          className={styles.primary}
          disabled={busy}
          onClick={() =>
            void patch(
              { status: edition.status === "draft" ? "published" : "draft" },
              edition.status === "draft"
                ? "Edition published."
                : "Edition moved to draft.",
            )
          }
        >
          {edition.status === "draft" ? "Publish edition" : "Move to draft"}
        </button>
      </div>
      <div className={styles.feedback}>
        {error ? (
          <InlineNotice tone="error">{error}</InlineNotice>
        ) : (
          (busy || notice) && (
            <InlineNotice tone={busy ? "info" : "success"}>
              {busy ? "Saving…" : notice}
            </InlineNotice>
          )
        )}
      </div>
      {edition.modules.map((module, index) => (
        <section
          key={module.module}
          className={styles.module}
          style={
            {
              "--accent": MODULE_ACCENTS[module.module],
              "--bar": MODULE_BARS[module.module],
            } as CSSProperties
          }
        >
          <h3>
            <span>{String(index + 1).padStart(2, "0")}</span>
            {module.module}
          </h3>
          <div className={styles.moduleFields}>
            {RECRUITMENT_DOCUMENT_KINDS.map((kind) => (
              <div className={styles.slot} key={kind}>
                <h4>{kind === "resources" ? "Resources" : "Task"}</h4>
                <UploadSlot
                  slot={module[kind]}
                  kind={kind}
                  module={module.module}
                  editionStatus={edition.status}
                  busy={busy}
                  remove={() => void removePdf(module.module, kind)}
                  upload={async (file) => {
                    if (
                      module[kind].document &&
                      !(await confirm({
                        title: "Replace this PDF?",
                        description: `The current ${kind} PDF will be replaced.`,
                        confirmLabel: "Replace PDF",
                        variant: "danger",
                      }))
                    )
                      return false;
                    const body = new FormData();
                    body.append("module", module.module);
                    body.append("kind", kind);
                    body.append("file", file);
                    return mutate(
                      `${api}/documents`,
                      { method: "POST", body },
                      "PDF saved.",
                    );
                  }}
                />
                <ScheduleField
                  key={module[kind].releaseAt ?? "unset"}
                  label={`${kind === "resources" ? "Resources" : "Task"} release`}
                  value={module[kind].releaseAt}
                  busy={busy}
                  save={(value) =>
                    saveDate(module.module, `${kind}ReleaseAt`, value)
                  }
                />
              </div>
            ))}
            <div className={styles.slot}>
              <h4>Submissions</h4>
              <p className={styles.hint}>
                Submission instructions belong in the task PDF.
              </p>
              <ScheduleField
                key={module.submissionDeadline ?? "unset"}
                label="Submission deadline"
                value={module.submissionDeadline}
                busy={busy}
                save={(value) =>
                  saveDate(module.module, "submissionDeadline", value)
                }
              />
            </div>
          </div>
        </section>
      ))}
      <div className={styles.deleteRow}>
        <p className={styles.hint}>
          Deleting an edition permanently removes all documents and public page
          entry.
        </p>
        <button
          className={styles.danger}
          type="button"
          disabled={busy}
          onClick={async () => {
            if (
              !(await confirm({
                title: `Delete ${edition.label}?`,
                description:
                  "This permanently deletes the edition and all documents.",
                confirmLabel: "Delete edition",
                variant: "danger",
              }))
            )
              return;
            setBusy(true);
            setError("");
            try {
              await expectAppData(await fetch(api, { method: "DELETE" }));
              router.push("/admin/recruitment");
              router.refresh();
            } catch (error) {
              setError(appErrorMessage(error, "Could not delete the edition."));
              setBusy(false);
            }
          }}
        >
          Delete edition
        </button>
      </div>
      {confirmDialog}
    </div>
  );
}
