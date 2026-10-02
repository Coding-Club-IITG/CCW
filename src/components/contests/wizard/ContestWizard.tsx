"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { parseDateTimeInput } from "@/lib/shared/dates";
import { problemAllocationError } from "@/lib/contests/problemAllocation";
import { validateStep, createBracketContest } from "@/lib/actions/contests";

import { useRuntimeConfig } from "@/components/layout/Providers";
import type {
  ContestWizardForm,
  ContestCreationPreset,
} from "@/components/contests/contestCreationForm";
import Button from "@/components/shared/Button";
import BackLink from "@/components/shared/BackLink";
import { useToast } from "@/components/shared/Toast";

import styles from "./ContestWizard.module.scss";
import Step1BasicInfo from "./steps/Step1BasicInfo";
import Step2Registration from "./steps/Step2Registration";
import Step3MatchPreset from "./steps/Step3MatchPreset";
import Step3aFineTuned from "./steps/Step3aFineTuned";
import Step4BracketSettings from "./steps/Step4BracketSettings";
import Step5Preview from "./steps/Step5Preview";

interface ContestWizardProps {
  presets: ContestCreationPreset[];
}

export default function ContestWizard({ presets }: ContestWizardProps) {
  const router = useRouter();
  const { contestDefaultMatchMinutes, contestDefaultBlitzProblemMinutes } =
    useRuntimeConfig();
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<ContestWizardForm>({
    name: "",
    description: "",
    mode: "blitz",
    format: "bracket",
    startTime: "",
    teamSize: 1,
    registrationType: "open",
    maxParticipants: 8,
    entrantCapacity: 8,
    presetId: "",
    problemSelectionMode: "bulk",
    problemSlots: [] as {
      platform: string;
      problemId: string;
      roundNumber: number;
    }[],

    overallDurationMinutes: contestDefaultMatchMinutes,
    perProblemDurationMinutes: contestDefaultBlitzProblemMinutes,
    spectatorRestriction: "none",
  });

  const selectedPreset = presets.find((p) => p._id === formData.presetId);
  const isFineTuned = selectedPreset?.problemSelectionMode === "fine-tuned";

  const steps = [
    { number: 1, id: "basic", title: "Basic Info" },
    { number: 2, id: "reg", title: "Registration" },
    { number: 3, id: "preset", title: "Match Preset" },
    ...(isFineTuned
      ? [{ number: 4, id: "problems", title: "Round Problems" }]
      : []),
    { number: isFineTuned ? 5 : 4, id: "settings", title: "Bracket Settings" },
    { number: isFineTuned ? 6 : 5, id: "preview", title: "Preview" },
  ];
  const maxStep = steps.length;

  function updateFields(fields: Partial<typeof formData>) {
    setFormData((prev) => {
      let newProblemSlots = prev.problemSlots;

      if (fields.presetId !== undefined && fields.presetId !== prev.presetId) {
        newProblemSlots = [];
        const preset = presets.find((item) => item._id === fields.presetId);

        fields.problemSelectionMode = preset?.problemSelectionMode ?? "bulk";
        fields.bulkProblemCount = preset?.bulkProblemCount ?? 3;
        fields.overallDurationMinutes =
          preset?.overallDurationMinutes ??
          (preset?.durationSeconds
            ? preset.durationSeconds / 60
            : contestDefaultMatchMinutes);
        fields.perProblemDurationMinutes = preset?.perProblemDurationMinutes;
      }

      return {
        ...prev,
        ...fields,
        maxParticipants:
          (fields.entrantCapacity ?? prev.entrantCapacity) *
          (fields.teamSize ?? prev.teamSize),
        problemSlots: fields.problemSlots ?? newProblemSlots,
      };
    });

    // Clear errors for fields as they are edited
    const updatedErrors = { ...errors };

    Object.keys(fields).forEach((key) => {
      delete updatedErrors[key];
    });
    setErrors(updatedErrors);
  }

  async function handleNext() {
    if (steps[currentStep - 1]?.id === "problems") {
      const error = problemAllocationError(formData);

      if (error) {
        toast.error(error);
        return;
      }
    }

    setIsSubmitting(true);

    try {
      const result = await validateStep(currentStep, {
        ...formData,
        startTime: parseDateTimeInput(formData.startTime)?.toISOString() ?? "",
      });

      if (!result.ok) {
        toast.error(result.error.message);
      } else if (!result.data.valid) {
        setErrors(result.data.errors);
      } else {
        setErrors({});
        setCurrentStep((prev) => prev + 1);
      }
    } catch {
      toast.error("Validation failed");
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleBack() {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      setErrors({});
    }
  }

  async function handleCreate() {
    const allocationError = problemAllocationError(formData);

    if (allocationError) {
      toast.error(allocationError);
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createBracketContest({
        ...formData,
        startTime: parseDateTimeInput(formData.startTime)?.toISOString() ?? "",
      });

      if (!result.ok) {
        toast.error(result.error.message);
      } else {
        toast.success("Contest created successfully!");
        router.push(`/internal/contests`);
      }
    } catch {
      toast.error("Failed to create contest");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.wizardContainer}>
      <BackLink href="/internal/contests" label="Back to Contests" />
      <h1 className={styles.wizardTitle}>Create Bracket Tournament</h1>

      {/* Progress Tracker */}
      <ol
        className={styles.progressTracker}
        aria-label="Tournament creation progress"
      >
        {steps.map((step) => (
          <li
            aria-current={currentStep === step.number ? "step" : undefined}
            key={step.number}
            className={`${styles.step} ${currentStep === step.number ? styles.active : ""} ${
              currentStep > step.number ? styles.completed : ""
            }`}
          >
            <div className={styles.circle}>
              {String(step.number).padStart(2, "0")}
            </div>
            <div className={styles.label}>{step.title}</div>
          </li>
        ))}
      </ol>

      {/* Step Content */}
      <div className={styles.stepContent}>
        {steps[currentStep - 1]?.id === "basic" && (
          <Step1BasicInfo
            name={formData.name}
            description={formData.description}
            mode={formData.mode}
            teamSize={formData.teamSize}
            updateFields={updateFields}
            errors={errors}
          />
        )}
        {steps[currentStep - 1]?.id === "reg" && (
          <Step2Registration
            registrationType={formData.registrationType}
            spectatorRestriction={formData.spectatorRestriction}
            entrantCapacity={formData.entrantCapacity}
            startTime={formData.startTime}
            updateFields={updateFields}
            errors={errors}
          />
        )}
        {steps[currentStep - 1]?.id === "preset" && (
          <Step3MatchPreset
            presets={presets}
            selectedPresetId={formData.presetId}
            updateFields={updateFields}
            errors={errors}
          />
        )}
        {steps[currentStep - 1]?.id === "problems" && (
          <Step3aFineTuned
            entrantCapacity={formData.entrantCapacity}
            bracketType={formData.bracketType}
            problemSlots={formData.problemSlots}
            updateFields={updateFields}
            errors={errors}
            preset={selectedPreset}
          />
        )}
        {steps[currentStep - 1]?.id === "settings" && (
          <Step4BracketSettings
            bracketType={formData.bracketType}
            updateFields={updateFields}
          />
        )}
        {steps[currentStep - 1]?.id === "preview" && (
          <Step5Preview formData={formData} presets={presets} />
        )}
      </div>

      {/* Controls */}
      <div className={styles.wizardControls}>
        {currentStep > 1 && (
          <Button
            onClick={handleBack}
            variant="secondary"
            disabled={isSubmitting}
          >
            Back
          </Button>
        )}
        <div className={styles.spacer} />
        {currentStep < maxStep ? (
          <Button
            onClick={handleNext}
            variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Validating..." : "Next"}
          </Button>
        ) : (
          <Button
            onClick={handleCreate}
            variant="primary"
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Tournament"}
          </Button>
        )}
      </div>
    </div>
  );
}
