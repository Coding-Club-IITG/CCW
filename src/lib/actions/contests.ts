"use server";

import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import dbConnect from "@/lib/mongodb";
import CustomContest from "@/models/CustomContest";
import CPUser from "@/models/CPUser";

export type ContestListingItem = {
  _id: string;
  name: string;
  description: string;
  startTime: Date | null;
  durationSeconds: number | null;
  format: string;
  mode: string;
  status: string;
  registeredCount: number;
  isRegistered: boolean;
  participantsCount: number;
};

export async function getContestListing(): Promise<{ active: ContestListingItem[], upcoming: ContestListingItem[], completed: ContestListingItem[] }> {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session?.user?.id;

  await dbConnect();
  
  let cpUserId = null;
  if (userId) {
    const cpUser = await CPUser.findOne({ userId }).lean();
    if (cpUser) {
      cpUserId = cpUser._id.toString();
    }
  }

  const contests = await CustomContest.find({
    status: { $in: ["registration", "active", "completed"] },
  }).lean();

  const active: ContestListingItem[] = [];
  const upcoming: ContestListingItem[] = [];
  const completed: ContestListingItem[] = [];

  for (const contest of contests) {
    const isRegistered = cpUserId ? (contest.registrations || []).some((r: any) => r.userId.toString() === cpUserId) : false;
    const item: ContestListingItem = {
      _id: contest._id.toString(),
      name: contest.name,
      description: contest.description || "",
      startTime: contest.startTime || null,
      durationSeconds: contest.durationSeconds || null,
      format: contest.format,
      mode: contest.mode,
      status: contest.status,
      registeredCount: (contest.registrations || []).length,
      participantsCount: (contest.registrations || []).length,
      isRegistered,
    };
    
    if (contest.status === "active") {
      active.push(item);
    } else if (contest.status === "registration") {
      upcoming.push(item);
    } else if (contest.status === "completed") {
      completed.push(item);
    }
  }
  
  // Sort
  active.sort((a, b) => (a.startTime && b.startTime) ? a.startTime.getTime() - b.startTime.getTime() : 0);
  upcoming.sort((a, b) => (a.startTime && b.startTime) ? a.startTime.getTime() - b.startTime.getTime() : 0);
  completed.sort((a, b) => (a.startTime && b.startTime) ? b.startTime.getTime() - a.startTime.getTime() : 0); // desc

  return { active, upcoming, completed };
}
