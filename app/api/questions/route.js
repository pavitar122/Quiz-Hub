import { loadAllCategories, loadAllCategoriesMeta, getCategoryById, getGroups } from "@/lib/questions";
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
    const meta = searchParams.get("meta");

    if(id){
      const cat = getCategoryById(id);
      if(!cat) return NextResponse.json({error:"Not found"},{status:404});
      // Short, private cache: a single subject's questions rarely change
      // mid-session, and this keeps back/forward nav between subject <->
      // quiz instant without re-downloading the whole category.
      return NextResponse.json({category: cat}, { headers: { "Cache-Control": "private, max-age=15" } });
    }

    const groups = getGroups();

    // Default path (used by the homepage): metadata only — titles,
    // descriptions, and per-subtopic question counts — never the full
    // question/answer bodies. This cuts the homepage payload from several
    // MB to a few KB.
    if(meta !== "0"){
      const categories = loadAllCategoriesMeta();
      return NextResponse.json({categories, groups}, { headers: { "Cache-Control": "private, max-age=30" } });
    }

    // Explicit opt-out (?meta=0) for callers that genuinely need every
    // question body across every category (e.g. admin bulk export).
    const categories = loadAllCategories();
    return NextResponse.json({categories, groups}, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("GET /api/questions failed:", e);
    return NextResponse.json({ error: e.message || "Failed to load questions." }, { status: 500 });
  }
}
