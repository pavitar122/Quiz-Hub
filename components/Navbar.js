"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";

export default function Navbar(){
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isDark,setIsDark]=useState(false);
  const [scrolled,setScrolled]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  useEffect(()=>{
    const saved=localStorage.getItem("theme");
    const dark = saved ? saved==="dark" : false;
    setIsDark(dark);
    document.body.classList.toggle("dark",dark);
  },[]);
  useEffect(()=>{
    const onScroll=()=>setScrolled(window.scrollY>8);
    onScroll();
    window.addEventListener("scroll",onScroll,{passive:true});
    return ()=>window.removeEventListener("scroll",onScroll);
  },[]);
  const toggle=()=>{
    const nd=!isDark;
    setIsDark(nd);
    document.body.classList.toggle("dark",nd);
    localStorage.setItem("theme", nd?"dark":"light");
  };
  const initials = user?.email ? user.email.slice(0,2).toUpperCase() : "QH";
  return (
    <nav className={`navbar ${scrolled?"scrolled":""}`} aria-label="Main navigation">
      <div className="nav-inner">
        <Link href="/" aria-label="Quiz Hub home" className="nav-logo">
          <span className="nav-logo-mark">QH</span>
          <span className="nav-logo-text">Quiz Hub</span>
        </Link>

        {/* Desktop actions — hidden on tablet */}
        <div className="nav-actions nav-actions--desktop">
          {user?.role==="admin" && <Link href="/admin" className={`nav-link ${pathname==="/admin"?"current":""}`}>Admin</Link>}
          <button className="icon-btn nav-theme-btn" onClick={toggle} title="Toggle theme"><span className="swatch" style={{background:isDark ? "var(--background)" : "var(--foreground)"}}></span>{isDark?"Dark":"Light"}</button>
          <div className="nav-civil-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 14.66v1.626a2 2 0 0 1-.976 1.696A5 5 0 0 0 7 21.978"/><path d="M14 14.66v1.626a2 2 0 0 0 .976 1.696A5 5 0 0 1 17 21.978"/><path d="M18 9h1.5a1 1 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 0 0 0-1 1z"/><path d="M6 9H4.5a1 1 0 0 1 0-5H6"/></svg>
            <span>Civil Hub</span>
          </div>
          <div className="nav-avatar" aria-label="Profile">{initials}</div>
          {user ? (
            <>
              <span className="nav-user">{user.email}</span>
              <button className="btn small secondary" onClick={logout} style={{borderRadius:999}}>Logout</button>
            </>
          ) : (
            <>
              <Link href="/auth/login" className="btn small" style={{borderRadius:999,textDecoration:"none"}}>Login</Link>
              <Link href="/auth/signup" className="btn small secondary" style={{borderRadius:999,textDecoration:"none"}}>Signup</Link>
            </>
          )}
        </div>

        {/* Tablet hamburger */}
        <button className="nav-hamburger" aria-label="Open menu" aria-expanded={menuOpen} onClick={()=>setMenuOpen(v=>!v)}>
          <span className={`hamburger-line ${menuOpen?"open":""}`}></span>
          <span className={`hamburger-line ${menuOpen?"open":""}`}></span>
          <span className={`hamburger-line ${menuOpen?"open":""}`}></span>
        </button>
      </div>

      {menuOpen && (
        <div className="nav-drawer" role="dialog" aria-label="Navigation menu">
          <div className="nav-drawer-inner">
            <div className="nav-drawer-profile">
              <div className="nav-avatar" style={{width:36,height:36}}>{initials}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontFamily:"Outfit,sans-serif",fontWeight:600,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{user ? user.email : "Guest"}</div>
                <div style={{fontFamily:"Figtree,sans-serif",fontSize:11,color:"var(--muted-foreground)"}}>{user?.role==="admin" ? "Administrator" : "Civil Engineering"}</div>
              </div>
              <button className="icon-btn" onClick={toggle} style={{borderRadius:999,padding:"6px 10px"}}><span className="swatch" style={{background:isDark ? "var(--background)" : "var(--foreground)"}}></span>{isDark?"Dark":"Light"}</button>
            </div>
            {user?.role==="admin" && <Link href="/admin" onClick={()=>setMenuOpen(false)} className="nav-drawer-link">Admin Panel →</Link>}
            <div className="nav-drawer-divider" />
            {user ? (
              <button className="btn small secondary" onClick={()=>{setMenuOpen(false); logout();}} style={{width:"100%",justifyContent:"center",borderRadius:999}}>Logout</button>
            ) : (
              <div style={{display:"flex",gap:10}}>
                <Link href="/auth/login" onClick={()=>setMenuOpen(false)} className="btn small" style={{flex:1,textAlign:"center",borderRadius:999,textDecoration:"none",justifyContent:"center"}}>Login</Link>
                <Link href="/auth/signup" onClick={()=>setMenuOpen(false)} className="btn small secondary" style={{flex:1,textAlign:"center",borderRadius:999,textDecoration:"none",justifyContent:"center"}}>Signup</Link>
              </div>
            )}
            <button className="nav-drawer-close" onClick={()=>setMenuOpen(false)}>Close</button>
          </div>
        </div>
      )}
    </nav>
  );
}
