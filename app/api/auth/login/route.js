import { connectDB } from "@/lib/db";
import User from "@/models/User";
import bcrypt from "bcryptjs";
import { signToken, COOKIE_NAME, cookieOptions } from "@/lib/auth";
import { NextResponse } from "next/server";

export async function POST(req){
  try {
    const { email,password } = await req.json();
    if(!email||!password) return NextResponse.json({error:"Missing fields"},{status:400});
    await connectDB();
    const user=await User.findOne({email: email.trim().toLowerCase()});
    if(!user) return NextResponse.json({error:"Invalid credentials"},{status:401});
    const ok=await bcrypt.compare(password, user.passwordHash);
    if(!ok) return NextResponse.json({error:"Invalid credentials"},{status:401});
    // Self-heal role: an account whose email is listed in ADMIN_EMAILS should
    // always log in as admin, even if it was created (or the env var was
    // updated) after the user originally signed up as a regular user. Without
    // this, admin access can only ever be granted at signup time.
    const adminEmails=(process.env.ADMIN_EMAILS||"").split(",").map(s=>s.trim().toLowerCase()).filter(Boolean);
    if(adminEmails.includes(user.email.toLowerCase()) && user.role!=="admin"){
      user.role="admin";
      await user.save();
    }
    const token=signToken({id:user._id, email:user.email, role:user.role, name:user.name});
    const res=NextResponse.json({user:{id:user._id,email:user.email,name:user.name,role:user.role}});
    res.cookies.set(COOKIE_NAME, token, cookieOptions);
    return res;
  } catch (error) {
    console.error("POST /api/auth/login failed:", error);
    return NextResponse.json({error:"Authentication service unavailable. Check the MongoDB connection."},{status:503});
  }
}
