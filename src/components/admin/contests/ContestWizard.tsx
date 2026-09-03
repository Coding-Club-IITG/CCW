"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import {
  validateStep,
  createBracketContest,
} from "@/lib/actions/admin/contests";
import BackLink from "@/components/shared/BackLink";
import Step1BasicInfo from "./steps/Step1BasicInfo";
import Step2Registration from "./steps/Step2Registration";
import Step3MatchPreset from "./steps/Step3MatchPreset";
import Step3aFineTuned from "./steps/Step3aFineTuned";
import Step4BracketSettings from "./steps/Step4BracketSettings";
import Step5Preview from "./steps/Step5Preview";
import styles from "./ContestWizard.module.scss";
import type {
  AdminContestWizardForm,
  ContestCreationPreset,
} from "@/components/contests/contestCreationForm";

interface ContestWizardProps {
  presets: ContestCreationPreset[];
}

export default function ContestWizard({ presets }: ContestWizardProps) {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<AdminContestWizardForm>({
    name: "",
    description: "",
    mode: "blitz",
    format: "bracket",
    startTime: "",
    teamSize: 1,
    registrationType: "open",
    maxParticipants: 8,
    presetId: "",
    problemSelectionMode: "bulk",
    problemSlots: [] as {
      platform: string;
      problemId: string;
      roundNumber: number;
    }[],
    thirdPlacePlayoff: false,
    seedingMethod: "cf_rating",
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
      }
      return {
        ...prev,
        ...fields,
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
    setIsSubmitting(true);
    try {
      const result = await validateStep(currentStep, formData);
      if (!result.ok) {
        alert(result.error.message);
      } else if (!result.data.valid) {
        setErrors(result.data.errors);
      } else {
        setErrors({});
        setCurrentStep((prev) => prev + 1);
      }
    } catch {
      alert("Validation failed");
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
    setIsSubmitting(true);
    try {
      const result = await createBracketContest(formData);
      if (!result.ok) {
        alert(result.error.message);
      } else {
        alert("Contest created successfully!");
        router.push(`/admin`);
      }
    } catch {
      alert("Failed to create contest");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className={styles.wizardContainer}>
      <BackLink href="/admin" label="Back to Administration" />
      <p className={styles.wizardKicker}>Administration</p>
      <h1 className={styles.wizardTitle}>Create Bracket Tournament</h1>

      {/* Progress Tracker */}
      <div className={styles.progressTracker}>
        {steps.map((step, index) => (
          <React.Fragment key={step.number}>
            <div
              className={`${styles.step} ${currentStep === step.number ? styles.active : ""} ${
                currentStep > step.number ? styles.completed : ""
              }`}
            >
              <div className={styles.circle}>
                {String(step.number).padStart(2, "0")}
              </div>
              <div className={styles.label}>{step.title}</div>
            </div>
            {index < steps.length - 1 && (
              <div
                className={`${styles.line} ${currentStep > step.number ? styles.completedLine : ""}`}
              />
            )}
          </React.Fragment>
        ))}
      </div>

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
            maxParticipants={formData.maxParticipants}
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
            maxParticipants={formData.maxParticipants}
            problemSlots={formData.problemSlots}
            updateFields={updateFields}
            errors={errors}
            preset={selectedPreset}
          />
        )}
        {steps[currentStep - 1]?.id === "settings" && (
          <Step4BracketSettings
            thirdPlacePlayoff={formData.thirdPlacePlayoff}
            seedingMethod={formData.seedingMethod}
            updateFields={updateFields}
            errors={errors}
          />
        )}
        {steps[currentStep - 1]?.id === "preview" && (
          <Step5Preview formData={formData} presets={presets} />
        )}
      </div>

      {/* Controls */}
      <div className={styles.wizardControls}>
        {currentStep > 1 && (
          <button
            onClick={handleBack}
            className={styles.backButton}
            disabled={isSubmitting}
          >
            Back
          </button>
        )}
        <div className={styles.spacer} />
        {currentStep < maxStep ? (
          <button
            onClick={handleNext}
            className={styles.nextButton}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Validating..." : "Next"}
          </button>
        ) : (
          <button
            onClick={handleCreate}
            className={styles.createButton}
            disabled={isSubmitting}
          >
            {isSubmitting ? "Creating..." : "Create Tournament"}
          </button>
        )}
      </div>
    </div>
  );
}
