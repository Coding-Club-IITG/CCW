import mongoose from "mongoose";
const { Schema, model, Document } = mongoose;

// Enum for host assignment type
export type HostAssignmentType = "owner" | "co-host";

// Interface for PulseHostAssignment document
export interface PulseHostAssignment extends Document {
  _id: string;
  quizId: string; // Reference to PulseQuiz._id
  email: string; // Normalized email used for pre-assignment
  userId: string | null; // Reference to User._id (null until linked)
  assignmentType: HostAssignmentType; // Whether this is for owner or co-host
  linkedAt: Date | null; // Timestamp when linked to userId
  createdAt: Date;
  updatedAt: Date;
}

// Define the schema
const PulseHostAssignmentSchema = new Schema<PulseHostAssignment>(
  {
    quizId: { type: Schema.Types.ObjectId, ref: "PulseQuiz", required: true } as any,
    email: { type: String, required: true, lowercase: true, trim: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", default: null } as any,
    assignmentType: { type: String, enum: ["owner", "co-host"], required: true },
    linkedAt: { type: Date, default: null },
  },
  {
    timestamps: { createdAt: true, updatedAt: true },
  }
);

// Indexes
PulseHostAssignmentSchema.index({ quizId: 1, email: 1 });
PulseHostAssignmentSchema.index({ email: 1, userId: 1 });
PulseHostAssignmentSchema.index({ quizId: 1, userId: 1 });
PulseHostAssignmentSchema.index({ email: 1 });

// Create and export the model - prevent overwriting in development
export default mongoose.models.PulseHostAssignment ||
  model<PulseHostAssignment>("PulseHostAssignment", PulseHostAssignmentSchema);