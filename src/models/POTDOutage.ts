import mongoose from "mongoose";

const POTDOutageSchema = new mongoose.Schema(
  {
    // Date string representing the IST challenge day, e.g. "2026-07-01"
    date: {
      type: String,
      required: true,
      unique: true,
      validate: {
        validator: (v: string) => /^\d{4}-\d{2}-\d{2}$/.test(v),
        message: (props: any) => `${props.value} is not a valid YYYY-MM-DD date string!`,
      },
    },
    reason: {
      type: String,
      default: "",
    },
  },
  { timestamps: true },
);

export default mongoose.models.POTDOutage ||
  mongoose.model("POTDOutage", POTDOutageSchema);
