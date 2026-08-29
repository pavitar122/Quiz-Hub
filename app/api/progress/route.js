import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Progress from "@/models/Progress";

function getUserId(){
  const token=cookies().get(COOKIE_NAME)?.value;
  if(!token) return null;
  const p=verifyToken(token);
  return p?.id || null;
}

export async function GET(){
  const userId=getUserId();
  if(!userId) return NextResponse.json({progress:null});
  await connectDB();
  let prog=await Progress.findOne({userId});
  if(!prog){ prog=await Progress.create({userId}); }
  return NextResponse.json({progress: prog});
}

export async function POST(req){
  const userId=getUserId();
  if(!userId) return NextResponse.json({error:"Not authenticated"},{status:401});
  const body=await req.json();
  await connectDB();
  let prog=await Progress.findOne({userId});
  if(!prog) prog=await Progress.create({userId});

  if(body.type==="answer"){
    const key= body.subIdx+"-"+body.num;
    prog.stats.totalAnswered++;
    if(body.correct){
      prog.stats.totalCorrect++;
      prog.stats.streak++;
      if(prog.stats.streak>prog.stats.bestStreak) prog.stats.bestStreak=prog.stats.streak;
    } else {
      prog.stats.streak=0;
      if(!prog.missCounts[body.catId]) prog.missCounts[body.catId]={};
      // ensure plain object mutation triggers
      const m={...prog.missCounts};
      if(!m[body.catId]) m[body.catId]={};
      m[body.catId][key]=(m[body.catId][key]||0)+1;
      prog.missCounts=m;
      prog.markModified("missCounts");
    }
    prog.markModified("stats");
    await prog.save();
    return NextResponse.json({ok:true});
  }

  if(body.type==="bookmark"){
    const key= body.subIdx+"-"+body.num;
    const m={...prog.bookmarks};
    if(!m[body.catId]) m[body.catId]=[];
    const idx=m[body.catId].indexOf(key);
    if(idx===-1) m[body.catId].push(key); else m[body.catId].splice(idx,1);
    prog.bookmarks=m;
    prog.markModified("bookmarks");
    await prog.save();
    return NextResponse.json({ok:true});
  }

  if(body.type==="complete"){
    if(!prog.bestScores[body.catId]) prog.bestScores[body.catId]={};
    const pct=Math.round((body.score/body.total)*100);
    const prev=prog.bestScores[body.catId][body.kind];
    const obj={...prog.bestScores};
    if(!prev || pct>prev.pct) obj[body.catId][body.kind]={correct:body.score,total:body.total,pct,date:Date.now()};
    prog.bestScores=obj;
    prog.stats.sessionsCompleted++;
    prog.markModified("bestScores");
    prog.markModified("stats");
    await prog.save();
    return NextResponse.json({ok:true});
  }

  if(body.type==="practiceComplete"){
    prog.stats.sessionsCompleted++;
    prog.markModified("stats");
    await prog.save();
    return NextResponse.json({ok:true});
  }

  // generic merge for admin edits? fallback
  return NextResponse.json({ progress: prog });
}
