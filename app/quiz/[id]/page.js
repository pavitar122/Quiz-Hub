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
  },[progress,cat]);

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

  const selectOption = async (choiceIdx)=>{
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
    // persist to server
    try{
      await fetch("/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
        type:"answer",
        catId: quiz.catId,
        subIdx: item.subIdx,
        num: item.q.num,
        correct,
      })});
    }catch{}
  };

  const nextQuestion = async ()=>{
    if(!quiz) return;
    if(quiz.mode==="test"){
      const nextPos=quiz.pos+1;
      if(nextPos>=quiz.order.length){
        // finish, record best & session
        await fetch("/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          type:"complete",
          catId: quiz.catId,
          kind: type==="full"?"FULL": type==="random"?"RANDOM": type==="bookmarked"?"BOOKMARKED": type==="missed"?"MISSED": String(idx),
          score: quiz.score + (quiz.answered && quiz.selected===current.q.correct ? 0:0), // score already includes last answer? Actually we updated score above
          total: quiz.total,
          mode:"test"
        })});
        // show result inline instead of navigating
        setQuiz({...quiz, finished:true, pct: Math.round(quiz.score/quiz.total*100)});
        return;
      }
      setQuiz({...quiz, pos: nextPos, answered:false, selected:null});
    } else {
      if(quiz.remaining.length===0){
        await fetch("/api/progress",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({
          type:"practiceComplete",
          catId: quiz.catId,
          totalUnique: quiz.totalUnique,
          attempts: quiz.attempts,
          mode:"practice"
        })});
        setQuiz({...quiz, finished:true});
        return;
      }
      const nextItem=quiz.remaining.shift();
      setQuiz({...quiz, practiceCurrent: nextItem, answered:false, selected:null, remaining:[...quiz.remaining]});
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
    if(!cat || !quiz) return;
    const wrongItems = quiz.mode==="test"
      ? quiz.missed.map(m=>m.item)
      : Object.values(quiz.wrongAnswers||{}).map(w=>w.item);
    if(wrongItems.length===0) return;
    initQuiz(wrongItems, cat);
  };

  if(empty) return (
    <div className="dwg-card">
      <span className="dwg-tag mono">NOTHING TO PRACTICE</span>
      <p style={{marginTop:10}}>There's nothing queued up here yet.</p>
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
      return (
        <div className="dwg-card">
          {quiz.pct>=70 && <Confetti />}
          <span className="dwg-tag mono">RESULT · TEST MODE</span>
          <p className="result-score serif">{quiz.score}/{quiz.total}</p>
          <p className="result-pct mono">{quiz.pct}%</p>
          <div className="progress-bar"><div className="progress-fill" style={{width:quiz.pct+"%"}}></div></div>
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
      return (
        <div className="dwg-card">
          {practicePct>=70 && <Confetti />}
          <span className="dwg-tag mono">RESULT · PRACTICE MODE</span>
          <p className="result-score serif">Mastered {quiz.totalUnique}</p>
          <div className="stat-grid">
            <div className="stat-box"><div className="num serif"><Counter value={quiz.totalUnique} /></div><div className="lab mono">Mastered</div></div>
            <div className="stat-box"><div className="num serif"><Counter value={quiz.attempts} /></div><div className="lab mono">Attempts</div></div>
            <div className="stat-box"><div className="num serif"><Counter value={quiz.firstTryCorrect} /></div><div className="lab mono">First Try Correct</div></div>
          </div>
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
      <div className="top-bar"><Link href={`/subject/${id}`} className="back-link">← Back</Link><span className="score-badge">{quiz.mode==="test" ? `Score: ${quiz.score}/${quiz.pos+(quiz.answered?1:0)}` : `Attempts: ${quiz.attempts}`}</span></div>
      <div className="eyebrow"><span>{current.subName} · {quiz.mode==="test"? `Question ${quiz.pos+1} of ${quiz.total}` : `Mastered ${quiz.mastered} of ${quiz.totalUnique}`}</span><span>#{q.num} · {quiz.mode.toUpperCase()}</span></div>
      <div className="quiz-progress-bar"><div className="quiz-progress-fill" style={{width:progressPct+"%"}}></div></div>
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