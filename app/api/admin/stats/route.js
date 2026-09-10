import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import { Category } from "@/models/Category";
import User from "@/models/User";
import Progress from "@/models/Progress";

// Keep this dynamic — the dashboard should always reflect current DB state.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const payload = token ? verifyToken(token) : null;
  return payload?.role === "admin";
}

// Read-only aggregate for the admin dashboard. Deliberately does not touch
// the question/category schema — "recently added questions" isn't tracked
// per-question (questions have no timestamps of their own), so this reports
// recently *updated subjects* instead, which is accurate to what the data
// actually supports.
export async function GET() {
  if (!isAdmin()) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  try {
    await connectDB();
    const [totalUsers, recentSubjects, activeUsers] = await Promise.all([
      User.countDocuments({}),
      Category.find({}).sort({ updatedAt: -1 }).limit(5).select("id title group updatedAt").lean(),
      Progress.countDocuments({ updatedAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } }),
    ]);
    return NextResponse.json(
      { totalUsers, activeUsers, inactiveUsers: Math.max(0, totalUsers - activeUsers), recentSubjects },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (e) {
    console.error("GET /api/admin/stats failed:", e);
    return NextResponse.json({ error: e.message || "Failed to load stats." }, { status: 500 });
  }
}
