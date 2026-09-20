import { loadAllCategories, loadAllCategoriesMeta, getCategoryById, getGroups, saveCategory, deleteCategory } from "@/lib/questions";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";

// Keep this route dynamic so admin edits are visible immediately.
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const payload = token ? verifyToken(token) : null;
  return payload?.role === "admin";
}

export async function GET(req){
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const meta = searchParams.get("meta");

    if(id){
      const cat = await getCategoryById(id);
      if(!cat) return NextResponse.json({error:"Not found"},{status:404});
      return NextResponse.json({category: cat}, { headers: { "Cache-Control": "no-store" } });
    }

    const groups = getGroups();

    // Default path (used by the homepage): metadata only — titles,
    // descriptions, and per-subtopic question counts — never the full
    // question/answer bodies. This cuts the homepage payload from several
    // MB to a few KB.
    if(meta !== "0"){
      const categories = await loadAllCategoriesMeta();
      return NextResponse.json({categories, groups}, { headers: { "Cache-Control": "no-store" } });
    }

    // Explicit opt-out (?meta=0) for callers that genuinely need every
    // question body across every category (e.g. admin bulk export).
    const categories = await loadAllCategories();
    return NextResponse.json({categories, groups}, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("GET /api/questions failed:", e);
    return NextResponse.json({ error: e.message || "Failed to load questions." }, { status: 500 });
  }
}

export async function POST(req){
  if (!isAdmin()) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  try {
    const body = await req.json();
    const saved = await saveCategory(body);
    return NextResponse.json({category: saved});
  } catch (e) {
    return NextResponse.json({error: e.message}, {status: 500});
  }
}

export async function PUT(req){
  if (!isAdmin()) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  try {
    const body = await req.json();
    const saved = await saveCategory(body);
    return NextResponse.json({category: saved});
  } catch (e) {
    return NextResponse.json({error: e.message}, {status: 500});
  }
}

export async function DELETE(req){
  if (!isAdmin()) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if(!id) return NextResponse.json({error: "ID required"}, {status: 400});
    await deleteCategory(id);
    return NextResponse.json({success: true});
  } catch (e) {
    return NextResponse.json({error: e.message}, {status: 500});
  }
}
