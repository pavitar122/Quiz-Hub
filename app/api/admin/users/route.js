import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Progress from "@/models/Progress";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const payload = token ? verifyToken(token) : null;
  return payload?.role === "admin";
}

export async function GET(request) {
  if (!isAdmin()) return NextResponse.json({ error: "Admin only" }, { status: 403 });

  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    const search = searchParams.get("search")?.trim() || "";
    const page = Math.max(1, Number(searchParams.get("page")) || 1);
    const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit")) || 20));
    const query = search
      ? { $or: [{ name: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } }] }
      : {};

    const [users, total] = await Promise.all([
      User.find(query).select("name email role createdAt").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      User.countDocuments(query),
    ]);
    const progress = await Progress.find({ userId: { $in: users.map(user => user._id) } })
      .select("userId stats updatedAt")
      .lean();
    const progressByUser = new Map(progress.map(item => [String(item.userId), item]));

    return NextResponse.json({
      users: users.map(({ _id, ...user }) => {
        const learning = progressByUser.get(String(_id));
        return {
          id: String(_id),
          ...user,
          progress: learning ? {
            attempted: learning.stats?.totalAnswered || 0,
            correct: learning.stats?.totalCorrect || 0,
            sessions: learning.stats?.sessionsCompleted || 0,
            updatedAt: learning.updatedAt || null,
          } : null,
        };
      }),
      pagination: { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) },
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("GET /api/admin/users failed:", error);
    return NextResponse.json({ error: error.message || "Failed to load users." }, { status: 500 });
  }
}
