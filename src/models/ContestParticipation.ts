import mongoose, { Schema } from "mongoose";

export interface IContestParticipation {
  _id: mongoose.Types.ObjectId;
  roomId: mongoose.Types.ObjectId;
  contestId: mongoose.Types.ObjectId;
  teamId: mongoose.Types.ObjectId;
  admittedAt: Date;
}

// The user ID is the unique key so concurrent rooms cannot both admit a person
const ContestParticipationSchema = new Schema<IContestParticipation>({
  _id: { type: Schema.Types.ObjectId, ref: "User", required: true },
  roomId: { type: Schema.Types.ObjectId, ref: "ContestRoom", required: true },
  contestId: {
    type: Schema.Types.ObjectId,
    ref: "ContestMatch",
    required: true,
  },
  teamId: { type: Schema.Types.ObjectId, ref: "ContestTeam", required: true },
  admittedAt: { type: Date, required: true },
});

ContestParticipationSchema.index({ roomId: 1 });

const ContestParticipation =
  (mongoose.models.ContestParticipation as
    mongoose.Model<IContestParticipation> | undefined) ||
  mongoose.model<IContestParticipation>(
    "ContestParticipation",
    ContestParticipationSchema,
    "contest_participations",
  );

export default ContestParticipation;
