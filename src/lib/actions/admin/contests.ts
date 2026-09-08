"use server";

import mongoose from "mongoose";
import { headers } from "next/headers";

import { isHead } from "@/lib/access/roles";
import { defineAction } from "@/lib/actions/defineAction";
import { auditActor, auditedTransaction } from "@/lib/audit";
import { summarizeContest } from "@/lib/audit/summary";
import { err as appError, ok, validationError } from "@/lib/api/result";
import {
  contestCreationDraftSchema,
  contestCreationPayloadSchema,
  type ContestProblemSlot,
} from "@/lib/api/schemas/contestAction";
import { auth } from "@/lib/auth";
import { reconciliationQueue } from "@/lib/contests/queues";
import { webEnv } from "@/lib/env/web";
import dbConnect from "@/lib/mongodb";
import { errorToLogMetadata, logger } from "@/lib/utils";
import ContestMatch from "@/models/ContestMatch";
import ContestPreset from "@/models/ContestPreset";
import CPUser from "@/models/CPUser";
