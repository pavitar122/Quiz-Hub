"use client";
import { useEffect } from "react";

// Adds a lightweight press-ripple to every .btn in the app via one delegated
// listener. Purely transform/opacity based (GPU compositable, no layout
// thrash) and cleans itself up after the animation ends.
export default function RippleEffect(){
  useEffect(()=>{
    const onDown=(e)=>{
      const btn=e.target.closest?.(".btn");
      if(!btn || btn.disabled) return;
      const rect=btn.getBoundingClientRect();
      const x=(e.clientX ?? rect.left+rect.width/2)-rect.left;
      const y=(e.clientY ?? rect.top+rect.height/2)-rect.top;
      const span=document.createElement("span");
      span.className="btn-ripple";
      span.style.setProperty("--rx", x+"px");
      span.style.setProperty("--ry", y+"px");
      btn.appendChild(span);
      span.addEventListener("animationend", ()=>span.remove(), {once:true});
      // Safety net in case the element is removed/re-rendered before animationend fires
      setTimeout(()=>span.remove(), 700);
    };
    document.addEventListener("pointerdown", onDown);
    return ()=>document.removeEventListener("pointerdown", onDown);
  },[]);
  return null;
}
