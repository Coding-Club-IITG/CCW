"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createTestContest } from "@/lib/actions/schedule-test";

export default function ScheduleTestPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData(e.currentTarget);
      const res = await createTestContest(formData);
      if (res.success) {
        router.push("/internal/contests");
        router.refresh();
      }
    } catch (err: any) {
      setError(err.message || "Failed to schedule test contest");
      setLoading(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col p-8 bg-background text-on-background overflow-y-auto">
      <h1 className="text-3xl font-bold mb-2">Dummy Contest Scheduler</h1>
      <p className="text-on-surface-variant mb-8 max-w-2xl">
        Use this tool to quickly spin up fully customized dummy matches for testing state transitions, UI rendering, and edge cases. This creates the contest, provisions a room, assigns you and dummy test users to teams, and populates Redis instantly.
      </p>

      <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-xl">
        {error && (
          <div className="p-4 bg-error-container text-on-error-container rounded-lg font-medium">
            {error}
          </div>
        )}

        <div className="flex flex-col gap-2">
          <label className="font-semibold text-sm">Match Name</label>
          <input 
            type="text" 
            name="name" 
            defaultValue="Live Action Blitz Arena" 
            className="p-3 rounded bg-surface-variant text-on-surface border border-outline focus:border-primary focus:outline-none" 
            required 
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-sm">Mode</label>
            <select name="mode" className="p-3 rounded bg-surface-variant text-on-surface border border-outline focus:border-primary focus:outline-none">
              <option value="blitz">Blitz</option>
              <option value="standard">Standard</option>
              <option value="knockout">Knockout</option>
            </select>
          </div>
          
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-sm">Format</label>
            <select name="format" className="p-3 rounded bg-surface-variant text-on-surface border border-outline focus:border-primary focus:outline-none">
              <option value="1v1">1v1</option>
              <option value="ffa">Free For All (FFA)</option>
              <option value="team">Team (Not implemented yet)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-sm">Reg. Wait Time (seconds)</label>
            <input 
              type="number" 
              name="regWaitSeconds" 
              defaultValue="15" 
              className="p-3 rounded bg-surface-variant text-on-surface border border-outline focus:border-primary focus:outline-none" 
              min="0"
              required 
            />
            <p className="text-xs text-on-surface-variant">Time before registration closes</p>
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-semibold text-sm">Start Delay (seconds)</label>
            <input 
              type="number" 
              name="startWaitSeconds" 
              defaultValue="15" 
              className="p-3 rounded bg-surface-variant text-on-surface border border-outline focus:border-primary focus:outline-none" 
              min="0"
              required 
            />
            <p className="text-xs text-on-surface-variant">Time between reg close and start</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col gap-2">
            <label className="font-semibold text-sm">Duration (minutes)</label>
            <input 
              type="number" 
              name="durationMinutes" 
              defaultValue="60" 
              className="p-3 rounded bg-surface-variant text-on-surface border border-outline focus:border-primary focus:outline-none" 
              min="1"
              required 
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="font-semibold text-sm">Number of Opponents</label>
            <input 
              type="number" 
              name="numOpponents" 
              defaultValue="1" 
              className="p-3 rounded bg-surface-variant text-on-surface border border-outline focus:border-primary focus:outline-none" 
              min="1"
              max="10"
              required 
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="font-semibold text-sm">Codeforces Problem IDs (Comma separated)</label>
          <input 
            type="text" 
            name="problems" 
            defaultValue="1900A, 1900B, 1900C, 1900D, 1900E" 
            className="p-3 rounded bg-surface-variant text-on-surface border border-outline focus:border-primary focus:outline-none" 
            required 
          />
        </div>

        <button 
          type="submit" 
          disabled={loading}
          className="mt-4 p-4 bg-primary text-on-primary font-bold rounded-lg hover:brightness-110 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Scheduling Contest..." : "Schedule Dummy Contest"}
        </button>
      </form>
    </div>
  );
}
