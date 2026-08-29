"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { useState, useEffect } from "react";

export default function Navbar(){
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const [isDark,setIsDark]=useState(false);
  useEffect(()=>{
    const saved=localStorage.getItem("theme");
    const dark = saved ? saved==="dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setIsDark(dark);
    document.body.classList.toggle("dark",dark);
  },[]);
  const toggle=()=>{
    const nd=!isDark;
    setIsDark(nd);
    document.body.classList.toggle("dark",nd);
    localStorage.setItem("theme", nd?"dark":"light");
  };
  return (
    <div className="navbar">
      <div className="nav-links">
        <Link href="/" className="serif" style={{fontWeight:800, textDecoration:"none", color:"var(--ink-deep)", fontSize:18, letterSpacing:".01em"}}>QUIZ HUB</Link>
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
