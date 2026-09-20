import mongoose from "mongoose";

const categorySchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  title: { type: String, required: true },
  description: { type: String },
  group: { type: String, default: "civil1" },
  subcats: [{
    name: { type: String, required: true },
    questions: [{
      num: { type: Number },
      text: { type: String, required: true },
      options: [{ type: String }],
      correct: { type: Number, required: true },
      expl: { type: String },
    }]
  }]
}, { timestamps: true });

export const Category = mongoose.models.Category || mongoose.model("Category", categorySchema);
