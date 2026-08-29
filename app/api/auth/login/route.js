import { connectDB } from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { signToken, COOKIE_NAME, cookieOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req){
  const { email,password } = await req.json();
  if(!email||!password) return NextResponse.json({error:"Missing fields"},{status:400});
  await connectDB();
  const user=await User.findOne({email: email.toLowerCase()});
  if(!user) return NextResponse.json({error:"Invalid credentials"},{status:401});
  const ok=await bcrypt.compare(password, user.passwordHash);
  if(!ok) return NextResponse.json({error:"Invalid credentials"},{status:401});
  const token=signToken({id:user._id, email:user.email, role:user.role, name:user.name});
  const res=NextResponse.json({user:{id:user._id,email:user.email,name:user.name,role:user.role}});
  res.cookies.set(COOKIE_NAME, token, cookieOptions);
  return res;
}
