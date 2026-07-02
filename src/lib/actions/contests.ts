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
  registrationDeadline: Date | null;
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
      registrationDeadline: contest.registrationSettings?.deadline || null,
    };
    
    let computedStatus = contest.status;
    const now = new Date();
    if (contest.status === "completed" || contest.status === "active") {
      computedStatus = contest.status;
    } else if (contest.startTime && contest.endTime) {
      if (now >= contest.startTime && now <= contest.endTime) {
        computedStatus = "active";
      } else if (now > contest.endTime) {
        computedStatus = "completed";
      } else if (now < contest.startTime) {
        computedStatus = "registration";
      }
    }
    item.status = computedStatus;

    if (computedStatus === "active") {
      active.push(item);
    } else if (computedStatus === "registration") {
      upcoming.push(item);
    } else if (computedStatus === "completed") {
      completed.push(item);
    }
  }
  
  // Sort
  active.sort((a, b) => (a.startTime && b.startTime) ? a.startTime.getTime() - b.startTime.getTime() : 0);
  upcoming.sort((a, b) => (a.startTime && b.startTime) ? a.startTime.getTime() - b.startTime.getTime() : 0);
  completed.sort((a, b) => (a.startTime && b.startTime) ? b.startTime.getTime() - a.startTime.getTime() : 0); // desc

  return { active, upcoming, completed };
}

export async function getContestById(id: string): Promise<ContestListingItem | null> {
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

  try {
    const contest = await CustomContest.findById(id).lean();
    if (!contest) return null;

    const isRegistered = cpUserId ? (contest.registrations || []).some((r: any) => r.userId.toString() === cpUserId) : false;
    
    let computedStatus = contest.status;
    const now = new Date();
    if (contest.status === "completed" || contest.status === "active") {
      computedStatus = contest.status;
    } else if (contest.startTime && contest.endTime) {
      if (now >= contest.startTime && now <= contest.endTime) {
        computedStatus = "active";
      } else if (now > contest.endTime) {
        computedStatus = "completed";
      } else if (now < contest.startTime) {
        computedStatus = "registration";
      }
    }

    return {
      _id: contest._id.toString(),
      name: contest.name,
      description: contest.description || "",
      startTime: contest.startTime || null,
      durationSeconds: contest.durationSeconds || null,
      format: contest.format,
      mode: contest.mode,
      status: computedStatus,
      registeredCount: (contest.registrations || []).length,
      participantsCount: (contest.registrations || []).length,
      isRegistered,
      registrationDeadline: contest.registrationSettings?.deadline || null,
    };
  } catch (error) {
    console.error("Error fetching contest by id:", error);
    return null;
  }
}

import { revalidatePath } from "next/cache";

export async function registerForContest(contestId: string): Promise<{ success: boolean; message: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    const userId = session?.user?.id;
    if (!userId) return { success: false, message: "Unauthorized" };

    await dbConnect();
    const cpUser = await CPUser.findOne({ userId });
    if (!cpUser) return { success: false, message: "CP Profile not found" };

    const contest = await CustomContest.findById(contestId);
    if (!contest) return { success: false, message: "Contest not found" };

    if (contest.status !== "registration") {
      return { success: false, message: "Contest is not open for registration" };
    }

    const isAlreadyRegistered = contest.registrations?.some((r: any) => r.userId.toString() === cpUser._id.toString());
    if (isAlreadyRegistered) {
      return { success: false, message: "Already registered" };
    }

    if (!contest.registrations) contest.registrations = [];
    contest.registrations.push({
      userId: cpUser._id,
      cfHandle: cpUser.cfHandle || "unknown",
      registeredAt: new Date(),
    });

    await contest.save();
    
    // Revalidate the contests listing page
    revalidatePath("/internal/contests");
    return { success: true, message: "Successfully registered" };
  } catch (error) {
    console.error("Registration error:", error);
    return { success: false, message: "Internal server error" };
  }
}
