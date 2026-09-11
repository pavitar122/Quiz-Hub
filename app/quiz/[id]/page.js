"use client";
import { useEffect, useState, useRef, useCallback } from "react";
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

  // ---- Listen & Learn state ----
  const [listenQueue,setListenQueue]=useState(null);
  const [listenIdx,setListenIdx]=useState(0);
  const [listenPhase,setListenPhase]=useState("idle"); // question | options | answer | expl
  const [isPlaying,setIsPlaying]=useState(false);
  const [listenFinished,setListenFinished]=useState(false);
  const [rate,setRate]=useState(1);
  const [voices,setVoices]=useState([]);
  const [selectedVoiceURI,setSelectedVoiceURI]=useState("");
  const [speechSupported,setSpeechSupported]=useState(true);
  const utteranceRef=useRef(null);
  const timeoutRef=useRef(null);
  const isPlayingRef=useRef(false);
  const rateRef=useRef(1);
  const voiceRef=useRef(null);
  const selectedVoiceURIRef=useRef(""); // avoids re-subscribing voiceschanged on every selection
  const heartbeatRef=useRef(null); // keeps Chrome's TTS engine alive past its ~15s cutoff
  const cancelledRef=useRef(false); // distinguishes an intentional cancel() from a real onerror
  const resumeSegRef=useRef(0); // which segment (question/options/answer/expl) to resume from

  const flashToast=(msg)=>{
    setToastMsg(msg);
    setToastShow(true);
    setTimeout(()=>setToastShow(false), 1600);
  };

  // load voices
  useEffect(()=>{
    if(mode!=="listen") return;
    if(typeof window==="undefined" || !("speechSynthesis" in window)){
      setSpeechSupported(false);
      return;
    }
    const curateVoices=(vs)=>{
      const enAll=vs.filter(v=>v.lang.toLowerCase().startsWith("en"));
      const pool=enAll.length>=2 ? enAll : vs;
      const isFemale=(name, uri)=>{
        const s=(name+" "+uri).toLowerCase();
        if(/female/.test(s)) return true;
        // Indian TTS voices commonly shipped by Android/Samsung/Nuance engines
        if(/zira|aria|samantha|susan|helen|eva|neerja|heera|kalpana|veena|priya|divya|deepa|aditi|isha|kajal|swara|raveena|ananya|lekha/.test(s)) return true;
        if(s.includes("google us english") && !s.includes("male")) return true;
        return false;
      };
      const isMale=(name, uri)=>{
        const s=(name+" "+uri).toLowerCase();
        if(/male/.test(s)) return true;
        // Indian TTS voices commonly shipped by Android/Samsung/Nuance engines
        if(/david|mark|guy|prabhat|madhur|hemant|george|alex|daniel|rishi|ravi|arjun|rahul|vikram|ajit/.test(s)) return true;
        return false;
      };
      const females=[];
      const males=[];
      const unknown=[];
      pool.forEach(v=>{
        if(isFemale(v.name, v.voiceURI)) females.push(v);
        else if(isMale(v.name, v.voiceURI)) males.push(v);
        else unknown.push(v);
      });
      const score=(v)=>{
        let s=0;
        if(v.localService) s-=10;
        const l=v.lang.toLowerCase();
        if(l==="en-in") s+=0;
        else if(l==="en-us") s+=1;
        else if(l==="en-gb") s+=2;
        else s+=3;
        return s;
      };
      females.sort((a,b)=> score(a)-score(b));
      males.sort((a,b)=> score(a)-score(b));
      unknown.sort((a,b)=> score(a)-score(b));

      // helper to wrap a native voice into our display object
      const wrap=(v, gender, opts={})=>{
        return {
          _id: opts._id || v.voiceURI,
          name: opts.name || v.name,
          lang: v.lang,
          voiceURI: v.voiceURI,
          localService: v.localService,
          _gender: gender,
          _baseVoice: v,
          _pitch: opts._pitch ?? (gender==="male"?0.92: gender==="female"?1.06:1),
          _synthetic: !!opts._synthetic,
          _native: v,
        };
      };

      const outF=[];
      const outM=[];

      // take up to 2 real females
      females.slice(0,2).forEach(v=> outF.push(wrap(v,"female")));
      // take up to 3 real males
      males.slice(0,3).forEach(v=> outM.push(wrap(v,"male")));

      // Many Android tablets expose a real en-IN voice with a generic system name
      // (e.g. plain "English (India)") that doesn't match any name pattern above, so
      // it lands in `unknown` rather than `females`/`males`. Since `score()` already
      // ranks en-IN highest, pick the best-scored voice across BOTH the recognized
      // and unknown pools — not just the first recognized one — so an on-device
      // Indian voice is preferred over a same-gender US/UK voice when filling the
      // synthesized slots below.
      const femalePool=[...females, ...unknown].sort((a,b)=> score(a)-score(b));
      const malePool=[...males, ...unknown].sort((a,b)=> score(a)-score(b));

      // Guarantee 2F: if fewer than 2, synthesize from best available (Indian-first) voice
      const femaleBase = femalePool[0] || pool[0];
      const femalePitches=[1.06, 1.14];
      while(outF.length<2){
        const idx=outF.length;
        const base=femaleBase;
        if(!base) break;
        outF.push(wrap(base,"female",{
          _id: base.voiceURI+"#f"+idx,
          name: base.name+" · F"+(idx+1),
          _pitch: femalePitches[idx]||1.1,
          _synthetic: true,
        }));
      }
      // Guarantee 3M: synthesize if tablet only has 1 male (e.g. Google UK English Male)
      const maleBase = malePool[0] || pool[0];
      const malePitches=[0.92, 0.85, 0.78];
      const maleNames=["", " Deep", " Bass"];
      while(outM.length<3){
        const idx=outM.length;
        const base=maleBase;
        if(!base) break;
        outM.push(wrap(base,"male",{
          _id: base.voiceURI+"#m"+idx,
          name: (males[0]?.name || base.name)+" · M"+(idx+1)+maleNames[idx],
          _pitch: malePitches[idx]||0.84,
          _synthetic: true,
        }));
      }

      const out=[...outF.slice(0,2), ...outM.slice(0,3)];
      return out;
    };
    const load=()=>{
      const vs=window.speechSynthesis.getVoices()||[];
      if(vs.length>0){
        const curated=curateVoices(vs);
        setVoices(curated);
        const currentSel=selectedVoiceURIRef.current;
        if(!currentSel){
          const pref= curated[0];
          if(pref){ setSelectedVoiceURI(pref._id); voiceRef.current=pref; }
        } else if(!curated.find(v=>v._id===currentSel)){
          setSelectedVoiceURI(curated[0]._id); voiceRef.current=curated[0];
        }
      }
    };
    load();
    window.speechSynthesis.onvoiceschanged=load;
    const t=setTimeout(load, 600);
    // Android tablet: voices arrive late, poll a few times
    let tries=0;
    const iv=setInterval(()=>{
      tries++;
      const vs=window.speechSynthesis.getVoices()||[];
      if(vs.length>0) load();
      if(tries>6) clearInterval(iv);
    }, 800);
    return ()=>{ clearTimeout(t); clearInterval(iv); if(window.speechSynthesis) window.speechSynthesis.onvoiceschanged=null; };
    // Only re-run when entering/leaving listen mode. selectedVoiceURI is read via
    // selectedVoiceURIRef so picking a voice doesn't tear down and re-poll voices.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[mode]);

  useEffect(()=>{ isPlayingRef.current=isPlaying; },[isPlaying]);
  useEffect(()=>{ rateRef.current=rate; },[rate]);
  useEffect(()=>{ selectedVoiceURIRef.current=selectedVoiceURI; },[selectedVoiceURI]);
  useEffect(()=>{
    if(!selectedVoiceURI) return;
    const v=voices.find(x=>x._id===selectedVoiceURI);
    if(v) voiceRef.current=v;
  },[selectedVoiceURI, voices]);

  // Chrome (desktop AND Android) silently stops SpeechSynthesis after ~15s on
  // non-local/"network" voices — a long-standing Chromium bug. Poking pause+resume
  // periodically while an utterance is speaking keeps the engine alive so long
  // option/explanation text doesn't get cut off mid-sentence.
  const stopHeartbeat=useCallback(()=>{
    if(heartbeatRef.current){ clearInterval(heartbeatRef.current); heartbeatRef.current=null; }
  },[]);
  const startHeartbeat=useCallback(()=>{
    stopHeartbeat();
    heartbeatRef.current=setInterval(()=>{
      const synth=typeof window!=="undefined" ? window.speechSynthesis : null;
      if(!synth) return;
      if(synth.speaking && !synth.paused){
        try{ synth.pause(); synth.resume(); }catch{}
      }
    }, 12000);
  },[stopHeartbeat]);

  useEffect(()=>{
    setEmpty(false);
    fetch(`/api/questions?id=${id}`).then(r=>r.json()).then(d=>{
      if(!d.category) return;
      setCat(d.category);
      if(mode==="listen"){
        const q = buildQueue(d.category, type, idx);
        if(q.length===0 && type!=="bookmarked" && type!=="missed"){ setEmpty(true); return; }
        if(q.length>0){
          if(type==="bookmarked"||type==="missed"){
            // wait for progress to populate listenQueue
            return;
          }
          setListenQueue(q);
          setListenIdx(0);
          setListenPhase("idle");
          setListenFinished(false);
          setIsPlaying(false);
        }
        return;
      }
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
    if(!cat || !progress) return;
    if(mode==="listen"){
      if(listenQueue) return;
      if(type==="bookmarked"){
        const keys=new Set(progress.bookmarks?.[cat.id]||[]);
        const out=[];
        cat.subcats.forEach((sc,sIdx)=> sc.questions.forEach(q=>{ if(keys.has(sIdx+"-"+q.num)) out.push({subIdx:sIdx, subName:sc.name, q}); }));
        if(out.length>0){ setListenQueue(out); setListenIdx(0); }
        else setEmpty(true);
      }
      if(type==="missed"){
        const miss=progress.missCounts?.[cat.id]||{};
        const keys=Object.keys(miss).filter(k=>miss[k]>0);
        const out=[];
        cat.subcats.forEach((sc,sIdx)=> sc.questions.forEach(q=>{ if(keys.includes(sIdx+"-"+q.num)) out.push({subIdx:sIdx, subName:sc.name, q}); }));
        if(out.length>0){ setListenQueue(shuffle(out)); setListenIdx(0); }
        else setEmpty(true);
      }
      return;
    }
    if(quiz) return;
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
    const activeItem = mode==="listen" ? (listenQueue?.[listenIdx]||null) : current;
    if(!activeItem) return;
    const key=activeItem.subIdx+"-"+activeItem.q.num;
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
        subIdx: activeItem.subIdx,
        num: activeItem.q.num,
      })});
    }catch{}
  };
  const isBookmarked = (()=> {
    const activeItem = mode==="listen" ? (listenQueue?.[listenIdx]||null) : current;
    if(!activeItem || !progress) return false;
    return !!progress.bookmarks?.[id]?.includes(activeItem.subIdx+"-"+activeItem.q.num);
  })();

  const restart=()=>{
    if(!cat) return;
    if(mode==="listen"){
      const q = buildQueue(cat, type, idx);
      const out = (()=> {
        if(type==="bookmarked"){
          const keys=new Set(progress?.bookmarks?.[cat.id]||[]);
          const arr=[]; cat.subcats.forEach((sc,sIdx)=> sc.questions.forEach(qq=>{ if(keys.has(sIdx+"-"+qq.num)) arr.push({subIdx:sIdx, subName:sc.name, q:qq}); }));
          return arr;
        }
        if(type==="missed"){
          const miss=progress?.missCounts?.[cat.id]||{};
          const keys=Object.keys(miss).filter(k=>miss[k]>0);
          const arr=[]; cat.subcats.forEach((sc,sIdx)=> sc.questions.forEach(qq=>{ if(keys.includes(sIdx+"-"+qq.num)) arr.push({subIdx:sIdx, subName:sc.name, q:qq}); }));
          return shuffle(arr);
        }
        return q;
      })();
      if(out.length>0){ cancelSpeech(); resumeSegRef.current=0; setListenQueue(out); setListenIdx(0); setListenPhase("idle"); setListenFinished(false); setIsPlaying(false); }
      return;
    }
    const q = buildQueue(cat, type, idx);
    if(q.length>0){ initQuiz(q, cat); return; }
    if(type==="bookmarked" || type==="missed") setQuiz(null);
  };

  const retryWrong=()=>{
    if(!cat || !quiz || quiz.mode!=="practice") return;
    const wrongItems = Object.values(quiz.wrongAnswers||{}).map(w=>w.item);
    if(wrongItems.length===0) return;
    initQuiz(wrongItems, cat);
  };

  // ---- Listen helpers ----
  const cancelSpeech=useCallback(()=>{
    cancelledRef.current=true; // tell the pending onerror this stop was intentional, not a real failure
    stopHeartbeat();
    if(typeof window!=="undefined" && window.speechSynthesis){
      window.speechSynthesis.cancel();
    }
    utteranceRef.current=null;
    if(timeoutRef.current){ clearTimeout(timeoutRef.current); timeoutRef.current=null; }
  },[stopHeartbeat]);

  useEffect(()=>{
    return ()=>{ cancelSpeech(); };
  },[cancelSpeech]);

  const getListenSegments=(item, idx, total)=>{
    return [
      { key:"question", label:"Question", text: `Question ${idx+1}. ${item.q.text}`, gap: 600 },
      { key:"options", label:"Options", text: `Options. A: ${item.q.options[0]}. B: ${item.q.options[1]}. C: ${item.q.options[2]}. D: ${item.q.options[3]}.`, gap: 900 },
      { key:"answer", label:"Answer", text: `Answer. Option ${String.fromCharCode(65+item.q.correct)}. ${item.q.options[item.q.correct]}.`, gap: 700 },
      { key:"expl", label:"Explanation", text: `Explanation. ${item.q.expl}`, gap: 500 },
    ];
  };

  const speakSegmentsSequentially=useCallback((item, qIdx, total, segIdx=0)=>{
    if(!isPlayingRef.current) return;
    const segs=getListenSegments(item, qIdx, total);
    if(segIdx >= segs.length){
      resumeSegRef.current=0; // next question starts fresh at the "question" phase
      timeoutRef.current=setTimeout(()=>{
        if(!isPlayingRef.current) return;
        if(qIdx+1 >= total){
          setListenFinished(true);
          setIsPlaying(false);
          setListenPhase("idle");
          cancelSpeech();
        } else {
          setListenIdx(qIdx+1);
        }
      }, 1800);
      return;
    }
    const seg=segs[segIdx];
    resumeSegRef.current=segIdx;
    setListenPhase(seg.key);
    if(typeof window==="undefined" || !window.speechSynthesis) return;
    cancelledRef.current=false; // this is a real, intentional speak attempt from here on
    const utter=new SpeechSynthesisUtterance(seg.text);
    utteranceRef.current=utter;
    utter.rate=rateRef.current;
    if(voiceRef.current){
      const base=voiceRef.current._baseVoice || voiceRef.current;
      utter.voice=base;
      utter.lang=base.lang || "en-US";
      utter.pitch=voiceRef.current._pitch ?? (voiceRef.current._gender==="male"?0.92:1.06);
    } else {
      utter.lang="en-US";
      utter.pitch=1;
    }
    utter.volume=1;
    utter.onend=()=>{
      stopHeartbeat();
      if(!isPlayingRef.current) return;
      timeoutRef.current=setTimeout(()=> speakSegmentsSequentially(item, qIdx, total, segIdx+1), seg.gap);
    };
    utter.onerror=(e)=>{
      stopHeartbeat();
      // A pause/skip/replay/rate-change calls cancel(), which itself fires onerror with
      // "canceled"/"interrupted". That's expected, not a failure — ignore it so we don't
      // speak a duplicate "ghost" utterance right after the user stopped playback.
      if(cancelledRef.current) return;
      // Real failures worth retrying: Android tablet Google *network* voices commonly
      // throw these when the connection is flaky or the voice isn't actually installed.
      const retryable=["network","synthesis-failed","synthesis-unavailable","voice-unavailable","audio-busy"];
      if(retryable.includes(e?.error) && voiceRef.current){
        try{ window.speechSynthesis.cancel(); }catch{}
        const fallback=new SpeechSynthesisUtterance(seg.text);
        fallback.rate=rateRef.current;
        fallback.lang="en-US";
        fallback.pitch=1;
        fallback.onend=()=>{
          stopHeartbeat();
          if(!isPlayingRef.current) return;
          timeoutRef.current=setTimeout(()=> speakSegmentsSequentially(item, qIdx, total, segIdx+1), seg.gap);
        };
        utteranceRef.current=fallback;
        startHeartbeat();
        window.speechSynthesis.speak(fallback);
      }
    };
    startHeartbeat();
    window.speechSynthesis.speak(utter);
  },[cancelSpeech, startHeartbeat, stopHeartbeat]);

  // Chrome (desktop and Android) can silently drop a speak() call made immediately
  // after cancel() — the cancel hasn't finished tearing down internally yet. A short
  // delay before the next speak() avoids that race. Keep this consistent everywhere
  // we cancel-then-speak instead of using ad-hoc, inconsistent delays.
  const SPEAK_KICKOFF_DELAY=120;

  // auto-play when idx or playing changes
  useEffect(()=>{
    if(mode!=="listen") return;
    if(!listenQueue || listenQueue.length===0) return;
    if(listenFinished) return;
    if(!isPlaying) return; // paused — nothing to (re)start
    const item=listenQueue[listenIdx];
    if(!item) return;
    cancelSpeech();
    const t=setTimeout(()=> speakSegmentsSequentially(item, listenIdx, listenQueue.length, resumeSegRef.current), SPEAK_KICKOFF_DELAY);
    return ()=> clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[listenIdx, isPlaying, listenQueue, listenFinished, mode]);

  // Play/Pause. We deliberately avoid speechSynthesis.pause()/resume(): on Android
  // Chrome (and some desktop Chrome builds) a paused utterance can fail to resume —
  // especially if paused for more than ~15s — leaving playback silently stuck.
  // Instead we fully cancel on pause and remember which segment (question/options/
  // answer/explanation) we were on via resumeSegRef, then replay that segment on Play.
  const togglePlay=()=>{
    if(!listenQueue || listenQueue.length===0) return;
    if(typeof window==="undefined" || !("speechSynthesis" in window)){
      setSpeechSupported(false); return;
    }
    if(listenFinished){
      resumeSegRef.current=0;
      setListenIdx(0); setListenFinished(false); setListenPhase("idle");
      setIsPlaying(true);
      return;
    }
    if(isPlaying){
      cancelSpeech();
      setIsPlaying(false);
    } else {
      setIsPlaying(true); // effect above resumes from resumeSegRef.current
    }
  };

  const replayCurrent=()=>{
    if(!listenQueue) return;
    cancelSpeech();
    resumeSegRef.current=0;
    setListenPhase("idle");
    if(listenFinished){ setListenFinished(false); setListenIdx(0); }
    setIsPlaying(true);
    // effect will trigger speak; if already playing, force restart
    if(isPlaying){
      const item=listenQueue[listenFinished?0:listenIdx];
      setTimeout(()=> speakSegmentsSequentially(item, listenFinished?0:listenIdx, listenQueue.length, 0), SPEAK_KICKOFF_DELAY);
    }
  };

  const goNext=()=>{
    if(!listenQueue) return;
    cancelSpeech();
    resumeSegRef.current=0;
    if(listenIdx+1 >= listenQueue.length){
      setListenFinished(true); setIsPlaying(false); setListenPhase("idle"); return;
    }
    setListenIdx(i=>i+1);
    setListenPhase("idle");
    // keep playing if it was playing
  };
  const goPrev=()=>{
    if(!listenQueue) return;
    cancelSpeech();
    resumeSegRef.current=0;
    if(listenIdx===0){
      // replay first
      setListenPhase("idle");
      if(isPlaying){
        setTimeout(()=> speakSegmentsSequentially(listenQueue[0],0,listenQueue.length,0), SPEAK_KICKOFF_DELAY);
      }
      return;
    }
    setListenIdx(i=>i-1);
    setListenPhase("idle");
  };

  const handleRate=(r)=>{
    setRate(r);
    rateRef.current=r;
    if(isPlaying && typeof window!=="undefined" && window.speechSynthesis){
      cancelSpeech();
      const item=listenQueue?.[listenIdx];
      // resume from the same phase instead of jumping back to "question" — changing
      // speed mid-explanation shouldn't throw away where you were.
      if(item) setTimeout(()=> speakSegmentsSequentially(item, listenIdx, listenQueue.length, resumeSegRef.current), SPEAK_KICKOFF_DELAY);
    }
  };

  const handleSeek=(targetIdx)=>{
    if(!listenQueue) return;
    cancelSpeech();
    resumeSegRef.current=0;
    setListenIdx(targetIdx);
    setListenFinished(false);
    setListenPhase("idle");
    // keep isPlaying as is — effect will auto-play if isPlaying true
  };

  // ---- Render: Listen mode branch ----
  if(mode==="listen"){
    if(empty) return (
      <div className="dwg-card">
        <span className="dwg-tag mono">NOTHING TO LISTEN</span>
        <p style={{marginTop:10}}>There&apos;s nothing queued up here yet.</p>
        <div className="btn-row">
          <Link href={`/subject/${id}`} className="btn secondary" style={{textDecoration:"none",display:"inline-block"}}>Back to Subject</Link>
        </div>
      </div>
    );
    if(!cat || !listenQueue) return (
      <div className="loading-row"><span className="spinner"></span> Loading Listen & Learn…</div>
    );
    if(listenFinished){
      return (
        <div className="dwg-card">
          <span className="dwg-tag mono">LISTEN & LEARN — COMPLETE</span>
          <h2 className="serif" style={{margin:"10px 0 6px"}}>You&apos;ve listened to all {listenQueue.length} questions</h2>
          <p className="mono" style={{fontSize:13, color:"var(--muted)"}}>Great passive revision — switch to Test or Practice when you&apos;re ready to answer actively.</p>
          <div className="btn-row" style={{marginTop:18}}>
            <button className="btn" onClick={replayCurrent}>↺ Replay All</button>
            <Link href={`/quiz/${id}?mode=test&type=${type}${idx?`&idx=${idx}`:""}`} className="btn secondary" style={{textDecoration:"none",display:"inline-block"}}>Switch to Test</Link>
            <Link href={`/quiz/${id}?mode=practice&type=${type}${idx?`&idx=${idx}`:""}`} className="btn secondary" style={{textDecoration:"none",display:"inline-block"}}>Practice Mode</Link>
            <Link href={`/subject/${id}`} className="btn secondary" style={{textDecoration:"none",display:"inline-block"}}>Back to Subject</Link>
          </div>
          <div className="review-list" style={{marginTop:22}}>
            <span className="dwg-tag mono">TRANSCRIPT ({listenQueue.length})</span>
            {listenQueue.map((it,i)=> (
              <div key={i} className="review-item" style={{borderLeftColor:"var(--accent)"}}>
                <div className="rq serif">{i+1}. {it.q.text}</div>
                <div className="ra mono" style={{color:"var(--muted)"}}>A) {it.q.options[0]} · B) {it.q.options[1]} · C) {it.q.options[2]} · D) {it.q.options[3]}</div>
                <div className="ra right-ans mono">Answer: {String.fromCharCode(65+it.q.correct)}) {it.q.options[it.q.correct]}</div>
                <div className="mono" style={{fontSize:12,marginTop:6}}>{it.q.expl}</div>
              </div>
            ))}
          </div>
        </div>
      );
    }
    const item=listenQueue[listenIdx];
    const q=item.q;
    const total=listenQueue.length;
    const pct=Math.round(((listenIdx)/total)*100);
    const isBookmarkedListen=isBookmarked;
    return (
      <>
        <div className="top-bar"><Link href={`/subject/${id}`} className="back-link">← Back</Link><span className="score-badge mono">🎧 Listen & Learn · {listenIdx+1} / {total}</span></div>
        <div className="eyebrow"><span>{item.subName} · Question {listenIdx+1} of {total}</span><span>#{q.num} · LISTEN</span></div>
        <div className="quiz-progress-bar" style={{cursor:"pointer"}} onClick={(e)=>{
          const rect=e.currentTarget.getBoundingClientRect();
          const x=e.clientX-rect.left;
          const p=x/rect.width;
          const target=Math.min(total-1, Math.max(0, Math.floor(p*total)));
          handleSeek(target);
        }}>
          <div className="quiz-progress-fill" style={{width:((listenIdx+ (listenPhase==="expl"?0.95: listenPhase==="answer"?0.7: listenPhase==="options"?0.4: listenPhase==="question"?0.15:0))/total*100)+"%", transition:"width .6s var(--ease)"}}></div>
        </div>

        {!speechSupported && (
          <div className="message-banner err" style={{marginBottom:14}}>Speech not supported in this browser. Try Chrome, Edge or Safari on Android/iOS.</div>
        )}

        {/* Player bar */}
        <div className="listen-player dwg-card" style={{padding:18, display:"flex", flexDirection:"column", gap:14}}>
          <div style={{display:"flex", alignItems:"center", justifyContent:"space-between", gap:12, flexWrap:"wrap"}}>
            <div style={{display:"flex", alignItems:"center", gap:10}}>
              <button className="btn" onClick={togglePlay} style={{minWidth:120, display:"inline-flex", alignItems:"center", justifyContent:"center", gap:8}}>
                {isPlaying ? "⏸︎ Pause" : "▶︎ Play"}
              </button>
              <button className="btn secondary" onClick={replayCurrent} title="Replay this question">↺ Replay</button>
              <button className="btn secondary" onClick={goPrev} title="Previous">⏮︎</button>
              <button className="btn secondary" onClick={goNext} title="Next">⏭︎</button>
            </div>
            <div style={{display:"flex", alignItems:"center", gap:8, flexWrap:"wrap"}}>
              <span className="mono" style={{fontSize:11, color:"var(--muted)", letterSpacing:".06em", textTransform:"uppercase"}}>Speed</span>
              {[1,1.25,1.5,2].map(r=>(
                <button key={r} className={`btn small ${rate===r?"":"secondary"}`} onClick={()=>handleRate(r)} style={{minHeight:36, padding:"6px 10px"}}>{r}×</button>
              ))}
            </div>
          </div>

          {/* Voice picker */}
          {voices.length>0 && (
            <div style={{display:"flex", alignItems:"center", gap:10, flexWrap:"wrap"}}>
              <span className="mono" style={{fontSize:11, color:"var(--muted)", letterSpacing:".06em", textTransform:"uppercase"}}>Voice</span>
              <select className="mf-select" value={selectedVoiceURI} onChange={e=>setSelectedVoiceURI(e.target.value)} style={{maxWidth:320, minWidth:180, width:"auto"}}>
                {voices.map(v=>{
                  const tag=v._gender==="female"?" ♀ Female": v._gender==="male"?" ♂ Male":" ○ Voice";
                  const short=v.lang==="en-IN"?"IN": v.lang==="en-US"?"US": v.lang==="en-GB"?"GB": v.lang;
                  const local=v.localService?" · offline":"";
                  const synth=v._synthetic?" · pitch-shifted":"";
                  return <option key={v._id} value={v._id}>{v.name} · {short}{tag}{local}{synth}</option>;
                })}
              </select>
              <span className="mono" style={{fontSize:11, color:"var(--dim)"}}>{isPlaying ? `Speaking: ${listenPhase}` : "Paused"}</span>
            </div>
          )}

          {/* Phase dots */}
          <div style={{display:"flex", gap:8, alignItems:"center"}}>
            {["question","options","answer","expl"].map(ph=>{
              const active=listenPhase===ph;
              const done=["question","options","answer","expl"].indexOf(listenPhase) > ["question","options","answer","expl"].indexOf(ph);
              return (
                <span key={ph} className="listen-phase-dot" style={{
                  padding:"4px 10px", borderRadius:999, fontSize:11, fontFamily:"IBM Plex Mono, monospace",
                  letterSpacing:".04em", textTransform:"uppercase",
                  background: active? "var(--accent)" : done? "var(--accent-soft)" : "var(--option-dim)",
                  color: active? "var(--bg-deep)" : done? "var(--accent)" : "var(--muted)",
                  border: active? "1px solid var(--accent-deep)" : "1px solid var(--card-border)",
                  transition:"all .2s var(--ease-soft)"
                }}>{ph==="expl"?"Explanation":ph}</span>
              );
            })}
          </div>
        </div>

        {/* Question transcript - highlights as it speaks */}
        <div className="dwg-card" style={{padding:22}}>
          <div className="q-head-row" style={{alignItems:"flex-start"}}>
            <p className="question-text" style={{
              opacity: listenPhase==="question"?1:0.55,
              transition:"opacity .3s ease",
              borderLeft: listenPhase==="question"?"3px solid var(--accent)":"3px solid transparent",
              paddingLeft: listenPhase==="question"?"12px":0
            }}>
              {isPlaying && listenPhase==="question" ? "🔊 " : ""}{q.text}
            </p>
            <button className={`bookmark-btn ${isBookmarkedListen?"active":""}`} onClick={toggleBookmark} title="Bookmark">★</button>
          </div>

          <div className={`options ${listenPhase==="answer"||listenPhase==="expl"?"answered":""}`} style={{opacity: listenPhase==="options"?1: listenPhase==="question"?0.85:1, transition:"opacity .3s ease"}}>
            {q.options.map((opt,i)=>{
              const isCorrect=i===q.correct;
              const reveal = listenPhase==="answer" || listenPhase==="expl";
              let cls="option-row";
              if(reveal){
                if(isCorrect) cls+=" correct";
                else cls+=" dim";
              }
              return (
                <div key={i} className={cls} style={{
                  borderColor: listenPhase==="options" ? "var(--card-border-strong)" : undefined,
                  background: reveal && isCorrect ? "var(--correct-soft)" : undefined
                }}>
                  {reveal && isCorrect && <span className="stamp stamp-ok">✓ Answer</span>}
                  <span className="option-letter">{String.fromCharCode(65+i)}</span>
                  <span>{opt}</span>
                </div>
              );
            })}
          </div>

          {(listenPhase==="answer" || listenPhase==="expl") && (
            <div className="explain-box" style={{animation:"explainIn .3s var(--ease)"}}>
              <span className="label mono">Answer: {String.fromCharCode(65+q.correct)} — {q.options[q.correct]}</span>
              <span style={{opacity: listenPhase==="expl"?1:0.55, transition:"opacity .3s ease"}}>{q.expl}</span>
            </div>
          )}

          <div className="mono" style={{fontSize:11, color:"var(--muted)", marginTop:8}}>
            Auto-advances in ~2s after explanation. Use Pause/Replay anytime — great for walking or resting.
          </div>

          <div className="btn-row" style={{marginTop:14, justifyContent:"space-between"}}>
            <button className="btn secondary" onClick={goPrev} disabled={listenIdx===0}>← Previous</button>
            <button className="btn" onClick={goNext}>{listenIdx+1===total?"Finish →":"Next →"}</button>
          </div>
        </div>

        {/* Mini transcript scrubber */}
        <div className="mono" style={{fontSize:11, color:"var(--dim)", textAlign:"center", marginTop:6}}>
          Tap the progress bar above to jump · {pct}% through this batch
        </div>

        <Toast message={toastMsg} show={toastShow} />
      </>
    );
  }

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
