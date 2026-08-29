import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { connectDB } from "@/lib/db";
import User from "@/models/User";

export async function GET(){
  const token=cookies().get(COOKIE_NAME)?.value;
  if(!token) return NextResponse.json({user:null});
  const payload=verifyToken(token);
  if(!payload) return NextResponse.json({user:null});
  await connectDB();
  const user=await User.findById(payload.id).select("email name role");
  if(!user) return NextResponse.json({user:null});
  return NextResponse.json({user:{id:user._id,email:user.email,name:user.name,role:user.role}});
}
