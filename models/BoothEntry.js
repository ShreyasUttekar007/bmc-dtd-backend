const mongoose = require("mongoose");

const BoothEntrySchema = new mongoose.Schema(
  {
    email: { type: String, required: true, trim: true, lowercase: true },
    assemblyConstituency: { type: String, required: true, trim: true },
    pc: { type: String, required: true, trim: true },
    name: { type: String, required: true, trim: true },
    ward: { type: String, required: true, trim: true },
    booth: { type: String, required: true, trim: true },
    areaName: { type: String, required: true, trim: true },
    photo: { type: String, trim: true },
    gMapLocation: { type: String, trim: true },
    status: {
      type: String,
      enum: ["Verified", "Not Verified"],
      default: "Not Verified",
      trim: true,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("BoothEntry", BoothEntrySchema);
