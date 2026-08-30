import { loadAllCategories, getCategoryById, getGroups } from "@/lib/questions";
import { NextResponse } from "next/server";

// This route reads straight from disk on every request; force it to stay
// dynamic so no build/CDN layer ever serves a stale snapshot after an
// admin edit.
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req){
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if(id){
      const cat = getCategoryById(id);
      if(!cat) return NextResponse.json({error:"Not found"},{status:404});
      return NextResponse.json({category: cat}, { headers: { "Cache-Control": "no-store" } });
    }
    const categories = loadAllCategories();
    const groups = getGroups();
    return NextResponse.json({categories, groups}, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("GET /api/questions failed:", e);
    return NextResponse.json({ error: e.message || "Failed to load questions." }, { status: 500 });
  }
}
