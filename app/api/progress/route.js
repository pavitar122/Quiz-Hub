import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import Progress from "@/models/Progress";
import { Category } from "@/models/Category";

function todayIST(){
  // YYYY-MM-DD in Asia/Kolkata — resets at midnight IST per user request
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}
function ensureDaily(prog){
  const today=todayIST();
  if(!prog.dailyTestCorrect || prog.dailyTestCorrect.date !== today){
    prog.dailyTestCorrect = { date: today, counts: {} };
    prog.markModified("dailyTestCorrect");
    return true;
  }
  // ensure counts object exists for older docs
  if(!prog.dailyTestCorrect.counts || typeof prog.dailyTestCorrect.counts!=="object"){
    prog.dailyTestCorrect.counts={};
    prog.markModified("dailyTestCorrect");
    return true;
  }
  return false;
}

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
  if(ensureDaily(prog)){
    await prog.save();
  }
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
    if(body.mode === "practice") return NextResponse.json({ok:true});
    ensureDaily(prog);
    const key= body.subIdx+"-"+body.num;
    prog.stats.totalAnswered++;
    if(body.correct){
      prog.stats.totalCorrect++;
      prog.stats.streak++;
      if(prog.stats.streak>prog.stats.bestStreak) prog.stats.bestStreak=prog.stats.streak;
      // daily test-mode correct counter per group (civil1 / civil2 / nontechnical)
      try{
        const cat=await Category.findOne({id: body.catId}).select("group").lean();
        const grp=cat?.group || "civil1";
        const dc={ ...prog.dailyTestCorrect };
        if(!dc.counts || typeof dc.counts!=="object") dc.counts={};
        const counts={ ...dc.counts };
        counts[grp]=(counts[grp]||0)+1;
        dc.counts=counts;
        // keep date fresh (in case day flipped mid-session)
        dc.date=todayIST();
        prog.dailyTestCorrect=dc;
        prog.markModified("dailyTestCorrect");
      }catch{}
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
    const obj={...prog.bestScores};
    // always record the most recent test result for this chapter, not just the best-ever score
    obj[body.catId][body.kind]={correct:body.score,total:body.total,pct,date:Date.now()};
    prog.bestScores=obj;

    const ac={...prog.attemptCounts};
    if(!ac[body.catId]) ac[body.catId]={};
    ac[body.catId][body.kind]=(ac[body.catId][body.kind]||0)+1;
    prog.attemptCounts=ac;

    prog.stats.sessionsCompleted++;
    prog.markModified("bestScores");
    prog.markModified("attemptCounts");
    prog.markModified("stats");
    await prog.save();
    return NextResponse.json({ok:true});
  }

  if(body.type==="practiceComplete"){
    return NextResponse.json({ok:true});
  }

  // generic merge for admin edits? fallback
  return NextResponse.json({ progress: prog });
}
