import mongoose from "mongoose";

const ProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },
  bestScores: { type: Object, default: {} }, // catId -> key -> {correct,total,pct,date}
  bookmarks: { type: Object, default: {} }, // catId -> ["subIdx-num"]
  missCounts: { type: Object, default: {} },
  mastery: { type: Object, default: {} },
  stats: {
    totalAnswered: { type: Number, default: 0 },
    totalCorrect: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
    bestStreak: { type: Number, default: 0 },
    sessionsCompleted: { type: Number, default: 0 },
  },
  hiddenCategories: { type: [String], default: [] },
}, { timestamps: true });

export default mongoose.models.Progress || mongoose.model("Progress", ProgressSchema);
