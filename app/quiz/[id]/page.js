"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Confetti from "@/components/Confetti";
import TrophyBadge from "@/components/TrophyBadge";
import Toast from "@/components/Toast";
import Counter from "@/components/Counter";
import {
  getLocalProgress,
  recordLocalAnswer,
  toggleLocalBookmark,
  recordLocalComplete,
  recordLocalPracticeComplete,
} from "@/lib/storage";

function tierFor(pct){
  if(pct>=90) return "gold";
  if(pct>=80) return "silver";
  return "bronze";
}
const TIER_LINES = {
  gold: "Flawless run — that's top-tier work. Blueprint complete, no notes.",
  silver: "Strong, confident, and clean — you cleared it with room to spare.",
  bronze: "You crossed the line. That's the whole game — on to the next one.",
};

export default function QuizPage(){
  const { id } = useParams();
  const sp = useSearchParams();
  const mode = sp.get("mode")||"test";
  const type = sp.get("type")||"full";
  const idx = sp.get("idx");
  const [cat,setCat]=useState(null);
  const [quiz,setQuiz]=useState(null);
  const [progress,setProgress]=useState(null);
  const [toastMsg,setToastMsg]=useState("");
  const [toastShow,setToastShow]=useState(false);
  const [empty,setEmpty]=useState(false);
  const [notFound,setNotFound]=useState(false);

  const flashToast=(msg)=>{
    setToastMsg(msg);
    setToastShow(true);
    setTimeout(()=>setToastShow(false), 1600);
  };

  useEffect(()=>{
    setEmpty(false);
    setNotFound(false);
    fetch(`/api/questions?id=${id}`)
      .then(r=>r.json())
      .then(d=>{
        if(!d.category){ setNotFound(true); return; }
        setCat(d.category);
        const q = buildQueue(d.category, type, idx);
        if(q.length===0 && type!=="bookmarked" && type!=="missed"){ setEmpty(true); return; }
        if(q.length>0) initQuiz(q, d.category);
      })
      .catch(()=>{ setNotFound(true); });

    fetch("/api/progress")
      .then(r=>r.json())
      .then(d=>{
        if(d.progress) setProgress(d.progress);
        else setProgress(getLocalProgress());
      })
      .catch(()=>{ setProgress(getLocalProgress()); });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[id,type,idx,mode]);

  function buildQueue(cat, type, idx){
    const all=[];
    cat.subcats.forEach((sc,sIdx)=> sc.questions.forEach(q=> all.push({subIdx:sIdx, subName:sc.name, q})));
    if(type==="full") return all;
    if(type==="random") return shuffle(all).slice(0, Math.min(30, all.length));
    if(type==="sub") {
      const sIdx=parseInt(idx);
      const sc=cat.subcats[sIdx];
      return sc? sc.questions.map(q=>({subIdx:sIdx, subName:sc.name, q})): [];
    }
    if(type==="bookmarked" || type==="missed") return [];
    return all;
  }

  function shuffle(arr){
    const a=arr.slice();
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }

  // handle bookmark/missed queues after progress or category loads
  useEffect(()=>{
    if(!cat || quiz) return;
    if(type!=="bookmarked" && type!=="missed") return;
    const currentProg = progress || getLocalProgress();
    if(type==="bookmarked"){
      const keys=new Set(currentProg.bookmarks?.[cat.id]||[]);
      const out=[];
      cat.subcats.forEach((sc,sIdx)=> sc.questions.forEach(q=>{ if(keys.has(sIdx+"-"+q.num)) out.push({subIdx:sIdx, subName:sc.name, q}); }));
      if(out.length>0) initQuiz(out, cat); else setEmpty(true);
    }
    if(type==="missed"){
      const miss=currentProg.missCounts?.[cat.id]||{};
      const keys=Object.keys(miss).filter(k=>miss[k]>0);
      const out=[];
      cat.subcats.forEach((sc,sIdx)=> sc.questions.forEach(q=>{ if(keys.includes(sIdx+"-"+q.num)) out.push({subIdx:sIdx, subName:sc.name, q}); }));
      if(out.length>0) initQuiz(shuffle(out), cat); else setEmpty(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[progress,cat,type]);

  function initQuiz(queue, category){
    setQuiz({
      catId: category.id,
      mode,
      order: queue,
      pos:0,
      answered:false,
      selected:null,
      score:0,
      total:queue.length,
      missed:[],
      remaining: mode==="practice"? queue.slice(): null,
      mastered:0,
      totalUnique:queue.length,
      attempts:0,
      firstTryCorrect:0,
      retryCounts:{},
      wrongAnswers:{},
      practiceCurrent: mode==="practice"? queue[0] : null,
      startTime:Date.now(),
    });
    // for practice, remaining should start after first
    if(mode==="practice"){
      setQuiz(q=> ({...q, remaining: queue.slice(1), practiceCurrent: queue[0]}));
    }
  }

  const current = quiz ? (quiz.mode==="test" ? quiz.order[quiz.pos] : quiz.practiceCurrent) : null;

  const selectOption = (choiceIdx)=>{
    if(!quiz || quiz.answered) return;
    const item=current;
    const correct = choiceIdx===item.q.correct;
    // update local stats
    const updated={...quiz, answered:true, selected:choiceIdx};
    if(quiz.mode==="test"){
      if(correct) updated.score++;
      else updated.missed.push({item, selected:choiceIdx});
    } else {
      updated.attempts++;
      const rkey=item.subIdx+"-"+item.q.num;
      if(correct){
        if(!(rkey in quiz.retryCounts)) updated.firstTryCorrect++;
        updated.mastered++;
      } else {
        updated.retryCounts[rkey]=(updated.retryCounts[rkey]||0)+1;
        updated.wrongAnswers={...quiz.wrongAnswers, [rkey]:{item, selected:choiceIdx}};
        const insertPos = updated.remaining.length===0 ? 0 : 1+Math.floor(Math.random()*updated.remaining.length);
        updated.remaining.splice(insertPos,0,item);
      }
    }
    setQuiz(updated);

    // Persist locally immediately
    const updatedProg = recordLocalAnswer(quiz.catId, item.subIdx, item.q.num, correct);
    setProgress(p => ({ ...(p || {}), ...updatedProg }));

    // Sync to server in background if session exists (non-blocking)
    fetch("/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      type:"answer",
      catId: quiz.catId,
      subIdx: item.subIdx,
      num: item.q.num,
      correct,
    })}).catch(()=>{});
  };

  const nextQuestion = ()=>{
    if(!quiz) return;
    if(quiz.mode==="test"){
      const nextPos=quiz.pos+1;
      if(nextPos>=quiz.order.length){
        const snap = quiz;
        const kind = type==="full"?"FULL": type==="random"?"RANDOM": type==="bookmarked"?"BOOKMARKED": type==="missed"?"MISSED": String(idx);
        const updatedProg = recordLocalComplete(snap.catId, kind, snap.score, snap.total);
        setProgress(p => ({ ...(p || {}), ...updatedProg }));

        // Background cloud sync
        fetch("/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          type:"complete",
          catId: snap.catId,
          kind,
          score: snap.score,
          total: snap.total,
          mode:"test"
        })}).catch(()=>{});

        // show result inline instead of navigating
        setQuiz(q => ({...q, finished:true, pct: Math.round(q.score/q.total*100)}));
        return;
      }
      setQuiz(q => ({...q, pos: nextPos, answered:false, selected:null}));
    } else {
      if(quiz.remaining.length===0){
        const snap = quiz;
        const updatedProg = recordLocalPracticeComplete();
        setProgress(p => ({ ...(p || {}), ...updatedProg }));

        fetch("/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          type:"practiceComplete",
          catId: snap.catId,
          totalUnique: snap.totalUnique,
          attempts: snap.attempts,
          mode:"practice"
        })}).catch(()=>{});

        setQuiz(q => ({...q, finished:true}));
        return;
      }
      // avoid mutating state directly — copy first
      setQuiz(q => {
        const remaining = [...q.remaining];
        const nextItem = remaining.shift();
        return {...q, practiceCurrent: nextItem, answered:false, selected:null, remaining};
      });
    }
  };

  const toggleBookmark=()=>{
    if(!current) return;
    const { prog: updatedProg, isBookmarked } = toggleLocalBookmark(id, current.subIdx, current.q.num);
    setProgress(p => ({ ...(p || {}), ...updatedProg }));
    flashToast(isBookmarked ? "★ Bookmarked" : "Bookmark removed");

    fetch("/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
      type:"bookmark",
      catId: id,
      subIdx: current.subIdx,
      num: current.q.num,
    })}).catch(()=>{});
  };

  const isBookmarked = (progress || getLocalProgress())?.bookmarks?.[id]?.includes(current?.subIdx+"-"+current?.q?.num);

  const restart=()=>{
    if(!cat) return;
    const q = buildQueue(cat, type, idx);
    if(q.length>0){ initQuiz(q, cat); return; }
    // bookmarked/missed queues depend on progress
    if(type==="bookmarked" || type==="missed") setQuiz(null);
  };

  const retryWrong=()=>{
    if(!cat || !quiz) return;
    const wrongItems = quiz.mode==="test"
      ? quiz.missed.map(m=>m.item)
      : Object.values(quiz.wrongAnswers||{}).map(w=>w.item);
    if(wrongItems.length===0) return;
    initQuiz(wrongItems, cat);
  };

  if(notFound) return (
    <div className="dwg-card">
      <span className="dwg-tag mono">NOT FOUND</span>
      <h2 className="serif" style={{marginTop:10}}>Subject Not Found</h2>
      <p style={{marginTop:8}}>The requested category or quiz could not be loaded.</p>
      <div className="btn-row" style={{marginTop:18}}>
        <Link href="/" className="btn secondary" style={{textDecoration:"none",display:"inline-block"}}>← Return to Categories</Link>
      </div>
    </div>
  );

  if(empty) return (
    <div className="dwg-card">
      <span className="dwg-tag mono">NOTHING TO PRACTICE</span>
      <p style={{marginTop:10}}>There&apos;s nothing queued up here yet.</p>
      <div className="btn-row">
        <Link href={`/subject/${id}`} className="btn secondary" style={{textDecoration:"none",display:"inline-block"}}>Back to Subject</Link>
      </div>
    </div>
  );

  if(!cat || !quiz) return (
    <div className="loading-row"><span className="spinner"></span> Loading quiz…</div>
  );
  if(quiz.finished){
    if(quiz.mode==="test"){
      const isCelebrated = quiz.pct >= 70;
      const tier = tierFor(quiz.pct);
      return (
        <div className={`dwg-card ${isCelebrated ? `result-celebrated tier-${tier}` : ""}`}>
          {isCelebrated && <Confetti />}
          {isCelebrated && <TrophyBadge tier={tier} />}
          {isCelebrated ? (
            <span className="result-badge">{tier==="gold"?"Outstanding":tier==="silver"?"Great Work":"Well Done"} · {tier==="gold"?"✦ Excellent":"✦ Passed"}</span>
          ) : (
            <span className="dwg-tag mono">RESULT · TEST MODE</span>
          )}
          <p className={`result-score serif ${isCelebrated ? "result-score--pop" : ""} ${quiz.finished ? "counter-animate" : ""}`}>{quiz.score}/{quiz.total}</p>
          <p className="result-pct mono">{quiz.pct}% {isCelebrated ? "· Celebration unlocked" : "· Keep practicing"}</p>
          <div className="progress-bar"><div className={`progress-fill fill-animate ${isCelebrated?"progress-fill--glow":""}`} style={{"--pct":quiz.pct+"%", width:quiz.pct+"%"}}></div></div>
          {isCelebrated && <p className="verdict serif">{TIER_LINES[tier]}</p>}
          {!isCelebrated && quiz.pct < 70 && <p className="verdict serif">Almost there — review your misses and try again. The next celebration is closer than you think.</p>}
          <div className="btn-row">
            <button className="btn" onClick={restart}>Retry Full Batch</button>
            {quiz.missed.length>0 && <button className="btn secondary" onClick={retryWrong}>Retry Wrong Answers ({quiz.missed.length})</button>}
            <Link href={`/subject/${id}`} className="btn secondary" style={{textDecoration:"none",display:"inline-block"}}>Back to Subject</Link>
            <Link href="/" className="btn secondary" style={{textDecoration:"none",display:"inline-block"}}>Home</Link>
          </div>
          {quiz.missed.length>0 && (
            <div className="review-list">
              <span className="dwg-tag mono">MISSED ({quiz.missed.length})</span>
              {quiz.missed.map((m,i)=> (
                <div key={i} className="review-item">
                  <div className="rq serif">{m.item.q.text}</div>
                  <div className="ra wrong-ans mono">Your: {String.fromCharCode(65+m.selected)}) {m.item.q.options[m.selected]}</div>
                  <div className="ra right-ans mono">Correct: {String.fromCharCode(65+m.item.q.correct)}) {m.item.q.options[m.item.q.correct]}</div>
                  <div className="mono" style={{fontSize:12,marginTop:6}}>{m.item.q.expl}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    } else {
      const wrongList = Object.values(quiz.wrongAnswers||{});
      const practicePct = quiz.totalUnique>0 ? Math.round((quiz.firstTryCorrect/quiz.totalUnique)*100) : 0;
      const isCelebrated = practicePct >= 70;
      const tier = tierFor(practicePct);
      return (
        <div className={`dwg-card ${isCelebrated ? `result-celebrated tier-${tier}` : ""}`}>
          {isCelebrated && <Confetti />}
          {isCelebrated && <TrophyBadge tier={tier} />}
          <span className="dwg-tag mono">RESULT · PRACTICE MODE</span>
          <p className={`result-score serif ${isCelebrated ? "result-score--pop" : ""}`}>Mastered {quiz.totalUnique}</p>
          {isCelebrated && <p className="result-pct mono">All questions mastered — {practicePct}% on first try</p>}
          {!isCelebrated && <p className="result-pct mono">{practicePct}% first-try · Resilience counts too</p>}
          <div className="stat-grid">
            <div className="stat-box"><div className="num serif"><Counter value={quiz.totalUnique} /></div><div className="lab mono">Mastered</div></div>
            <div className="stat-box"><div className="num serif"><Counter value={quiz.attempts} /></div><div className="lab mono">Attempts</div></div>
            <div className="stat-box"><div className="num serif"><Counter value={quiz.firstTryCorrect} /></div><div className="lab mono">First Try Correct</div></div>
          </div>
          {isCelebrated && <p className="verdict serif">{TIER_LINES[tier]} Every re-queue you survived made this glow possible.</p>}
          <div className="btn-row">
            <button className="btn" onClick={restart}>Retry Full Batch</button>
            {wrongList.length>0 && <button className="btn secondary" onClick={retryWrong}>Retry Wrong Answers ({wrongList.length})</button>}
            <Link href={`/subject/${id}`} className="btn secondary" style={{textDecoration:"none",display:"inline-block"}}>Back</Link>
          </div>
          {wrongList.length>0 && (
            <div className="review-list">
              <span className="dwg-tag mono">ANSWERED WRONG AT LEAST ONCE ({wrongList.length})</span>
              {wrongList.map((m,i)=> (
                <div key={i} className="review-item">
                  <div className="rq serif">{m.item.q.text}</div>
                  <div className="ra wrong-ans mono">Your: {String.fromCharCode(65+m.selected)}) {m.item.q.options[m.selected]}</div>
                  <div className="ra right-ans mono">Correct: {String.fromCharCode(65+m.item.q.correct)}) {m.item.q.options[m.item.q.correct]}</div>
                  <div className="mono" style={{fontSize:12,marginTop:6}}>{m.item.q.expl}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }
  }

  const q=current.q;
  const progressPct = quiz.mode==="test" ? Math.round(((quiz.pos+(quiz.answered?1:0))/quiz.total)*100) : Math.round((quiz.mastered/quiz.totalUnique)*100);

  return (
    <>
      <div className="top-bar"><Link href={`/subject/${id}`} className="back-link">← Back</Link><span className="score-badge bump" key={quiz.mode==="test" ? `${quiz.score}-${quiz.pos}` : quiz.attempts}>{quiz.mode==="test" ? `Score: ${quiz.score}/${quiz.pos+(quiz.answered?1:0)}` : `Attempts: ${quiz.attempts}`}</span></div>
      <div className="eyebrow"><span>{current.subName} · {quiz.mode==="test"? `Question ${quiz.pos+1} of ${quiz.total}` : `Mastered ${quiz.mastered} of ${quiz.totalUnique}`}</span><span>#{q.num} · {quiz.mode.toUpperCase()}</span></div>
      <div className="quiz-progress-bar"><div className="quiz-progress-fill" style={{width:progressPct+"%"}}></div></div>
      <div className="dwg-card" key={(quiz.mode==="test"?quiz.pos:quiz.attempts)+"-"+q.num}>
        <div className="q-head-row q-transition">
          <p className="question-text">{q.text}</p>
          <button className={`bookmark-btn ${isBookmarked?"active":""}`} onClick={toggleBookmark} title="Bookmark" aria-label={isBookmarked?"Remove bookmark":"Bookmark this question"} aria-pressed={!!isBookmarked}>★</button>
        </div>
<div className={`options ${quiz.answered?"answered":""}`} role="radiogroup" aria-label="Answer options">
          {q.options.map((opt,i)=>{
            let cls="option-row";
            let showOk=false, showNo=false;
            if(quiz.answered){
              if(i===q.correct){ cls+=" correct"; showOk=true; }
              else if(i===quiz.selected){ cls+=" wrong"; showNo=true; }
              else cls+=" dim";
            }
return (
              <div
                key={i}
                className={cls}
                role="radio"
                aria-checked={quiz.selected===i}
                tabIndex={quiz.answered?-1:0}
                onClick={()=>selectOption(i)}
                onKeyDown={(e)=>{ if(!quiz.answered && (e.key==="Enter"||e.key===" ")){ e.preventDefault(); selectOption(i); } }}
              >
                 {showOk && <span className="stamp stamp-ok">✓ Correct</span>}
                 {showNo && <span className="stamp stamp-no">✗ Your answer</span>}
                 <span className="option-letter">{String.fromCharCode(65+i)}</span>
                 <span>{opt}</span>
               </div>
             );
           })}
         </div>
         {quiz.answered && (
          <div className="explain-box">
            <span className="label mono">{quiz.selected===q.correct ? "Correct" : "Explanation"} · Answer: {String.fromCharCode(65+q.correct)}</span>
            {q.expl}
            {quiz.mode==="practice" && quiz.selected!==q.correct && <div className="practice-note">This question will resurface later.</div>}
          </div>
        )}
        <div className="btn-row end"><button className="btn" onClick={nextQuestion} disabled={!quiz.answered}>Next →</button></div>
      </div>
      <Toast message={toastMsg} show={toastShow} />
    </>
  );
}