import mongoose from "mongoose";

const ProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", unique: true, required: true },
  bestScores: { type: Object, default: {} }, // catId -> key -> {correct,total,pct,date}
  attemptCounts: { type: Object, default: {} }, // catId -> key -> number of test-mode attempts
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
  dailyTestCorrect: {
    type: Object,
    default: () => ({ date: "", counts: {} }), // { date:"YYYY-MM-DD" (IST), counts:{civil1: n, civil2:n, nontechnical:n}}
  },
  hiddenCategories: { type: [String], default: [] },
  // Practice-mode checkpoints: catId -> { type, idx, remaining, stats..., updatedAt }
  // so an interrupted session can be resumed exactly where it stopped.
  checkpoints: { type: Object, default: {} },
  // Small user preferences that should follow the account across devices
  // (e.g. Listen & Learn voice + playback speed).
  prefs: { type: Object, default: {} },
}, { timestamps: true });

export default mongoose.models.Progress || mongoose.model("Progress", ProgressSchema);
