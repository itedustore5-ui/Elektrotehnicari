import { Router, type IRouter } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db, quizAttempts, users } from "@workspace/db";
import { questions, type QuizQuestion } from "../data/questions";
import { requireAuth, type AuthedRequest } from "../middlewares/auth";

const router: IRouter = Router();
// ── Javna demo ruta — bez autentifikacije ──────────────────────
router.get("/questions/demo", (req, res) => {
  try {
    const DEMO_SUBJECT = SUBJECTS.find((s) => s.key === "rh")!;
    const subjectQuestions = questions.filter(
      (q) => q.id >= DEMO_SUBJECT.min && q.id <= DEMO_SUBJECT.max
    );
    // Nasumičnih 20
    const shuffled = [...subjectQuestions].sort(() => Math.random() - 0.5).slice(0, 20);
    const mapped = shuffled.map((q) => ({
      ...q,
      imageQuestion: q.imageQuestion ? `/images/${q.id}.jpg` : null,
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ message: "Greška", error: String(err) });
  }
});
const percent = (score: number, total: number) => Math.round((score / Math.max(total, 1)) * 100);

const SUBJECTS = [
  { key: "rh",  label: "Рачунарски хардвер",             min: 1,   max: 51  },
  { key: "os",  label: "Оперативни системи",              min: 52,  max: 151 },
  { key: "ors", label: "Одржавање рачунарских система",   min: 152, max: 201 },
  { key: "td",  label: "Техничка документација",          min: 202, max: 251 },
];

async function attemptsForUser(userId: number) {
  return db.select().from(quizAttempts).where(eq(quizAttempts.userId, userId)).orderBy(desc(quizAttempts.createdAt));
}

function scoreAnswer(question: QuizQuestion, answer: string): boolean {
  try {
    if (question.type === "single") {
      return Number(answer) === question.correctAnswer;
    }
    if (question.type === "multi") {
      const selected = answer.split(",").map(Number).sort((a, b) => a - b);
      const expected = [...question.correctAnswers].sort((a, b) => a - b);
      return selected.length === expected.length && selected.every((v, i) => v === expected[i]);
    }
    if (question.type === "fill") {
      const correct = question.correctAnswer;
      if (Array.isArray(correct)) {
        const given = answer.split("|").map((s) => s.trim().toLowerCase());
        return correct.every((c, i) => c.trim().toLowerCase() === (given[i] ?? ""));
      }
      return answer.trim().toLowerCase() === correct.trim().toLowerCase();
    }
    if (question.type === "match") {
      const pairs = answer.split(",").map(Number);
      return (
        pairs.length === question.correctPairs.length &&
        pairs.every((v, i) => v === question.correctPairs[i])
      );
    }
    if (question.type === "order") {
      const positions = answer.split(",").map(Number);
      return (
        positions.length === question.correctOrder.length &&
        positions.every((v, i) => v === question.correctOrder[i])
      );
    }
    if (question.type === "slot") {
      const q = question as any;
      if (q.slotMulti) {
        const userSlots = answer.split("|").map((s) => new Set(s.split(",").map(Number).filter(Boolean)));
        const correctSlots = (q.correctSlotAnswers ?? []).map((ca: string[]) =>
          new Set(ca[0].split(",").map(Number).filter(Boolean))
        );
        return correctSlots.every(
          (correct: Set<number>, i: number) =>
            [...correct].every((v) => userSlots[i]?.has(v)) &&
            userSlots[i]?.size === correct.size
        );
      } else {
        const vals = answer.split(",").map(Number);
        return (q.correctSlotAnswers ?? []).some((ca: string[]) =>
          ca.every((v: string, i: number) => Number(v) === vals[i])
        );
      }
    }
  } catch {
    return false;
  }
  return false;
}

function subjectStats(answers: { questionId: number; answer: string }[]) {
  const answerMap = new Map(answers.map((a) => [a.questionId, a.answer]));
  return SUBJECTS.map((subject) => {
    const subjectQuestions = questions.filter((q) => q.id >= subject.min && q.id <= subject.max);
    const answered = subjectQuestions.filter((q) => answerMap.has(q.id));
    const correct = answered.filter((q) => scoreAnswer(q, answerMap.get(q.id)!)).length;
    return {
      key: subject.key,
      label: subject.label,
      score: correct,
      total: subjectQuestions.length,
      percentage: answered.length > 0 ? percent(correct, subjectQuestions.length) : null,
    };
  });
}

router.get("/dashboard", requireAuth, async (req, res) => {
  const user = (req as AuthedRequest).user;
  const attempts = await attemptsForUser(user.id);
  const bestScore = attempts.reduce((best, attempt) => Math.max(best, attempt.percentage), 0);
  const lastScore = attempts[0]?.percentage ?? null;
  const locked = user.quizOnce && attempts.length > 0;

  let subjectScores: { key: string; label: string; score: number; total: number; percentage: number | null }[] = [];
  if (attempts.length > 0) {
    const bestAttempt = attempts.reduce((best, a) => a.percentage > best.percentage ? a : best, attempts[0]);
    const savedAnswers = bestAttempt.answers as { questionId: number; answer: string }[];
    subjectScores = subjectStats(savedAnswers);
  } else {
    subjectScores = SUBJECTS.map((s) => ({
      key: s.key,
      label: s.label,
      score: 0,
      total: questions.filter((q) => q.id >= s.min && q.id <= s.max).length,
      percentage: null,
    }));
  }

  res.json({
    attemptsCount: attempts.length,
    bestScore,
    lastScore,
    canTakeQuiz: !locked,
    lockReason: locked ? "Искористили сте свој jedini покушај за квиз." : null,
    subjectScores,
  });
});

router.get("/questions", requireAuth, (req, res) => {
  try {
    const subjectKey = req.query["subject"] as string | undefined;
    let filtered = questions;

    if (subjectKey) {
      const subject = SUBJECTS.find((s) => s.key === subjectKey);
      if (subject) {
        filtered = questions.filter((q) => q.id >= subject.min && q.id <= subject.max);
      }
    }

    const mapped = filtered.map((q) => ({
      ...q,
      imageQuestion: q.imageQuestion ? `/images/${q.id}.jpg` : null,
    }));
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ message: "Greška pri učitavanju pitanja", error: String(err) });
  }
});

router.post("/attempts", requireAuth, async (req, res) => {
  try {
    const user = (req as AuthedRequest).user;
    const previousAttempts = await attemptsForUser(user.id);
    if (user.quizOnce && previousAttempts.length > 0) {
      res.status(403).json({ message: "Искористили сте свој jedini покушај за квиз." });
      return;
    }

    const body = req.body as { answers: { questionId: number; answer: string }[] };
    const answerMap = new Map(body.answers.map((a) => [a.questionId, a.answer]));

    const attemptedIds = new Set(body.answers.map((a) => a.questionId));

    const matchedSubject = SUBJECTS.find((s) =>
      [...attemptedIds].every((id) => id >= s.min && id <= s.max)
    );

    const relevantQuestions = matchedSubject
      ? questions.filter((q) => q.id >= matchedSubject.min && q.id <= matchedSubject.max)
      : questions;

    const score = relevantQuestions.reduce((acc, question) => {
      const answer = answerMap.get(question.id);
      if (answer === undefined) return acc;
      return acc + (scoreAnswer(question, answer) ? 1 : 0);
    }, 0);
    const total = relevantQuestions.length;
    const percentage = percent(score, total);
    const passed = percentage >= 60;

    const [attempt] = await db
      .insert(quizAttempts)
      .values({ userId: user.id, score, total, percentage, passed, answers: body.answers })
      .returning();

    res.json({
      id: attempt.id,
      score: attempt.score,
      total: attempt.total,
      percentage: attempt.percentage,
      passed: attempt.passed,
      createdAt: attempt.createdAt.toISOString(),
    });
  } catch (err) {
    console.error("ATTEMPT ERROR:", err);
    res.status(500).json({ message: String(err) });
  }
});

router.get("/scoreboard", requireAuth, async (req, res) => {
  const user = (req as AuthedRequest).user;
  const subjectKey = req.query["subject"] as string | undefined;
  const subject = subjectKey ? SUBJECTS.find((s) => s.key === subjectKey) : null;

  if (user.role === "student") {
    const attempts = await attemptsForUser(user.id);

    let bestScore = 0;
    if (subject && attempts.length > 0) {
      const bestAttempt = attempts.reduce((best, a) => a.percentage > best.percentage ? a : best, attempts[0]);
      const savedAnswers = bestAttempt.answers as { questionId: number; answer: string }[];
      const stats = subjectStats(savedAnswers);
      bestScore = stats.find((s) => s.key === subjectKey)?.percentage ?? 0;
    } else {
      bestScore = attempts.reduce((best, a) => Math.max(best, a.percentage), 0);
    }

    res.json([{
      rank: 1,
      username: user.username,
      fullName: user.fullName,
      bestScore,
      attemptsCount: attempts.length,
      lastScore: attempts[0]?.percentage ?? null,
    }]);
    return;
  }

  const allUsers = await db.select().from(users).where(and(eq(users.active, true), eq(users.role, "student")));
  const allAttempts = await db.select().from(quizAttempts).orderBy(desc(quizAttempts.createdAt));

  const rows = allUsers
    .map((u) => {
      const userAttempts = allAttempts.filter((a) => a.userId === u.id);

      let bestScore = 0;
      if (subject && userAttempts.length > 0) {
        const bestAttempt = userAttempts.reduce((best, a) => a.percentage > best.percentage ? a : best, userAttempts[0]);
        const savedAnswers = bestAttempt.answers as { questionId: number; answer: string }[];
        const stats = subjectStats(savedAnswers);
        bestScore = stats.find((s) => s.key === subjectKey)?.percentage ?? 0;
      } else {
        bestScore = userAttempts.reduce((best, a) => Math.max(best, a.percentage), 0);
      }

      return {
        username: u.username,
        fullName: u.fullName,
        bestScore,
        attemptsCount: userAttempts.length,
        lastScore: userAttempts[0]?.percentage ?? null,
      };
    })
    .sort((a, b) => b.bestScore - a.bestScore || a.fullName.localeCompare(b.fullName))
    .map((entry, index) => ({ rank: index + 1, ...entry }));

  res.json(rows);
});

export default router;
