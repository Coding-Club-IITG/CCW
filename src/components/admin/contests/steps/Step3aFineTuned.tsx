import React, { useState, useEffect } from "react";
import styles from "../ContestWizard.module.scss";

interface Step3aFineTunedProps {
  maxParticipants: number;
  problemSlots: { platform: string; problemId: string; roundNumber: number }[];
  updateFields: (fields: any) => void;
  errors: Record<string, string>;
  preset: any;
}

export default function Step3aFineTuned({
  maxParticipants,
  problemSlots,
  updateFields,
  errors,
  preset,
}: Step3aFineTunedProps) {
  const [problemsPerMatch, setProblemsPerMatch] = useState(preset?.bulkProblemCount || 3);
  const [roundInputs, setRoundInputs] = useState<Record<number, string>>({});

  const nextPowerOf2 = (n: number) => Math.pow(2, Math.ceil(Math.log2(n)));
  const bracketSize = nextPowerOf2(maxParticipants);
  const totalRounds = Math.log2(bracketSize);

  // Initialize inputs from existing problemSlots if any
  const hasInitialized = React.useRef(false);
  useEffect(() => {
    if (hasInitialized.current) return;
    const inputs: Record<number, string> = {};
    for (let r = 1; r <= totalRounds; r++) {
      const roundProblems = problemSlots.filter(p => p.roundNumber === r).map(p => p.problemId);
      if (roundProblems.length > 0) {
        inputs[r] = roundProblems.join(", ");
      } else {
        inputs[r] = "";
      }
    }
    setRoundInputs(inputs);
    hasInitialized.current = true;
  }, [problemSlots, totalRounds]);

  const handleInputChange = (roundNum: number, value: string) => {
    const newInputs = { ...roundInputs, [roundNum]: value };
    setRoundInputs(newInputs);

    // Parse and update global problemSlots
    const newSlots: { platform: string; problemId: string; roundNumber: number }[] = [];
    Object.keys(newInputs).forEach((key) => {
      const r = parseInt(key);
      const val = newInputs[r];
      if (val.trim()) {
        const ids = val.split(",").map(id => id.trim()).filter(id => id.length > 0);
        ids.forEach(id => {
          newSlots.push({
            platform: "codeforces",
            problemId: id,
            roundNumber: r
          });
        });
      }
    });
    
    updateFields({ problemSlots: newSlots });
  };

  const handleProblemsPerMatchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value) || 1;
    setProblemsPerMatch(val);
    updateFields({ bulkProblemCount: val });
  };

  return (
    <div className={styles.stepContainer}>
      <h2>Round-based Problem Selection</h2>
      <p className={styles.stepDescription}>
        You selected a fine-tuned preset. For a bracket of {maxParticipants} participants, there will be {totalRounds} rounds.
        Please provide the exact Codeforces Problem IDs (comma-separated) for each round.
      </p>

      <div className={styles.formGroup}>
        <label>Problems per match:</label>
        <input 
          type="number" 
          min={1} 
          value={problemsPerMatch} 
          onChange={handleProblemsPerMatchChange} 
          className={styles.input}
        />
      </div>

      <div className={styles.roundsList}>
        {Array.from({ length: totalRounds }).map((_, i) => {
          const roundNum = i + 1;
          const matchesInRound = Math.pow(2, totalRounds - roundNum);
          const requiredProblems = matchesInRound * problemsPerMatch;
          const currentCount = problemSlots.filter(p => p.roundNumber === roundNum).length;
          
          return (
            <div key={roundNum} className={styles.formGroup} style={{ marginTop: '20px', padding: '15px', border: '1px solid #ccc', borderRadius: '8px' }}>
              <label>Round {roundNum} ({matchesInRound} matches)</label>
              <p style={{ fontSize: '12px', color: currentCount === requiredProblems ? 'green' : 'red' }}>
                Required problems: {requiredProblems} | Provided: {currentCount}
              </p>
              <textarea
                value={roundInputs[roundNum] || ""}
                onChange={(e) => handleInputChange(roundNum, e.target.value)}
                placeholder="e.g. 4A, 1A, 158A"
                className={styles.input}
                style={{ minHeight: '80px', width: '100%' }}
              />
              {errors[`round_${roundNum}`] && <span className={styles.error}>{errors[`round_${roundNum}`]}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
