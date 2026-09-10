"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import Link from "next/link";
import Confetti from "@/components/Confetti";
import Toast from "@/components/Toast";
import Counter from "@/components/Counter";

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

  const flashToast=(msg)=>{
    setToastMsg(msg);
    setToastShow(true);
    setTimeout(()=>setToastShow(false), 1600);
  };

  useEffect(()=>{
    setEmpty(false);
    fetch(`/api/questions?id=${id}`).then(r=>r.json()).then(d=>{
      if(!d.category) return;
      setCat(d.category);
      const q = buildQueue(d.category, type, idx);
      if(q.length===0 && type!=="bookmarked" && type!=="missed"){ setEmpty(true); return; }
      if(q.length>0) initQuiz(q, d.category);
    });
    fetch("/api/progress").then(r=>r.json()).then(d=>setProgress(d.progress)).catch(()=>{});
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
    if(type==="bookmarked"){
      // need progress — fallback empty if no progress yet; will load from server later
      // we build from progress after fetch? For now return empty and re-build when progress arrives
      return [];
    }
    if(type==="missed") return [];
    return all;
  }
  function shuffle(arr){
    const a=arr.slice();
    for(let i=a.length-1;i>0;i--){ const j=Math.floor(Math.random()*(i+1)); [a[i],a[j]]=[a[j],a[i]]; }
    return a;
  }

  // handle bookmark/missed queues after progress loads
  useEffect(()=>{
    if(!cat || !progress || quiz) return;
    if(type==="bookmarked"){
      const keys=new Set(progress.bookmarks?.[cat.id]||[]);
      const out=[];
      cat.subcats.forEach((sc,sIdx)=> sc.questions.forEach(q=>{ if(keys.has(sIdx+"-"+q.num)) out.push({subIdx:sIdx, subName:sc.name, q}); }));
      if(out.length>0) initQuiz(out, cat); else setEmpty(true);
    }
    if(type==="missed"){
      const miss=progress.missCounts?.[cat.id]||{};
      const keys=Object.keys(miss).filter(k=>miss[k]>0);
      const out=[];
      cat.subcats.forEach((sc,sIdx)=> sc.questions.forEach(q=>{ if(keys.includes(sIdx+"-"+q.num)) out.push({subIdx:sIdx, subName:sc.name, q}); }));
      if(out.length>0) initQuiz(shuffle(out), cat); else setEmpty(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[progress,cat]);

  function chunkPracticeQueue(queue, size=5){
    const chunks=[];
    for(let i=0;i<queue.length;i+=size){ chunks.push(queue.slice(i, i+size)); }
    return chunks;
  }

  function rewardForPerformance(pct){
    if(pct>=90) return {label:"Legendary", emoji:"🏆", xp:"+25 XP", tone:"gold"};
    if(pct>=80) return {label:"Excellent", emoji:"🥇", xp:"+18 XP", tone:"gold"};
    if(pct>=70) return {label:"Strong", emoji:"⭐", xp:"+12 XP", tone:"silver"};
    if(pct>=55) return {label:"Solid", emoji:"✨", xp:"+8 XP", tone:"bronze"};
    return {label:"Review Run", emoji:"🔁", xp:"+4 XP", tone:"neutral"};
  }

  function initQuiz(queue, category){
    const practiceGroups = mode==="practice" ? chunkPracticeQueue(queue, 5) : [];
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
      remaining: mode==="practice" ? (practiceGroups[0]?.slice(1) || []) : null,
      mastered:0,
      totalUnique:queue.length,
      attempts:0,
      firstTryCorrect:0,
      retryCounts:{},
      wrongAnswers:{},
      practiceCurrent: mode==="practice" ? (practiceGroups[0]?.[0] || null) : null,
      practiceGroups,
      practiceGroupIndex: mode==="practice" ? 0 : null,
      groupCorrect:0,
      groupTotal:0,
      waitingForNextCheckpoint:false,
      checkpointSummary:null,
      rewardHistory:[],
      startTime:Date.now(),
    });
  }

  const current = quiz ? (quiz.mode==="test" ? quiz.order[quiz.pos] : quiz.practiceCurrent) : null;

  const startNextPracticeCheckpoint = () => {
    if(!quiz || quiz.mode !== "practice") return;
    setQuiz(q => {
      if(!q.practiceGroups || q.practiceGroupIndex === null) return {...q, finished:true};
      const nextIndex = q.practiceGroupIndex + 1;
      const hasNext = nextIndex < q.practiceGroups.length;
      if(!hasNext) {
        return {...q, waitingForNextCheckpoint:false, checkpointSummary:null, finished:true};
      }
      const nextGroup = q.practiceGroups[nextIndex];
      return {
        ...q,
        practiceGroupIndex: nextIndex,
        practiceCurrent: nextGroup[0],
        remaining: nextGroup.slice(1),
        answered:false,
        selected:null,
        waitingForNextCheckpoint:false,
        checkpointSummary:null,
        groupCorrect:0,
        groupTotal:0,
      };
    });
  };

  const selectOption = async (choiceIdx)=>{
    if(!quiz || quiz.answered) return;
    const item=current;
    const correct = choiceIdx===item.q.correct;
    const updated={...quiz, answered:true, selected:choiceIdx};
    if(quiz.mode==="test"){
      if(correct) updated.score++;
      else updated.missed.push({item, selected:choiceIdx});
    } else {
      updated.attempts++;
      const groupTotal = (quiz.groupTotal || 0) + 1;
      updated.groupTotal = groupTotal;
      const rkey=item.subIdx+"-"+item.q.num;
      if(correct){
        updated.groupCorrect = (quiz.groupCorrect || 0) + 1;
        if(!(rkey in quiz.retryCounts)) updated.firstTryCorrect++;
        updated.mastered++;
      } else {
        updated.retryCounts[rkey]=(updated.retryCounts[rkey]||0)+1;
        updated.wrongAnswers={...quiz.wrongAnswers, [rkey]:{item, selected:choiceIdx}};
        const remaining = [...(updated.remaining || [])];
        const insertPos = remaining.length===0 ? 0 : 1+Math.floor(Math.random()*remaining.length);
        remaining.splice(insertPos,0,item);
        updated.remaining = remaining;
      }
    }
    setQuiz(updated);
    if(quiz.mode==="test"){
      try{
        await fetch("/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          type:"answer",
          catId: quiz.catId,
          subIdx: item.subIdx,
          num: item.q.num,
          correct,
          mode:"test"
        })});
      }catch{}
    }
  };

  const nextQuestion = async ()=>{
    if(!quiz) return;
    if(quiz.mode==="test"){
      const nextPos=quiz.pos+1;
      if(nextPos>=quiz.order.length){
        const snap = quiz;
        await fetch("/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          type:"complete",
          catId: snap.catId,
          kind: type==="full"?"FULL": type==="random"?"RANDOM": type==="bookmarked"?"BOOKMARKED": type==="missed"?"MISSED": String(idx),
          score: snap.score,
          total: snap.total,
          mode:"test"
        })});
        setQuiz(q => ({...q, finished:true, pct: Math.round(q.score/q.total*100)}));
        return;
      }
      setQuiz(q => ({...q, pos: nextPos, answered:false, selected:null}));
    } else {
      if(quiz.remaining.length===0){
        const totalInGroup = quiz.groupTotal || 0;
        const correctInGroup = quiz.groupCorrect || 0;
        const pct = totalInGroup > 0 ? Math.round((correctInGroup / totalInGroup) * 100) : 0;
        const reward = rewardForPerformance(pct);
        const currentGroupNumber = (quiz.practiceGroupIndex ?? 0) + 1;
        const totalGroups = quiz.practiceGroups?.length || 1;
        const summary = {
          correct: correctInGroup,
          total: totalInGroup,
          pct,
          reward,
          groupNumber: currentGroupNumber,
          totalGroups,
        };
        if((quiz.practiceGroupIndex ?? 0) + 1 < (quiz.practiceGroups?.length || 0)){
          setQuiz(q => ({...q, waitingForNextCheckpoint:true, checkpointSummary: summary, answered:false, selected:null, practiceCurrent:null, remaining:[], rewardHistory:[...q.rewardHistory, reward]}));
          return;
        }
        setQuiz(q => ({...q, finished:true, waitingForNextCheckpoint:false, checkpointSummary: summary, rewardHistory:[...q.rewardHistory, reward]}));
        return;
      }
      setQuiz(q => {
        const remaining = [...q.remaining];
        const nextItem = remaining.shift();
        return {...q, practiceCurrent: nextItem, answered:false, selected:null, remaining};
      });
    }
  };

  const toggleBookmark=async()=>{
    if(!current) return;
    const key=current.subIdx+"-"+current.q.num;
    // optimistic local update so the UI reacts instantly
    const wasBookmarked = !!progress?.bookmarks?.[id]?.includes(key);
    setProgress(p=>{
      const base=p||{};
      const existing=base.bookmarks?.[id]||[];
      const nextList = wasBookmarked ? existing.filter(k=>k!==key) : [...existing, key];
      return { ...base, bookmarks: { ...(base.bookmarks||{}), [id]: nextList } };
    });
    flashToast(wasBookmarked ? "Bookmark removed" : "★ Bookmarked");
    try{
      await fetch("/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        type:"bookmark",
        catId: id,
        subIdx: current.subIdx,
        num: current.q.num,
      })});
    }catch{}
  };
  const isBookmarked = progress && progress.bookmarks?.[id]?.includes(current?.subIdx+"-"+current?.q?.num);

  const restart=()=>{
    if(!cat) return;
    const q = buildQueue(cat, type, idx);
    if(q.length>0){ initQuiz(q, cat); return; }
    // bookmarked/missed queues depend on progress
    if(type==="bookmarked" || type==="missed") setQuiz(null);
  };

  const retryWrong=()=>{
    if(!cat || !quiz || quiz.mode!=="practice") return;
    const wrongItems = Object.values(quiz.wrongAnswers||{}).map(w=>w.item);
    if(wrongItems.length===0) return;
    initQuiz(wrongItems, cat);
  };

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
      const badgeLabel = quiz.pct >= 90 ? "Outstanding" : quiz.pct >= 80 ? "Great Work" : quiz.pct >= 70 ? "Well Done" : null;
      return (
        <div className={`dwg-card ${isCelebrated ? "result-celebrated" : ""}`}>
          {isCelebrated && <Confetti />}
          {isCelebrated ? (
            <span className="result-badge">{badgeLabel} · {quiz.pct >= 90 ? "✦ Excellent" : quiz.pct >= 70 ? "✦ Passed" : ""}</span>
          ) : (
            <span className="dwg-tag mono">RESULT · TEST MODE</span>
          )}
          <p className={`result-score serif`}>{quiz.score}/{quiz.total}</p>
          <p className="result-pct mono">{quiz.pct}% {isCelebrated ? "· Celebration unlocked" : "· Keep practicing"}</p>
          <div className="progress-bar"><div className="progress-fill" style={{width:quiz.pct+"%"}}></div></div>
          {isCelebrated && <p className="verdict serif">You cleared the threshold — blueprint complete. The fireworks are for you.</p>}
          {!isCelebrated && quiz.pct < 70 && <p className="verdict serif">Almost there — review your misses and try again. The next celebration is closer than you think.</p>}
          <div className="btn-row">
            <button className="btn" onClick={restart}>Retry Full Batch</button>
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
      return (
        <div className={`dwg-card ${isCelebrated ? "result-celebrated" : ""}`}>
          {isCelebrated && <Confetti />}
          <span className="dwg-tag mono">RESULT · PRACTICE MODE</span>
          <p className={`result-score serif`}>Mastered {quiz.totalUnique}</p>
          {isCelebrated && <p className="result-pct mono">All questions mastered — {practicePct}% on first try</p>}
          {!isCelebrated && <p className="result-pct mono">{practicePct}% first-try · Resilience counts too</p>}
          <div className="stat-grid">
            <div className="stat-box"><div className="num serif"><Counter value={quiz.totalUnique} /></div><div className="lab mono">Mastered</div></div>
            <div className="stat-box"><div className="num serif"><Counter value={quiz.attempts} /></div><div className="lab mono">Attempts</div></div>
            <div className="stat-box"><div className="num serif"><Counter value={quiz.firstTryCorrect} /></div><div className="lab mono">First Try Correct</div></div>
          </div>
          {isCelebrated && <p className="verdict serif">Every re-queue you survived made this glow possible. Beautiful persistence.</p>}
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

  if(quiz.mode === "practice" && quiz.waitingForNextCheckpoint){
    const summary = quiz.checkpointSummary || {};
    const reward = summary.reward || {label:"Reward", emoji:"✨", xp:"+0 XP", tone:"neutral"};
    const nextLabel = (quiz.practiceGroupIndex ?? 0) + 1 >= (quiz.practiceGroups?.length || 1) ? "Finish chapter" : "Next checkpoint →";
    const checkpointFill = reward.tone === "gold" ? "linear-gradient(90deg,#f6d365,#fda085)" : reward.tone === "silver" ? "linear-gradient(90deg,#dfe7ff,#a7b9ff)" : reward.tone === "bronze" ? "linear-gradient(90deg,#f3c98b,#d18452)" : "linear-gradient(90deg,#6ea8fe,#8ed0ff)";
    return (
      <div className="dwg-card" style={{padding:24}}>
        <span className="dwg-tag mono">CHECKPOINT COMPLETE</span>
        <h2 className="serif" style={{margin:"12px 0 4px"}}>Checkpoint {summary.groupNumber || 1} of {summary.totalGroups || 1}</h2>
        <p className="result-score serif" style={{margin:0}}>{summary.correct || 0}/{summary.total || 0}</p>
        <p className="result-pct mono">{summary.pct || 0}% accuracy · Reward: {reward.emoji} {reward.label}</p>
        <div className="progress-bar"><div className="progress-fill" style={{width:(summary.pct || 0)+"%", background: checkpointFill}}></div></div>
        <div className="btn-row" style={{marginTop:18}}>
          <button className="btn" onClick={startNextPracticeCheckpoint}>{nextLabel}</button>
          <Link href={`/subject/${id}`} className="btn secondary" style={{textDecoration:"none",display:"inline-block"}}>Back</Link>
        </div>
      </div>
    );
  }

  const q=current.q;
  const progressPct = quiz.mode==="test" ? Math.round(((quiz.pos+(quiz.answered?1:0))/quiz.total)*100) : Math.round((quiz.mastered/quiz.totalUnique)*100);
  const practiceCheckpointText = quiz.mode==="practice" && quiz.practiceGroups ? `Checkpoint ${((quiz.practiceGroupIndex ?? 0)+1)}/${quiz.practiceGroups.length}` : null;
  const checkpointMarkers = quiz.mode==="practice" && quiz.practiceGroups ? quiz.practiceGroups.map((_, index)=> ({
    left: (((index + 1) / quiz.practiceGroups.length) * 100),
    active: index <= (quiz.practiceGroupIndex ?? 0),
    label: index + 1,
  })) : [];

  return (
    <>
      <div className="top-bar"><Link href={`/subject/${id}`} className="back-link">← Back</Link><span className="score-badge">{quiz.mode==="test" ? `Score: ${quiz.score}/${quiz.pos+(quiz.answered?1:0)}` : `Attempts: ${quiz.attempts}`}</span></div>
      <div className="eyebrow"><span>{current.subName} · {quiz.mode==="test"? `Question ${quiz.pos+1} of ${quiz.total}` : practiceCheckpointText ? `${practiceCheckpointText} · Mastered ${quiz.mastered} of ${quiz.totalUnique}` : `Mastered ${quiz.mastered} of ${quiz.totalUnique}`}</span><span>#{q.num} · {quiz.mode.toUpperCase()}</span></div>
      <div className="quiz-progress-bar">
        <div className="quiz-progress-fill" style={{width:progressPct+"%"}}></div>
        {checkpointMarkers.length > 0 && checkpointMarkers.map((marker)=> (
          <div key={marker.label} className={`quiz-progress-marker ${marker.active ? "active" : ""}`} style={{left:`${marker.left}%`}} title={`Checkpoint ${marker.label}`} />
        ))}
      </div>
      <div className="dwg-card" key={(quiz.mode==="test"?quiz.pos:quiz.attempts)+"-"+q.num}>
        <div className="q-head-row q-transition">
          <p className="question-text">{q.text}</p>
          <button className={`bookmark-btn ${isBookmarked?"active":""}`} onClick={toggleBookmark} title="Bookmark">★</button>
        </div>
        <div className={`options ${quiz.answered?"answered":""}`}>
          {q.options.map((opt,i)=>{
            let cls="option-row";
            let showOk=false, showNo=false;
            if(quiz.answered){
              if(i===q.correct){ cls+=" correct"; showOk=true; }
              else if(i===quiz.selected){ cls+=" wrong"; showNo=true; }
              else cls+=" dim";
            }
            return (
              <div key={i} className={cls} onClick={()=>selectOption(i)}>
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