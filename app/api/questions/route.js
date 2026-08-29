import { loadAllCategories, getCategoryById, getGroups } from "@/lib/questions";
import { NextResponse } from "next/server";

export async function GET(req){
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if(id){
    const cat = getCategoryById(id);
    if(!cat) return NextResponse.json({error:"Not found"},{status:404});
    return NextResponse.json({category: cat});
  }
  const categories = loadAllCategories();
  const groups = (await import("@/lib/questions")).getGroups();
  return NextResponse.json({categories, groups});
}
