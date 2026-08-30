import mongoose, { Schema, type Document } from "mongoose";

export interface IContestRoomActivity extends Document {
  roomId: mongoose.Types.ObjectId;
  contestId: mongoose.Types.ObjectId;
  icon: string;
  text: string;
  color: string;
  actorUserId?: mongoose.Types.ObjectId;
  actorTeamId?: mongoose.Types.ObjectId;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

const ContestRoomActivitySchema = new Schema<IContestRoomActivity>(
  {
    roomId: {
      type: Schema.Types.ObjectId,
      ref: "ContestRoom",
      required: true,
      index: true,
    },
    contestId: {
      type: Schema.Types.ObjectId,
      ref: "ContestMatch",
      required: true,
      index: true,
    },
    icon: { type: String, required: true },
    text: { type: String, required: true },
    color: { type: String, required: true },
    actorUserId: { type: Schema.Types.ObjectId, ref: "CPUser" },
    actorTeamId: { type: Schema.Types.ObjectId, ref: "ContestTeam" },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

ContestRoomActivitySchema.index({ roomId: 1, createdAt: 1 });

const ContestRoomActivity =
  (mongoose.models.ContestRoomActivity as
    mongoose.Model<IContestRoomActivity> | undefined) ||
  mongoose.model<IContestRoomActivity>(
    "ContestRoomActivity",
    ContestRoomActivitySchema,
    "contest_room_activities",
  );

export default ContestRoomActivity;
