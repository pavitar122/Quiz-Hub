import { loadAllCategories, loadCategorySummaries, getCategoryById, getGroups } from "@/lib/questions";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(req){
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const full = searchParams.get("full");

    if (id) {
      const cat = getCategoryById(id);
      if (!cat) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(
        { category: cat },
        { headers: { "Cache-Control": "public, max-age=10, stale-while-revalidate=60" } }
      );
    }

    const categories = full === "1" || full === "true" ? loadAllCategories() : loadCategorySummaries();
    const groups = getGroups();

    return NextResponse.json(
      { categories, groups },
      { headers: { "Cache-Control": "public, max-age=15, stale-while-revalidate=120" } }
    );
  } catch (e) {
    console.error("GET /api/questions failed:", e);
    return NextResponse.json({ error: e.message || "Failed to load questions." }, { status: 500 });
  }
}
