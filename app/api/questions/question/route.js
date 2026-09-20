import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { verifyToken, COOKIE_NAME } from "@/lib/auth";
import { getCategoryById, saveCategory } from "@/lib/questions";

// Targeted question mutations for the admin panel.
// Editing one question no longer sends (or re-saves) the entire subject
// document from the browser — the server loads, mutates, and saves it.
// Actions: add | update | delete | bulkDelete | setAnswer

export const dynamic = "force-dynamic";

function isAdmin() {
  const token = cookies().get(COOKIE_NAME)?.value;
  const payload = token ? verifyToken(token) : null;
  return payload?.role === "admin";
}

function reindex(subcat) {
  subcat.questions.forEach((q, i) => { q.num = i + 1; });
}

function validateQuestion(question) {
  if (!question || typeof question !== "object") return "Invalid question payload.";
  if (!Array.isArray(question.options) || question.options.length !== 4) {
    return "A question needs exactly four options.";
  }
  if (!question.text || !String(question.text).trim()) return "Question text can't be empty.";
  const opts = question.options.map(o => String(o ?? "").trim());
  if (opts.some(o => !o)) return "All four options need text.";
  if (new Set(opts.map(o => o.toLowerCase())).size !== opts.length) {
    return "Two options are identical — check the options before saving.";
  }
  const correct = Number(question.correct);
  if (!Number.isInteger(correct) || correct < 0 || correct > 3) return "Pick a correct option (A–D).";
  if (!question.expl || !String(question.expl).trim()) return "An explanation is required.";
  return null;
}

export async function POST(req) {
  if (!isAdmin()) return NextResponse.json({ error: "Admin only" }, { status: 403 });
  let body;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400 }); }

  const { action, catId, subIdx } = body || {};
  if (!catId || !Number.isInteger(subIdx)) {
    return NextResponse.json({ error: "catId and subIdx are required." }, { status: 400 });
  }
  const category = await getCategoryById(catId);
  if (!category) return NextResponse.json({ error: "Subject not found." }, { status: 404 });
  const subcat = category.subcats?.[subIdx];
  if (!subcat) return NextResponse.json({ error: "Chapter not found." }, { status: 404 });

  if (action === "add" || action === "update") {
    const error = validateQuestion(body.question);
    if (error) return NextResponse.json({ error }, { status: 400 });
    const clean = {
      text: String(body.question.text).trim(),
      options: body.question.options.map(o => String(o).trim()),
      correct: Number(body.question.correct),
      expl: String(body.question.expl).trim(),
    };
    if (action === "add") {
      clean.num = subcat.questions.length + 1;
      subcat.questions.push(clean);
      await saveCategory(category);
      return NextResponse.json({ ok: true, question: clean });
    }
    const idx = subcat.questions.findIndex(q => q.num === Number(body.num));
    if (idx === -1) return NextResponse.json({ error: "Question no longer exists. Refresh the subject and try again." }, { status: 409 });
    clean.num = subcat.questions[idx].num;
    subcat.questions[idx] = clean;
    await saveCategory(category);
    return NextResponse.json({ ok: true, question: clean });
  }

  if (action === "delete") {
    const idx = subcat.questions.findIndex(q => q.num === Number(body.num));
    if (idx === -1) return NextResponse.json({ error: "Question no longer exists." }, { status: 409 });
    subcat.questions.splice(idx, 1);
    reindex(subcat);
    await saveCategory(category);
    return NextResponse.json({ ok: true });
  }

  if (action === "bulkDelete") {
    const targets = Array.isArray(body.targets) ? body.targets : [];
    if (!targets.length) return NextResponse.json({ error: "No questions selected." }, { status: 400 });
    // group target numbers per chapter, splice together, reindex each affected chapter
    const bySub = new Map();
    targets.forEach(t => {
      const s = Number(t.subIdx), n = Number(t.num);
      if (Number.isInteger(s) && Number.isInteger(n)) {
        if (!bySub.has(s)) bySub.set(s, new Set());
        bySub.get(s).add(n);
      }
    });
    bySub.forEach((nums, s) => {
      const sc = category.subcats[s];
      if (!sc) return;
      sc.questions = sc.questions.filter(q => !nums.has(q.num));
      reindex(sc);
    });
    await saveCategory(category);
    return NextResponse.json({ ok: true, deleted: targets.length });
  }

  if (action === "setAnswer") {
    const correct = Number(body.correct);
    if (!Number.isInteger(correct) || correct < 0 || correct > 3) {
      return NextResponse.json({ error: "Pick a valid option (A–D)." }, { status: 400 });
    }
    const q = subcat.questions.find(qq => qq.num === Number(body.num));
    if (!q) return NextResponse.json({ error: "Question no longer exists." }, { status: 409 });
    q.correct = correct;
    await saveCategory(category);
    return NextResponse.json({ ok: true, correct });
  }

  return NextResponse.json({ error: "Unknown action." }, { status: 400 });
}
