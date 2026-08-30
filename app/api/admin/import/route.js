import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { saveCategory, loadAllCategories } from "@/lib/questions";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function isAdmin(){
  const token=cookies().get(COOKIE_NAME)?.value;
  if(!token) return false;
  const p=verifyToken(token);
  return p && p.role==="admin";
}
function slugify(s){ return (s||"").toString().toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/(^-+|-+$)/g,"")||"subject"; }

function validate(obj){
  const errors=[];
  if(!obj || typeof obj!=="object") { errors.push("Invalid object"); return errors; }
  if(!obj.title || typeof obj.title!=="string") errors.push('Missing "title"');
  if(!Array.isArray(obj.subcats) || obj.subcats.length===0) { errors.push('Missing "subcats"'); return errors; }
  obj.subcats.forEach((sc,i)=>{
    const label=sc?.name||`Subtopic ${i+1}`;
    if(!sc || !sc.name) errors.push(`Subtopic ${i+1} missing name`);
    if(!Array.isArray(sc.questions) || sc.questions.length===0) { errors.push(`"${label}" has no questions`); return; }
    sc.questions.forEach((q,qi)=>{
      const qLabel=`Q${qi+1} in "${label}"`;
      if(!q || !q.text) errors.push(`${qLabel} missing text`);
      if(!Array.isArray(q.options) || q.options.length!==4) errors.push(`${qLabel} needs 4 options`);
      const c=Number(q.correct);
      if(isNaN(c)||c<0||c>3) errors.push(`${qLabel} needs correct 0-3`);
    });
  });
  return errors;
}

export async function POST(req){
  if(!isAdmin()) return NextResponse.json({error:"Admin only"},{status:403});
  try {
    const { data, group } = await req.json();
    if(!data) return NextResponse.json({error:"No data"},{status:400});
    const errors=validate(data);
    if(errors.length) return NextResponse.json({error: errors.join("; ")},{status:400});
    let baseId=slugify(data.id || data.title);
    const existing=loadAllCategories().map(c=>c.id);
    let id=baseId, n=2;
    while(existing.includes(id)){ id=baseId+"-"+n; n++; }
    const subcats=data.subcats.map(sc=>({
      name: sc.name,
      questions: sc.questions.map((q,i)=>({
        num: typeof q.num==="number" ? q.num : i+1,
        text: q.text,
        options: q.options.slice(0,4),
        correct: Number(q.correct),
        expl: q.expl||"",
      }))
    }));
    const category={ id, title: data.title, description: data.description||"", group: group||"civil1", subcats };
    saveCategory(category);
    return NextResponse.json({ok:true, category});
  } catch (e) {
    console.error("POST /api/admin/import failed:", e);
    return NextResponse.json({ error: e.message || "Import failed." }, { status: 500 });
  }
}
