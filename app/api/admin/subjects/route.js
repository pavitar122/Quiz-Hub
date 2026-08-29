import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getCategoryById, saveCategory, deleteCategoryFile } from "@/lib/questions";
import fs from "fs";
import path from "path";

function isAdmin(){
  const token=cookies().get(COOKIE_NAME)?.value;
  if(!token) return false;
  const p=verifyToken(token);
  return p && p.role==="admin";
}

function slugify(s){
  return (s||"").toString().toLowerCase().trim().replace(/[^a-z0-9]+/g,"-").replace(/(^-+|-+$)/g,"")||"subject";
}

export async function POST(req){
  if(!isAdmin()) return NextResponse.json({error:"Admin only"},{status:403});
  const body=await req.json();
  if(body.action==="createSubject"){
    const id=slugify(body.title);
    const { loadAllCategories } = await import("@/lib/questions");
    const existing=loadAllCategories().find(c=>c.id===id);
    if(existing) return NextResponse.json({error:"Subject id already exists"},{status:400});
    const cat={id, title:body.title, description: body.description||"", group: body.group||"civil1", subcats:[{name:"General", questions:[]}]};
    saveCategory(cat);
    return NextResponse.json({category: cat});
  }
  if(body.action==="addQuestion"){
    const cat=getCategoryById(body.catId);
    if(!cat) return NextResponse.json({error:"Category not found"},{status:404});
    const sIdx=parseInt(body.subIdx);
    if(!cat.subcats[sIdx]) return NextResponse.json({error:"Subtopic not found"},{status:400});
    const nextNum = (Math.max(0,...cat.subcats.flatMap(s=>s.questions.map(q=>q.num)))+1) || 9001;
    // ensure unique across all
    let num=nextNum;
    while(cat.subcats.some(s=>s.questions.some(q=>q.num===num))) num++;
    cat.subcats[sIdx].questions.push({num, text: body.data.text, options: body.data.options, correct: body.data.correct, expl: body.data.expl});
    saveCategory(cat);
    return NextResponse.json({ok:true, num});
  }
  if(body.action==="editQuestion"){
    const cat=getCategoryById(body.catId);
    if(!cat) return NextResponse.json({error:"Category not found"},{status:404});
    const sIdx=parseInt(body.subIdx);
    const q=cat.subcats[sIdx]?.questions.find(q=>q.num===body.num);
    if(!q) return NextResponse.json({error:"Question not found"},{status:404});
    q.text=body.data.text; q.options=body.data.options; q.correct=body.data.correct; q.expl=body.data.expl;
    saveCategory(cat);
    return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"Unknown action"},{status:400});
}

export async function PUT(req){
  if(!isAdmin()) return NextResponse.json({error:"Admin only"},{status:403});
  // same as addQuestion edit path handled above, but keep for REST
  const body=await req.json();
  if(body.action==="editQuestion"){
    const cat=getCategoryById(body.catId);
    if(!cat) return NextResponse.json({error:"Category not found"},{status:404});
    const sIdx=parseInt(body.subIdx);
    const q=cat.subcats[sIdx]?.questions.find(q=>q.num===body.num);
    if(!q) return NextResponse.json({error:"Question not found"},{status:404});
    Object.assign(q, body.data);
    saveCategory(cat);
    return NextResponse.json({ok:true});
  }
  // update subject meta
  if(body.action==="updateSubject"){
    const cat=getCategoryById(body.catId);
    if(!cat) return NextResponse.json({error:"Not found"},{status:404});
    if(body.title) cat.title=body.title;
    if(body.description!==undefined) cat.description=body.description;
    if(body.group) cat.group=body.group;
    saveCategory(cat);
    return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"Unknown action"},{status:400});
}

export async function DELETE(req){
  if(!isAdmin()) return NextResponse.json({error:"Admin only"},{status:403});
  const { searchParams } = new URL(req.url);
  const id=searchParams.get("id");
  if(id){
    const ok=deleteCategoryFile(id);
    if(!ok) return NextResponse.json({error:"Not found"},{status:404});
    return NextResponse.json({ok:true});
  }
  const body=await req.json().catch(()=>null);
  if(body && body.catId && body.subIdx!==undefined && body.num!==undefined){
    const cat=getCategoryById(body.catId);
    if(!cat) return NextResponse.json({error:"Not found"},{status:404});
    const sIdx=parseInt(body.subIdx);
    const arr=cat.subcats[sIdx]?.questions;
    if(!arr) return NextResponse.json({error:"Subtopic not found"},{status:400});
    const idx=arr.findIndex(q=>q.num===body.num);
    if(idx===-1) return NextResponse.json({error:"Question not found"},{status:404});
    arr.splice(idx,1);
    saveCategory(cat);
    return NextResponse.json({ok:true});
  }
  return NextResponse.json({error:"Missing id"},{status:400});
}
