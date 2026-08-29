"use client";
export default function Toast({ message, show }) {
  if (!message) return null;
  return <div className={`toast ${show ? "show" : ""}`}>{message}</div>;
}
