import jwt from "jsonwebtoken";
import { cookies } from "next/headers";

const JWT_SECRET = process.env.JWT_SECRET || "dev_secret_change_me_please_1234567890";
const COOKIE_NAME = "quiz_token";
const EXPIRES = "7d";

export function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: EXPIRES });
}
export function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}
export function getTokenFromCookies() {
  try {
    const store = cookies();
    return store.get(COOKIE_NAME)?.value || null;
  } catch {
    return null;
  }
}
export function getUserFromCookies() {
  const t = getTokenFromCookies();
  if (!t) return null;
  return verifyToken(t);
}
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
  maxAge: 60 * 60 * 24 * 7,
};
export { COOKIE_NAME };
