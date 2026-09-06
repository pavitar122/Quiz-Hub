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
  useEffect(()=>{
    // The theme class is already applied to <html> synchronously by the
    // inline script in layout.js (before first paint) to avoid a flash —
    // this just syncs React state to match what's already on screen.
    setIsDark(document.documentElement.classList.contains("dark"));
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
    document.documentElement.classList.toggle("dark",nd);
    localStorage.setItem("theme", nd?"dark":"light");
  };
  return (
    <div className={`navbar ${scrolled?"scrolled":""}`}>
      <div className="nav-links">
        <Link href="/" className="serif" style={{fontWeight:800, textDecoration:"none", color:"var(--ink-deep)", fontSize:18, letterSpacing:".01em", transition:"transform .2s var(--ease-soft)", display:"inline-flex", alignItems:"center", gap:8}} onMouseEnter={e=>e.currentTarget.style.transform="translateY(-1px)"} onMouseLeave={e=>e.currentTarget.style.transform="translateY(0)"}><img src="/icons/icon-96.png" alt="Quiz Hub logo" width={28} height={28} style={{borderRadius:7, display:"block"}} />QUIZ HUB</Link>
        <Link href="/" className={`nav-link mono ${pathname==="/"?"current":""}`}>Home</Link>
        {user?.role==="admin" && <Link href="/admin" className={`nav-link mono ${pathname==="/admin"?"current":""}`}>Admin</Link>}
      </div>
      <div className="nav-links">
        <button className="icon-btn" onClick={toggle} title="Toggle theme"><span className="swatch"></span>{isDark?"Diazo":"Cyanotype"}</button>
        {user ? (
          <>
            <span className="nav-user mono">{user.email}</span>
            <button className="btn small secondary" onClick={logout}>Logout</button>
          </>
        ) : (
          <>
            <Link href="/auth/login" className="btn small">Login</Link>
            <Link href="/auth/signup" className="btn small secondary">Signup</Link>
          </>
        )}
      </div>
    </div>
  );
}
