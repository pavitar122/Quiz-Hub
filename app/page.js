"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export default function HomePage(){
  const [cats,setCats]=useState([]);
  const [groups,setGroups]=useState([]);
  const [activeApp,setActiveApp]=useState("civil1");
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("all");
  const [progress,setProgress]=useState(null);
  const { user } = useAuth();

  useEffect(()=>{
    fetch("/api/questions").then(r=>r.json()).then(d=>{
      setCats(d.categories||[]);
      setGroups(d.groups||[]);
    });
  },[]);
  useEffect(()=>{
    if(user) fetch("/api/progress").then(r=>r.json()).then(d=>setProgress(d.progress)).catch(()=>{});
    else setProgress(null);
  },[user]);

  const groupCats = cats.filter(c=>c.group===activeApp);
  const q=search.trim().toLowerCase();
  const filtered = groupCats.filter(cat=>{
    if(q && !(cat.title.toLowerCase().includes(q) || cat.description.toLowerCase().includes(q))) return false;
    if(filter!=="all"){
      const st=categoryStatus(cat,progress);
      if(st!==filter) return false;
    }
    return true;
  });

  const counts={all:groupCats.length,new:0,progress:0,done:0};
  groupCats.forEach(cat=>counts[categoryStatus(cat,progress)]++);

  const activeMeta=groups.find(g=>g.id===activeApp) || groups[0];
  const totalQGroup=groupCats.reduce((a,c)=>a+(c.subcats?.reduce((s,sc)=>s+sc.questions.length,0)||0),0);
  const acc = overallAccuracy(progress);
  const weak = weakest(progress,cats.filter(c=>c.group===activeApp));

  return (
    <>
      <div className="app-header">
        <span className="dwg-tag mono">DWG-INDEX · CIVIL ENGINEERING QUIZ HUB</span>
        <h1 className="serif">Civil Engineering Objective Practice</h1>
        <p>Switch between question-bank apps below. {user ? "Progress saved to cloud." : "Login to save progress to cloud — or practice as guest."}</p>
      </div>
      <div className="app-switcher">
        {groups.map(g=>{
          const gCats=cats.filter(c=>c.group===g.id);
          const gTotal=gCats.reduce((a,c)=>a+c.subcats.reduce((s,sc)=>s+sc.questions.length,0),0);
          return (
            <button key={g.id} className={`app-tab ${activeApp===g.id?"active":""}`} onClick={()=>{setActiveApp(g.id);}}>
              <span className="app-tab-icon">{g.icon}</span>
              <span className="app-tab-text">
                <span className="app-tab-label">{g.label}</span>
                <span className="app-tab-meta">{gCats.length} subjects · {gTotal} Qs</span>
              </span>
            </button>
          );
        })}
      </div>

      {activeMeta && (
        <div className="app-header" style={{margin:"22px 0 20px"}}>
          <span className="dwg-tag mono">{activeMeta.icon} · {activeMeta.label.toUpperCase()}</span>
          <p style={{marginTop:2}}>{activeMeta.blurb}</p>
        </div>
      )}

      <div className="stat-strip">
        <div className="stat-chip"><div className="num serif">{totalQGroup}</div><div className="lab mono">Questions In This App</div></div>
        <div className="stat-chip"><div className="num serif">{acc===null?"—":acc+"%"}</div><div className="lab mono">Overall Accuracy</div></div>
        <div className="stat-chip"><div className="num serif">{progress?.stats?.bestStreak||0}</div><div className="lab mono">Best Streak</div></div>
        <div className="stat-chip"><div className="num serif">{progress?.stats?.sessionsCompleted||0}</div><div className="lab mono">Sessions Done</div></div>
      </div>

      {weak && <div className="empty-note" style={{textAlign:"left",marginBottom:18}}>🎯 <strong>Suggested focus:</strong> "{weak.name}" ({weak.catTitle}) — best {weak.pct}%.</div>}

      <div className="searchbar">
        <span className="icon mono">SEARCH</span>
        <input type="text" placeholder="Filter subjects..." value={search} onChange={e=>setSearch(e.target.value)} />
      </div>
      <div className="filter-chips mono">
        <button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>All ({counts.all})</button>
        <button className={filter==="new"?"active":""} onClick={()=>setFilter("new")}>Not Started ({counts.new})</button>
        <button className={filter==="progress"?"active":""} onClick={()=>setFilter("progress")}>In Progress ({counts.progress})</button>
        <button className={filter==="done"?"active":""} onClick={()=>setFilter("done")}>Attempted All ({counts.done})</button>
      </div>

      <div className="category-grid">
        {filtered.length===0 ? <div className="empty-note">No subjects match your filters.</div> :
          filtered.map(cat=>{
            const total=cat.subcats.reduce((a,s)=>a+s.questions.length,0);
            const best=(progress?.bestScores?.[cat.id]||{})["FULL"];
            const attempted=cat.subcats.filter((_,i)=>progress?.bestScores?.[cat.id]?.[String(i)]).length;
            const pct=Math.round((attempted/cat.subcats.length)*100);
            return (
              <Link key={cat.id} href={`/subject/${cat.id}`} style={{textDecoration:"none"}}>
                <div className="category-card">
                  <h2 className="serif">{cat.title}</h2>
                  <p>{cat.description}</p>
                  <div className="cat-progress-row"><span>{cat.subcats.length} topics · {total} Qs</span><span>{best ? `Best: ${best.pct}%` : "Not started"}</span></div>
                  <div className="cat-progress-bar"><div className="cat-progress-fill" style={{width:pct+"%"}}></div></div>
                </div>
              </Link>
            );
          })}
      </div>
    </>
  );
}

function categoryStatus(cat, progress){
  if(!progress) return "new";
  const scores=progress.bestScores?.[cat.id]||{};
  const attempted=cat.subcats.filter((_,i)=>scores[String(i)]).length;
  if(attempted===0) return "new";
  if(attempted>=cat.subcats.length) return "done";
  return "progress";
}
function overallAccuracy(p){
  if(!p || !p.stats || p.stats.totalAnswered===0) return null;
  return Math.round((p.stats.totalCorrect/p.stats.totalAnswered)*100);
}
function weakest(progress,cats){
  if(!progress) return null;
  let worst=null;
  cats.forEach(cat=>{
    const scores=progress.bestScores?.[cat.id]||{};
    cat.subcats.forEach((sc,i)=>{
      const s=scores[String(i)];
      if(s && (!worst || s.pct<worst.pct)) worst={name:sc.name,pct:s.pct,catTitle:cat.title};
    });
  });
  return worst;
}
