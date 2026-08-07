import mongoose from "mongoose";

const CreditEntrySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    period: { type: String, required: true, trim: true, maxlength: 80 },
  },
  { _id: false },
);

const CreditSectionSchema = new mongoose.Schema(
  {
    heading: { type: String, required: true, trim: true, maxlength: 80 },
    entries: { type: [CreditEntrySchema], default: [] },
  },
  { _id: false },
);

const CreditsSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, default: "main" },
    sections: { type: [CreditSectionSchema], default: [] },
  },
  { timestamps: true },
);

export default mongoose.models.Credits ||
  mongoose.model("Credits", CreditsSchema);
