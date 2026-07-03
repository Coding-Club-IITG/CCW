"use client";

import { useState, useEffect } from "react";
import { createRoomContest } from "@/lib/actions/contests";
import { useRouter } from "next/navigation";

export default function CreateRoomModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    mode: "blitz",
    format: "solo-tournament",
    teamSize: 1,
    maxParticipants: 16,
    startTime: "",
    problemSelectionMode: "bulk",
    bulkRatingMin: 800,
    bulkRatingMax: 1200,
    bulkProblemCount: 3,
    fineTunedProblemCount: 1 as string | number,
    fineTunedProblems: [""] as string[],
    selfRegister: false,
    selfTeamName: "",
  });

  // Handle format logic
  useEffect(() => {
    let newTeamSize = formData.teamSize;
    let newMaxPart = formData.maxParticipants;
    
    if (formData.format === "1v1") {
      newTeamSize = 1;
      newMaxPart = 2;
    } else if (formData.format === "solo-tournament") {
      newTeamSize = 1;
      newMaxPart = 16;
    } else if (formData.format === "team-tournament") {
      newTeamSize = 3;
      newMaxPart = 15;
    }

    if (newTeamSize !== formData.teamSize || newMaxPart !== formData.maxParticipants) {
      setFormData(prev => ({ ...prev, teamSize: newTeamSize, maxParticipants: newMaxPart }));
    }
  }, [formData.format]);

  // Inline Validation for Max Participants
  const [maxPartError, setMaxPartError] = useState("");
  const [fineTunedCountError, setFineTunedCountError] = useState("");
  useEffect(() => {
    if (Number.isNaN(formData.maxParticipants)) {
      setMaxPartError("Must be a valid number.");
      return;
    }
    if (formData.format === "solo-tournament" && formData.maxParticipants < 2) {
      setMaxPartError("At least 2 participants required.");
      return;
    }
    if (formData.format === "team-tournament") {
      if (formData.maxParticipants < 6) {
        setMaxPartError("At least 6 participants required (2 teams).");
        return;
      }
      if (formData.maxParticipants % 3 !== 0) {
        setMaxPartError("Must be a multiple of 3.");
        return;
      }
    }
    setMaxPartError("");
  }, [formData.maxParticipants, formData.format]);

  if (!isOpen) return null;

  const isTeamSizeLocked = ["1v1", "solo-tournament", "team-tournament"].includes(formData.format);
  const isMaxPartLocked = formData.format === "1v1";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const start = new Date(formData.startTime);
    // Frontend validation: strictly at least 2 minutes ahead of now
    if (start.getTime() < Date.now() + 2 * 60000 - 5000) {
      alert("Start time must be at least 2 minutes ahead of the current time (to allow for the 1-minute registration deadline plus a 1-minute buffer).");
      return;
    }

    // Format-specific maxParticipants validation handled inline, just block submit
    if (maxPartError || (formData.problemSelectionMode === "fine-tuned" && fineTunedCountError)) {
      return;
    }

    // Fine-tuned validation
    if (formData.problemSelectionMode === "fine-tuned") {
      const emptyIndex = formData.fineTunedProblems.findIndex(p => !p.trim());
      if (emptyIndex !== -1) {
        alert(`Please enter a Problem ID for Problem ${emptyIndex + 1}.`);
        return;
      }
    }

    setLoading(true);
    try {
      const res = await createRoomContest({
        ...formData,
        startTime: start.toISOString(),
      });
      if (res.error) {
        alert(res.error);
      } else {
        alert("Room created successfully!");
        onClose();
        router.refresh();
      }
    } catch (err: any) {
      alert("Error creating room");
    } finally {
      setLoading(false);
    }
  };

  const handleTimeAdd = (mins: number) => {
    const date = new Date();
    date.setMinutes(date.getMinutes() + mins);
    date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
    setFormData({ ...formData, startTime: date.toISOString().slice(0, 16) });
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center p-margin-mobile md:p-margin-desktop bg-black/60 backdrop-grayscale overflow-y-auto text-on-surface font-body-md" style={{ zIndex: 9999 }} onClick={onClose}>
      {/* Modal Container */}
      <div
        className="relative w-full max-w-2xl mx-auto bg-surface-container border border-outline-variant rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        style={{ maxWidth: '672px', zIndex: 10000 }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-gutter py-[16px] border-b border-outline-variant">
          <h2 className="font-headline-lg-mobile md:font-headline-lg text-headline-lg-mobile md:text-headline-lg text-on-surface m-0">Create a room</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface transition-colors p-unit rounded hover:bg-surface-variant"
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24" }}>close</span>
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto p-gutter custom-scrollbar">
          <form id="create-room-form" onSubmit={handleSubmit} className="flex flex-col gap-[16px]">
            {/* Name */}
            <div className="flex flex-col gap-unit">
              <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="room-name">Name</label>
              <input
                required
                id="room-name"
                type="text"
                placeholder="Enter room name"
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow"
              />
            </div>

            {/* Mode & Format Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
              <div className="flex flex-col gap-unit">
                <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="room-mode">Mode</label>
                <select
                  id="room-mode"
                  value={formData.mode}
                  onChange={e => setFormData({ ...formData, mode: e.target.value })}
                  className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none cursor-pointer"
                >
                  <option value="blitz">Blitz</option>
                  <option value="arena">Arena</option>
                </select>
              </div>
              <div className="flex flex-col gap-unit">
                <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="room-format">Format</label>
                <select
                  id="room-format"
                  value={formData.format}
                  onChange={e => setFormData({ ...formData, format: e.target.value })}
                  className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none cursor-pointer"
                >
                  <option value="1v1">1v1</option>
                  <option value="solo-tournament">Solo Tournament</option>
                  <option value="team-tournament">Team Battle</option>
                </select>
              </div>
            </div>

            {/* Grid: Team Size & Max Participants */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-[16px]">
              <div className="flex flex-col gap-unit">
                <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="team-size">Team Size</label>
                <select
                  id="team-size"
                  value={formData.teamSize}
                  onChange={e => setFormData({ ...formData, teamSize: parseInt(e.target.value) })}
                  disabled={isTeamSizeLocked}
                  className={`form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none ${isTeamSizeLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
                >
                  <option value={1}>1 Player (Solo)</option>
                  <option value={3}>3 Players (ICPC)</option>
                </select>
              </div>
              <div className="flex flex-col gap-unit">
                <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="max-participants">Max Participants</label>
                <input
                  required
                  id="max-participants"
                  type="number"
                  min={formData.format === "team-tournament" ? 6 : 2}
                  step={formData.format === "team-tournament" ? 3 : 1}
                  value={Number.isNaN(formData.maxParticipants) ? "" : formData.maxParticipants}
                  onChange={e => setFormData({ ...formData, maxParticipants: parseInt(e.target.value) })}
                  disabled={isMaxPartLocked}
                  className={`form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow ${isMaxPartLocked ? 'opacity-50 cursor-not-allowed' : ''} ${maxPartError ? 'border-error focus:border-error focus:shadow-[0_0_0_1px_rgba(255,180,171,1)]' : ''}`}
                />
                {maxPartError && (
                  <span className="text-[11px] font-label-sm text-error mt-1">{maxPartError}</span>
                )}
              </div>
            </div>

            {/* Start Time */}
            <div className="flex flex-col gap-unit">
              <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="start-time">Start Time</label>
              <div className="flex flex-col gap-[8px]">
                <input
                  required
                  id="start-time"
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={e => setFormData({ ...formData, startTime: e.target.value })}
                  className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow [color-scheme:dark]"
                />
                
                {/* Styled Quick Add Time Buttons */}
                <div className="flex items-center justify-center gap-[16px] flex-wrap mt-4 mb-2 w-full">
                  {[3, 5, 10, 15].map(mins => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => handleTimeAdd(mins)}
                      className="px-8 py-3 bg-transparent border-2 border-dashed border-primary/40 text-on-surface rounded-lg font-label-sm text-[15px] font-medium hover:bg-primary/10 hover:border-primary/70 hover:text-primary transition-all flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-primary/50"
                    >
                      +{mins} min{mins > 1 ? 's' : ''}
                    </button>
                  ))}
                </div>
              </div>
              <span className="font-label-sm text-label-sm text-primary mt-1">Scheduled rooms start automatically. Registration deadline will be exactly 1 minute before the start time for all users.</span>
            </div>

            {/* Problem Configuration Section */}
            <div className="mt-[16px] pt-[16px] border-t border-outline-variant flex flex-col gap-[16px]">
              <h3 className="font-headline-lg-mobile text-headline-lg-mobile md:text-[24px] text-on-surface m-0">Problem Configuration</h3>
              
              <div className="flex flex-col gap-unit">
                <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="problem-selection-mode">Selection Mode</label>
                <select
                  id="problem-selection-mode"
                  value={formData.problemSelectionMode}
                  onChange={e => setFormData({ ...formData, problemSelectionMode: e.target.value })}
                  className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow appearance-none cursor-pointer"
                >
                  <option value="test">Test</option>
                  <option value="bulk">Bulk</option>
                  <option value="fine-tuned">Fine-Tuned</option>
                </select>
                {formData.problemSelectionMode === "test" && (
                  <span className="font-label-sm text-label-sm text-primary mt-1">A pre-selected test problem will be assigned to verify the room mechanics.</span>
                )}
                {formData.problemSelectionMode === "bulk" && (
                  <span className="font-label-sm text-label-sm text-primary mt-1">Automatically fetch problems unsolved by all registered players, selected based on their rating range.</span>
                )}
                {formData.problemSelectionMode === "fine-tuned" && (
                  <span className="font-label-sm text-label-sm text-primary mt-1">Manually curate and select exactly which problems will be included in the room.</span>
                )}
              </div>

              {formData.problemSelectionMode === "bulk" && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-[16px]">
                  <div className="flex flex-col gap-unit">
                    <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="min-rating">Min Rating</label>
                    <input
                      required={formData.problemSelectionMode === "bulk"}
                      id="min-rating"
                      type="number"
                      step={100}
                      value={Number.isNaN(formData.bulkRatingMin) ? "" : formData.bulkRatingMin}
                      onChange={e => setFormData({ ...formData, bulkRatingMin: parseInt(e.target.value) })}
                      className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow"
                    />
                  </div>
                  <div className="flex flex-col gap-unit">
                    <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="max-rating">Max Rating</label>
                    <input
                      required={formData.problemSelectionMode === "bulk"}
                      id="max-rating"
                      type="number"
                      step={100}
                      value={Number.isNaN(formData.bulkRatingMax) ? "" : formData.bulkRatingMax}
                      onChange={e => setFormData({ ...formData, bulkRatingMax: parseInt(e.target.value) })}
                      className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow"
                    />
                  </div>
                  <div className="flex flex-col gap-unit">
                    <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="problem-count">Count</label>
                    <input
                      required={formData.problemSelectionMode === "bulk"}
                      id="problem-count"
                      type="number"
                      min={1}
                      max={10}
                      value={Number.isNaN(formData.bulkProblemCount) ? "" : formData.bulkProblemCount}
                      onChange={e => setFormData({ ...formData, bulkProblemCount: parseInt(e.target.value) })}
                      className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow"
                    />
                  </div>
                </div>
              )}

              {formData.problemSelectionMode === "fine-tuned" && (
                <div className="flex flex-col gap-[16px] mt-2">
                  <div className="flex flex-col gap-unit">
                    <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="fine-tuned-count">Number of Problems</label>
                    <input
                      required={formData.problemSelectionMode === "fine-tuned"}
                      id="fine-tuned-count"
                      type="number"
                      min={1}
                      max={10}
                      value={formData.fineTunedProblemCount}
                      onChange={e => {
                        const valStr = e.target.value;
                        const isValid = /^[1-9]\d*$/.test(valStr);
                        const count = parseInt(valStr, 10);
                        
                        if (isValid && count >= 1 && count <= 10) {
                          setFineTunedCountError("");
                          const newProblems = [...formData.fineTunedProblems];
                          while (newProblems.length < count) newProblems.push("");
                          while (newProblems.length > count) newProblems.pop();
                          setFormData({ ...formData, fineTunedProblemCount: valStr, fineTunedProblems: newProblems });
                        } else {
                          setFormData({ ...formData, fineTunedProblemCount: valStr });
                          if (!isValid) {
                            setFineTunedCountError("Must be a positive integer.");
                          } else if (count > 10) {
                            setFineTunedCountError("Must be at most 10.");
                          }
                        }
                      }}
                      className={`form-input rounded-lg w-full md:w-1/3 px-[12px] py-[8px] focus:outline-none transition-shadow ${fineTunedCountError ? 'border-error focus:border-error focus:shadow-[0_0_0_1px_rgba(255,180,171,1)]' : ''}`}
                    />
                    {fineTunedCountError && (
                      <span className="text-[11px] font-label-sm text-error mt-1">{fineTunedCountError}</span>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-[16px]">
                    {formData.fineTunedProblems.map((prob, idx) => (
                      <div key={idx} className="flex flex-col gap-unit">
                        <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor={`problem-${idx}`}>Problem {idx + 1}</label>
                        <input
                          required={formData.problemSelectionMode === "fine-tuned"}
                          id={`problem-${idx}`}
                          type="text"
                          placeholder="e.g. 4A"
                          value={prob}
                          onChange={e => {
                            const newProblems = [...formData.fineTunedProblems];
                            newProblems[idx] = e.target.value;
                            setFormData({ ...formData, fineTunedProblems: newProblems });
                          }}
                          className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Self Register */}
            <div className="mt-unit flex flex-col gap-[16px]">
              <label className="flex items-center gap-unit cursor-pointer">
                <input
                  id="self-register"
                  type="checkbox"
                  checked={formData.selfRegister}
                  onChange={e => setFormData({ ...formData, selfRegister: e.target.checked })}
                  className="form-checkbox text-primary rounded border-outline-variant bg-background focus:ring-primary focus:ring-offset-surface-container focus:ring-offset-2 w-5 h-5 transition-colors"
                />
                <span className="font-label-sm text-label-sm text-on-surface">Self-register</span>
              </label>

              {/* Indented Team Name */}
              {formData.selfRegister && (
                <div className="pl-gutter flex flex-col gap-unit border-l-2 border-surface-variant ml-[10px]">
                  <label className="font-label-sm text-label-sm text-on-surface-variant" htmlFor="your-team-name">Your Team Name</label>
                  <input
                    required={formData.selfRegister}
                    id="your-team-name"
                    type="text"
                    placeholder="e.g. The Recursions"
                    value={formData.selfTeamName}
                    onChange={e => setFormData({ ...formData, selfTeamName: e.target.value })}
                    className="form-input rounded-lg w-full px-[12px] py-[8px] focus:outline-none transition-shadow"
                  />
                </div>
              )}
            </div>
          </form>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-[16px] px-gutter py-[16px] border-t border-outline-variant bg-surface-container">
          <button
            type="button"
            onClick={onClose}
            className="font-label-sm text-label-sm text-on-surface px-[24px] py-[12px] rounded-lg border border-transparent hover:border-outline-variant hover:bg-surface-variant transition-all focus:outline-none focus:ring-2 focus:ring-primary"
          >
            Cancel
          </button>
          <button
            type="submit"
            form="create-room-form"
            disabled={loading || !!maxPartError || (formData.problemSelectionMode === "fine-tuned" && !!fineTunedCountError)}
            className="font-label-sm text-label-sm bg-primary-container text-on-primary-container px-[24px] py-[12px] rounded-lg hover:bg-primary hover:text-on-primary transition-colors shadow-[0_0_15px_rgba(46,125,50,0.3)] hover:shadow-[0_0_20px_rgba(136,217,130,0.5)] focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-surface-container disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Room"}
          </button>
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .form-input {
            background-color: #131313 !important;
            border: 1px solid #40493d !important;
            color: #e5e2e1 !important;
        }
        .form-input:focus {
            border-color: #88d982 !important;
            box-shadow: 0 0 0 1px #88d982 !important;
            color: #e5e2e1 !important;
        }
        .form-input:-webkit-autofill,
        .form-input:-webkit-autofill:hover, 
        .form-input:-webkit-autofill:focus, 
        .form-input:-webkit-autofill:active {
            -webkit-box-shadow: 0 0 0 30px #131313 inset !important;
            -webkit-text-fill-color: #e5e2e1 !important;
            transition: background-color 5000s ease-in-out 0s;
        }
        .custom-scrollbar::-webkit-scrollbar {
            width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
            background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
            background: #353534;
            border-radius: 4px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
            background: #40493d;
        }
      ` }} />
    </div>
  );
}