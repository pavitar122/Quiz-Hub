"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import Link from "next/link";

export default function SignupPage(){
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [err,setErr]=useState("");
  const [loading,setLoading]=useState(false);
  const router=useRouter();
  const { setUser }=useAuth();
  const submit=async(e)=>{
    e.preventDefault();
    setErr(""); setLoading(true);
    const res=await fetch("/api/auth/signup",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({name,email,password})});
    const data=await res.json();
    setLoading(false);
    if(!res.ok){ setErr(data.error||"Signup failed"); return; }
    setUser(data.user);
    router.push("/");
  };
  return (
    <div className="dwg-card auth-card">
      <span className="dwg-tag mono">SIGN UP</span>
      <h2 className="serif">Create account</h2>
      {err && <div className="explain-box" style={{borderLeftColor:"var(--wrong)"}}>{err}</div>}
      <form onSubmit={submit}>
        <input className="auth-input" placeholder="Name" value={name} onChange={e=>setName(e.target.value)} required />
        <input className="auth-input" placeholder="Email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required />
        <input className="auth-input" placeholder="Password (min 6 chars)" type="password" value={password} onChange={e=>setPassword(e.target.value)} required />
        <button className="btn" disabled={loading} type="submit">{loading?"...":"Create Account"}</button>
      </form>
      <p className="mono" style={{fontSize:13,marginTop:14}}>Have account? <Link href="/auth/login">Login</Link></p>
    </div>
  );
}
