import { connectDB } from "@/lib/db";
import User from "@/models/User";
import Progress from "@/models/Progress";
import bcrypt from "bcryptjs";
import { signToken, COOKIE_NAME, cookieOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req){
  try {
    const { name,email,password } = await req.json();
    if(!name||!email||!password) return NextResponse.json({error:"Missing fields"},{status:400});
    if(password.length<6) return NextResponse.json({error:"Password min 6 chars"},{status:400});
    await connectDB();
    const exists=await User.findOne({email: email.toLowerCase()});
    if(exists) return NextResponse.json({error:"Email already registered"},{status:400});
    const hash=await bcrypt.hash(password,10);
    const adminEmails=(process.env.ADMIN_EMAILS||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
    const role = adminEmails.includes(email.toLowerCase()) ? "admin" : "user";
    const user=await User.create({name,email:email.toLowerCase(),passwordHash:hash,role});
    await Progress.create({userId: user._id});
    const token=signToken({id:user._id, email:user.email, role:user.role, name:user.name});
    const res=NextResponse.json({user:{id:user._id,email:user.email,name:user.name,role:user.role}});
    res.cookies.set(COOKIE_NAME, token, cookieOptions);
    return res;
  } catch (e) {
    console.error("POST /api/auth/signup failed:", e);
    return NextResponse.json({ error: "Signup failed. Please try again." }, { status: 500 });
  }
}
