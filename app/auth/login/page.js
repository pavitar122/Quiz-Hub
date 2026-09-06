"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function LoginPage(){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const router=useRouter();
  const { setUser }=useAuth();
  const submit=async(e)=>{
    e.preventDefault();
    setErr(""); setLoading(true);
    try {
      const res=await fetch("/api/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({email,password})});
      const data=await res.json().catch(()=>({}));
      setLoading(false);
      if(!res.ok){ setErr(data.error||"Login failed. Please check your credentials."); return; }
      setUser(data.user);
      router.push("/");
    } catch {
      setLoading(false);
      setErr("Network error. Please check your connection and try again.");
    }
  };
  return (
    <div className="dwg-card auth-card">
      <span className="dwg-tag mono">LOGIN</span>
      <h2 className="serif">Welcome back</h2>
      {err && <div className="explain-box" style={{borderLeftColor:"var(--wrong)",animation:"fadeIn .2s var(--ease), shake .4s var(--ease-soft)"}}>{err}</div>}
      <form onSubmit={submit}>
        <input className="auth-input" placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required style={{animation:"fadeInUp .3s var(--ease) both"}} />
        <input className="auth-input" placeholder="Password" type="password" value={password} onChange={e=>setPassword(e.target.value)} required style={{animation:"fadeInUp .3s var(--ease) .04s both"}} />
        <button className="btn" disabled={loading} type="submit">{loading?<span className="spinner"></span>:"Login"}</button>
      </form>
      <p className="mono" style={{fontSize:13,marginTop:14}}>No account? <Link href="/auth/signup">Signup</Link></p>
    </div>
  );
}
