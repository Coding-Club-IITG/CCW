"use client";

import { useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  LoaderCircle,
  Pencil,
  Plus,
  Save,
  Trash2,
  UserRound,
} from "lucide-react";

import { getCredits, saveCredits } from "@/lib/actions/credits";
import { CreditSection } from "@/lib/credits";
import Button from "@/components/shared/Button";
import Modal from "@/components/shared/Modal";
import UserAvatar from "@/components/shared/UserAvatar";
import UserSearch from "@/components/shared/UserSearch";
import styles from "./CreditsModal.module.scss";

interface CreditsModalProps {
  canEdit: boolean;
  onClose: () => void;
}

function Avatar({ name, image }: { name: string; image: string | null }) {
  return (
    <UserAvatar
      name={name}
      image={image}
      size={32}
      imageClassName={styles.avatarImage}
      fallbackClassName={styles.avatarFallback}
    />
  );
}

function moveItem<T>(items: T[], index: number, direction: -1 | 1) {
  const target = index + direction;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

export default function CreditsModal({ canEdit, onClose }: CreditsModalProps) {
  const [sections, setSections] = useState<CreditSection[]>([]);
  const [draft, setDraft] = useState<CreditSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void getCredits().then((result) => {
      if (result.success) {
        setSections(result.data);
        setDraft(result.data);
      } else setError(result.error);
      setLoading(false);
    });
  }, []);

  const updateSection = (index: number, update: Partial<CreditSection>) =>
    setDraft((current) =>
      current.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...update } : section,
      ),
    );

  const save = async () => {
    setSaving(true);
    setError("");
    const result = await saveCredits(
      draft.map((section) => ({
        heading: section.heading,
        entries: section.entries.map(({ userId, period }) => ({
          userId,
          period,
        })),
      })),
    );
    if (result.success) {
      setSections(draft);
      setEditing(false);
    } else setError(result.error || "Failed to save credits.");
    setSaving(false);
  };

  const footer = editing ? (
    <>
      <Button
        disabled={saving}
        onClick={() => {
          setDraft(sections);
          setEditing(false);
          setError("");
        }}
      >
        Cancel
      </Button>
      <Button variant="primary" disabled={saving} onClick={save}>
        {saving ? (
          <LoaderCircle className={styles.spinner} size={16} />
        ) : (
          <Save size={16} />
        )}
        {saving ? "Saving…" : "Save credits"}
      </Button>
    </>
  ) : canEdit && !loading ? (
    <Button
      onClick={() => {
        setDraft(sections);
        setEditing(true);
        setError("");
      }}
    >
      <Pencil aria-hidden="true" size={15} /> Edit credits
    </Button>
  ) : undefined;

  return (
    <Modal
      title="Credits"
      description="The people who helped build and maintain CCW."
      onClose={onClose}
      closeDisabled={saving}
      maxWidth={720}
      footer={footer}
    >
      {loading ? (
        <div className={styles.status}>
          <LoaderCircle className={styles.spinner} /> Loading credits…
        </div>
      ) : editing ? (
        <div className={styles.editor}>
          <Button
            className={styles.addSectionButton}
            onClick={() =>
              setDraft((current) => [{ heading: "", entries: [] }, ...current])
            }
          >
            <Plus aria-hidden="true" size={16} /> Add heading
          </Button>
          {draft.map((section, sectionIndex) => (
            <section className={styles.editSection} key={sectionIndex}>
              <div className={styles.editSectionHeader}>
                <input
                  value={section.heading}
                  onChange={(event) =>
                    updateSection(sectionIndex, { heading: event.target.value })
                  }
                  aria-label={`Heading ${sectionIndex + 1}`}
                  placeholder="Feature heading"
                  maxLength={80}
                />
                <div className={styles.rowActions}>
                  <Button
                    variant="ghost"
                    iconOnly
                    aria-label="Move heading up"
                    disabled={sectionIndex === 0}
                    onClick={() =>
                      setDraft((current) => moveItem(current, sectionIndex, -1))
                    }
                  >
                    <ChevronUp size={16} />
                  </Button>
                  <Button
                    variant="ghost"
                    iconOnly
                    aria-label="Move heading down"
                    disabled={sectionIndex === draft.length - 1}
                    onClick={() =>
                      setDraft((current) => moveItem(current, sectionIndex, 1))
                    }
                  >
                    <ChevronDown size={16} />
                  </Button>
                  <Button
                    variant="danger"
                    iconOnly
                    aria-label="Delete heading"
                    onClick={() =>
                      setDraft((current) =>
                        current.filter((_, index) => index !== sectionIndex),
                      )
                    }
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>

              <div className={styles.editEntries}>
                {section.entries.map((entry, entryIndex) => (
                  <div className={styles.editEntry} key={entry.userId}>
                    <div className={styles.person}>
                      <Avatar name={entry.name} image={entry.image} />
                      <span>{entry.name}</span>
                    </div>
                    <input
                      value={entry.period}
                      onChange={(event) =>
                        updateSection(sectionIndex, {
                          entries: section.entries.map((item, index) =>
                            index === entryIndex
                              ? { ...item, period: event.target.value }
                              : item,
                          ),
                        })
                      }
                      aria-label={`Time for ${entry.name}`}
                      placeholder="Eg. May-July 2026"
                      maxLength={80}
                    />
                    <div className={styles.rowActions}>
                      <Button
                        variant="ghost"
                        iconOnly
                        aria-label={`Move ${entry.name} up`}
                        disabled={entryIndex === 0}
                        onClick={() =>
                          updateSection(sectionIndex, {
                            entries: moveItem(section.entries, entryIndex, -1),
                          })
                        }
                      >
                        <ChevronUp size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        iconOnly
                        aria-label={`Move ${entry.name} down`}
                        disabled={entryIndex === section.entries.length - 1}
                        onClick={() =>
                          updateSection(sectionIndex, {
                            entries: moveItem(section.entries, entryIndex, 1),
                          })
                        }
                      >
                        <ChevronDown size={16} />
                      </Button>
                      <Button
                        variant="danger"
                        iconOnly
                        aria-label={`Remove ${entry.name}`}
                        onClick={() =>
                          updateSection(sectionIndex, {
                            entries: section.entries.filter(
                              (_, index) => index !== entryIndex,
                            ),
                          })
                        }
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
              <div className={styles.userSearch}>
                <UserSearch
                  excludedIds={section.entries.map((entry) => entry.userId)}
                  placeholder="Search existing users"
                  onSelect={(user) =>
                    updateSection(sectionIndex, {
                      entries: [
                        ...section.entries,
                        {
                          userId: user.id,
                          name: user.name,
                          image: user.image || null,
                          period: "",
                        },
                      ],
                    })
                  }
                />
              </div>
            </section>
          ))}
        </div>
      ) : sections.length === 0 ? (
        <div className={styles.empty}>
          <UserRound size={28} />
          <p>No credits have been added yet.</p>
        </div>
      ) : (
        <div className={styles.sections}>
          {sections.map((section, sectionIndex) => (
            <section
              className={styles.creditSection}
              key={`${section.heading}-${sectionIndex}`}
            >
              <h3>{section.heading}</h3>
              <div className={styles.entries}>
                {section.entries.map((entry) => (
                  <div className={styles.entry} key={entry.userId}>
                    <Avatar name={entry.name} image={entry.image} />
                    <div>
                      <strong>{entry.name}</strong>
                      <span>{entry.period}</span>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
    </Modal>
  );
}
