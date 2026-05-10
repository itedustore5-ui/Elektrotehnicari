/**
 * DemoPage.tsx
 * ─────────────────────────────────────────────────────────────────
 * Javno dostupna demo stranica — bez prijave, bez čuvanja rezultata.
 * Prikazuje 20 nasumičnih pitanja iz predmeta "Računarski hardver" (rh).
 *
 * INTEGRACIJA u App.tsx:
 *   1. import DemoPage from "@/pages/DemoPage";
 *   2. U AppRouter dodaj PRIJE /login rute:
 *        <Route path="/demo">{() => <DemoPage />}</Route>
 *   3. Na Login stranici dodaj link:
 *        <a href="/demo">Isprobaj besplatno →</a>
 * ─────────────────────────────────────────────────────────────────
 */

import { useEffect, useRef, useState, useMemo } from "react";
import { useLocation } from "wouter";

// ── Tipovi (isti kao u App.tsx) ───────────────────────────────────
type Question = {
  id: number;
  type: "single" | "multi" | "fill" | "match" | "order" | "slot";
  question: string;
  explanation: string;
  imageQuestion: string | null;
  points?: number;
  options?: string[];
  correctAnswer?: number;
  correctAnswers?: number[];
  correctText?: string | string[];
  hint?: string;
  leftItems?: string[];
  rightItems?: string[];
  correctPairs?: (number | string)[];
  items?: string[];
  correctOrder?: number[];
  hasSkips?: boolean;
  slots?: string[];
  slotOptions?: number[] | string[];
  correctSlotAnswers?: string[][];
  slotMulti?: boolean;
};

// ── Konstante ─────────────────────────────────────────────────────
const DEMO_SUBJECT = "rh";
const DEMO_SUBJECT_LABEL = "Računarski hardver";
const DEMO_COUNT = 20;
const PASS_PCT = 60;

// ── Pomoćne funkcije ──────────────────────────────────────────────
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchQuestions(): Promise<Question[]> {
  const res = await fetch(`/api/questions/demo`);  // ← /demo umesto ?subject=rh
  if (!res.ok) throw new Error("Greška pri učitavanju pitanja.");
  return res.json();
}

function isAnswerCorrect(question: Question, answer: string): boolean {
  try {
    if (question.type === "single")
      return Number(answer) === question.correctAnswer;
    if (question.type === "multi") {
      const sel = answer.split(",").map(Number).sort((a, b) => a - b);
      const exp = [...(question.correctAnswers ?? [])].sort((a, b) => a - b);
      return sel.length === exp.length && sel.every((v, i) => v === exp[i]);
    }
    if (question.type === "fill") {
      if (Array.isArray(question.correctText)) {
        const parts = answer.split("|").map((s) => s.trim().toLowerCase());
        return question.correctText.every(
          (c, i) => c.trim().toLowerCase() === (parts[i] ?? "")
        );
      }
      return (
        answer.trim().toLowerCase() ===
        (question.correctText ?? "").trim().toLowerCase()
      );
    }
    if (question.type === "match") {
      const pairs = answer.split(",").map(Number);
      return pairs.every((v, i) => v === (question.correctPairs ?? [])[i]);
    }
    if (question.type === "order") {
      const pos = answer.split(",").map((v) => (v === "0" ? 0 : Number(v)));
      const correct = question.correctOrder ?? question.correctPairs ?? [];
      return pos.every((v, i) => {
        const c = correct[i];
        if (c === "X" || c === 0) return v === 0;
        return v === Number(c);
      });
    }
    if (question.type === "slot") {
     if (question.slotMulti) {
  const userSlots = answer.split("|").map((s) => new Set(s.split(",").map(Number).filter(Boolean)));
  const correctSlots = (question.correctSlotAnswers ?? []).map((ca) =>
    new Set(ca[0].split(",").map(Number).filter(Boolean))
  );
  if (userSlots.length !== correctSlots.length) return false;
  return correctSlots.every(
    (correct, i) =>
      correct.size === userSlots[i]?.size &&
      [...correct].every((v) => userSlots[i]?.has(v))
  );
      } else {
        const vals = answer.split(",");
        return (question.correctSlotAnswers ?? []).some((ca) =>
          ca.every((v, i) => String(v).trim() === String(vals[i]).trim())
        );
      }
    }
  } catch {
    return false;
  }
  return false;
}

// ── Fullscreen image overlay ──────────────────────────────────────
function ImageOverlay({
  src,
  onClose,
}: {
  src: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center"
      onClick={onClose}
    >
      <button
        className="absolute top-3 right-3 rounded-full bg-white/10 border border-white/20 px-3 py-1.5 text-xs font-bold text-white"
        onClick={onClose}
      >
        ✕ Zatvori
      </button>
      <img
        src={src}
        alt="Slika pitanja"
        className="max-w-full max-h-[90vh] object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

// ── Single choice UI ──────────────────────────────────────────────
function SingleUI({
  question,
  shuffleMap,
  locked,
  onCommit,
}: {
  question: Question;
  shuffleMap: Record<number, number[]>;
  locked: string | undefined;
  onCommit: (a: string) => void;
}) {
  const sm =
    shuffleMap[question.id] ?? (question.options ?? []).map((_, i) => i);
  const displayOptions = sm.map((origIdx) => (question.options ?? [])[origIdx]);
  return (
    <div className="mt-4 grid gap-2">
      {displayOptions.map((option, si) => {
        const origIdx = sm[si];
        const isSelected = locked !== undefined && Number(locked) === origIdx;
        const isCorrect = origIdx === question.correctAnswer;
        let cls =
          "w-full text-left rounded-xl border px-4 py-3 text-sm transition font-medium ";
        if (locked !== undefined && isCorrect)
          cls +=
            "border-emerald-400/50 bg-emerald-500/20 text-emerald-100";
        else if (locked !== undefined && isSelected && !isCorrect)
          cls += "border-red-400/50 bg-red-500/20 text-red-100";
        else if (locked === undefined)
          cls +=
            "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:border-white/30 cursor-pointer";
        else cls += "border-white/10 bg-white/5 text-white/50";
        return (
          <button
            key={si}
            className={cls}
            disabled={locked !== undefined}
            onClick={() => onCommit(String(origIdx))}
          >
            <span className="mr-2 font-black text-blue-300">{si + 1}.</span>{" "}
            {option}
          </button>
        );
      })}
    </div>
  );
}

// ── Multi choice UI ───────────────────────────────────────────────
function MultiUI({
  question,
  shuffleMap,
  locked,
  onCommit,
  onRegisterConfirm,
}: {
  question: Question;
  shuffleMap: Record<number, number[]>;
  locked: string | undefined;
  onCommit: (a: string) => void;
  onRegisterConfirm?: (fn: () => void) => void;
}) {
  const sm =
    shuffleMap[question.id] ?? (question.options ?? []).map((_, i) => i);
  const displayOptions = sm.map((origIdx) => (question.options ?? [])[origIdx]);
  const [sel, setSel] = useState<Set<number>>(new Set());
  useEffect(() => {
    setSel(new Set());
  }, [question.id]);
  const commit = () => {
    if (sel.size === 0) return;
    const origIndices = [...sel]
      .map((si) => sm[si])
      .sort((a, b) => a - b)
      .join(",");
    onCommit(origIndices);
  };
  useEffect(() => {
    onRegisterConfirm?.(commit);
  }, [sel, question.id]);
  const toggle = (si: number) => {
    if (locked !== undefined) return;
    setSel((prev) => {
      const next = new Set(prev);
      next.has(si) ? next.delete(si) : next.add(si);
      return next;
    });
  };
  const lockedOrig = locked?.split(",").map(Number) ?? null;
  return (
    <div className="mt-4 grid gap-2">
      <p className="text-xs text-blue-300 mb-1">Izaberite sve tačne odgovore:</p>
      {displayOptions.map((option, si) => {
        const origIdx = sm[si];
        const isLockedSel = lockedOrig?.includes(origIdx) ?? false;
        const isCorrect = (question.correctAnswers ?? []).includes(origIdx);
        const isNowSel = sel.has(si);
        let cls =
          "w-full text-left rounded-xl border px-4 py-3 text-sm transition font-medium flex items-start gap-3 ";
        if (locked !== undefined && isCorrect)
          cls += "border-emerald-400/50 bg-emerald-500/20 text-emerald-100";
        else if (locked !== undefined && isLockedSel && !isCorrect)
          cls += "border-red-400/50 bg-red-500/20 text-red-100";
        else if (locked === undefined && isNowSel)
          cls += "border-blue-400/50 bg-blue-500/20 text-white";
        else if (locked === undefined)
          cls +=
            "border-white/15 bg-white/5 text-white hover:bg-white/10 cursor-pointer";
        else cls += "border-white/10 bg-white/5 text-white/50";
        return (
          <button
            key={si}
            className={cls}
            disabled={locked !== undefined}
            onClick={() => toggle(si)}
          >
            <span
              className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border-2 ${
                isNowSel || (locked !== undefined && isLockedSel)
                  ? "border-white bg-white/30"
                  : "border-white/40"
              }`}
            >
              {(isNowSel || (locked !== undefined && isLockedSel)) && (
                <span className="block h-2 w-2 rounded-sm bg-white" />
              )}
            </span>
            <span>
              <span className="mr-1 font-black text-blue-300">{si + 1}.</span>{" "}
              {option}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// ── Fill UI ───────────────────────────────────────────────────────
function FillUI({
  question,
  locked,
  onCommit,
  onRegisterConfirm,
}: {
  question: Question;
  locked: string | undefined;
  onCommit: (a: string) => void;
  onRegisterConfirm?: (fn: () => void) => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => {
    setText("");
  }, [question.id]);
  const commit = () => {
    if (text.trim()) onCommit(text.trim());
  };
  useEffect(() => {
    onRegisterConfirm?.(commit);
  }, [text, question.id]);
  return (
    <div className="mt-4">
      {question.hint && (
        <p className="mb-2 text-xs italic text-blue-300">
          Napomena: {question.hint}
        </p>
      )}
      <input
        className="w-full rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-white text-sm placeholder-white/30 focus:outline-none focus:border-blue-400/50 focus:bg-white/10 transition"
        placeholder="Upišite odgovor..."
        value={locked !== undefined ? locked : text}
        disabled={locked !== undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
        }}
      />
      {locked !== undefined && (
        <p
          className={`mt-2 text-sm font-black ${
            isAnswerCorrect(question, locked)
              ? "text-emerald-300"
              : "text-red-300"
          }`}
        >
          {isAnswerCorrect(question, locked)
            ? "Tačno ✓"
            : `Netačno — tačan odgovor: ${
                Array.isArray(question.correctText)
                  ? question.correctText.join(", ")
                  : question.correctText
              }`}
        </p>
      )}
    </div>
  );
}

// ── Match UI ──────────────────────────────────────────────────────
function MatchUI({
  question,
  locked,
  onCommit,
  onRegisterConfirm,
}: {
  question: Question;
  locked: string | undefined;
  onCommit: (a: string) => void;
  onRegisterConfirm?: (fn: () => void) => void;
}) {
  const left = question.leftItems ?? [];
  const right = question.rightItems ?? [];
  const [pairs, setPairs] = useState<Record<number, number>>({});
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  useEffect(() => {
    setPairs({});
    setSelectedLeft(null);
  }, [question.id]);
  const lockedPairs: Record<number, number> = useMemo(() => {
    if (!locked) return pairs;
    return Object.fromEntries(
      locked.split(",").map((v, i) => [i, Number(v)])
    );
  }, [locked, pairs]);
  const commit = () => {
    if (Object.keys(pairs).length < left.length) return;
    onCommit(left.map((_, i) => pairs[i] ?? -1).join(","));
  };
  useEffect(() => {
    onRegisterConfirm?.(commit);
  }, [pairs, question.id]);
  const clickLeft = (li: number) => {
    if (locked !== undefined) return;
    if (selectedLeft === li) {
      setSelectedLeft(null);
    } else if (pairs[li] !== undefined && selectedLeft === null) {
      setPairs((p) => {
        const n = { ...p };
        delete n[li];
        return n;
      });
      setSelectedLeft(li);
    } else {
      setSelectedLeft(li);
    }
  };
  const clickRight = (ri: number) => {
    if (locked !== undefined || selectedLeft === null) return;
    setPairs((p) => {
      const n = { ...p };
      for (const k of Object.keys(n))
        if (n[Number(k)] === ri) delete n[Number(k)];
      n[selectedLeft] = ri;
      return n;
    });
    setSelectedLeft(null);
  };
  return (
    <div className="mt-4">
      <p className="mb-2 text-xs text-blue-300">
        Kliknite levo, zatim desno:
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="grid gap-2">
          {left.map((item, li) => {
            const paired = locked !== undefined ? lockedPairs[li] : pairs[li];
            const isActive = selectedLeft === li;
            const isCorrect =
              locked !== undefined &&
              (question.correctPairs ?? [])[li] === lockedPairs[li];
            const isWrong = locked !== undefined && !isCorrect;
            let cls =
              "text-left rounded-xl border px-3 py-2 text-xs transition cursor-pointer ";
            if (isActive) cls += "border-white ring-1 ring-white bg-white/15";
            else if (isCorrect)
              cls += "border-emerald-400/50 bg-emerald-500/20 text-emerald-100";
            else if (isWrong)
              cls += "border-red-400/50 bg-red-500/20 text-red-100";
            else if (paired !== undefined) cls += "border-blue-400/30 bg-blue-500/15";
            else cls += "border-white/15 bg-white/5 hover:bg-white/10";
            return (
              <button
                key={li}
                className={cls}
                onClick={() => clickLeft(li)}
                disabled={locked !== undefined}
              >
                {item}
                {paired !== undefined && (
                  <span className="ml-1 text-blue-300 text-[10px]">
                    → {right[paired]}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="grid gap-2 content-start">
          {right.map((item, ri) => {
            const usedByLeft =
              locked !== undefined
                ? Object.entries(lockedPairs).find(([, v]) => v === ri)?.[0]
                : Object.entries(pairs).find(([, v]) => v === ri)?.[0];
            let cls =
              "text-left rounded-xl border px-3 py-2 text-xs transition cursor-pointer ";
            if (locked !== undefined) {
              const li = usedByLeft !== undefined ? Number(usedByLeft) : -1;
              if (li >= 0) {
                const ok = (question.correctPairs ?? [])[li] === ri;
                cls += ok
                  ? "border-emerald-400/50 bg-emerald-500/20 text-emerald-100"
                  : "border-red-400/50 bg-red-500/20 text-red-100";
              } else cls += "border-white/10 bg-white/5 text-white/40";
            } else if (usedByLeft !== undefined)
              cls += "border-blue-400/30 bg-blue-500/15";
            else cls += "border-white/15 bg-white/5 hover:bg-white/10";
            return (
              <button
                key={ri}
                className={cls}
                onClick={() => clickRight(ri)}
                disabled={locked !== undefined || usedByLeft !== undefined}
              >
                {item}
              </button>
            );
          })}
          {locked !== undefined && (
            <div className="mt-2 text-xs text-blue-200">
              <p className="font-black mb-1">Tačni parovi:</p>
              {left.map((lItem, li) => (
                <p key={li}>
                  {lItem} → {right[(question.correctPairs ?? [])[li] as number]}
                </p>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Order UI ──────────────────────────────────────────────────────
function OrderUI({
  question,
  locked,
  onCommit,
  onRegisterConfirm,
}: {
  question: Question;
  locked: string | undefined;
  onCommit: (a: string) => void;
  onRegisterConfirm?: (fn: () => void) => void;
}) {
  const items = question.items ?? [];
  const hasSkips = question.hasSkips ?? false;
  const correctRef = question.correctOrder ?? question.correctPairs ?? [];
  const maxPos = hasSkips
    ? correctRef.filter((v) => v !== "X" && Number(v) > 0).length
    : items.length;
  const [positions, setPositions] = useState<Record<number, number>>({});
  useEffect(() => {
    setPositions({});
  }, [question.id]);
  const commit = () =>
    onCommit(items.map((_, i) => positions[i] ?? 0).join(","));
  useEffect(() => {
    onRegisterConfirm?.(commit);
  }, [positions, question.id]);
  const lockedPos: Record<number, number> = useMemo(() => {
    if (!locked) return positions;
    return Object.fromEntries(
      locked.split(",").map((v, i) => [i, Number(v)])
    );
  }, [locked, positions]);
  const posOptions = hasSkips
    ? [0, ...Array.from({ length: maxPos }, (_, i) => i + 1)]
    : Array.from({ length: maxPos }, (_, i) => i + 1);
  return (
    <div className="mt-4 grid gap-2">
      <p className="text-xs text-blue-300 mb-1">
        {hasSkips
          ? "Dodeli redni broj ili X (nula) za akcije koje ne treba preduzeti:"
          : "Dodeli redni broj svakoj stavci (1 = prvo):"}
      </p>
      {items.map((item, i) => {
        const pos = locked !== undefined ? lockedPos[i] : positions[i];
        const correctPos = correctRef[i];
        const isCorrect =
          locked !== undefined &&
          (correctPos === "X" || correctPos === 0
            ? pos === 0
            : pos === Number(correctPos));
        const isWrong = locked !== undefined && !isCorrect;
        return (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-xl border p-2.5 ${
              isCorrect
                ? "border-emerald-400/40 bg-emerald-500/15"
                : isWrong
                ? "border-red-400/40 bg-red-500/15"
                : "border-white/10 bg-white/5"
            }`}
          >
            <select
              className="rounded-lg border border-white/20 bg-slate-800 px-2 py-1.5 text-white text-xs"
              value={pos ?? ""}
              disabled={locked !== undefined}
              onChange={(e) =>
                setPositions((p) => ({ ...p, [i]: Number(e.target.value) }))
              }
            >
              <option value="">—</option>
              {posOptions.map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "X" : v}
                </option>
              ))}
            </select>
            <span className="flex-1 text-xs text-white">{item}</span>
            {isWrong && (
              <span className="text-xs text-red-300">
                tačno: {correctPos === 0 || correctPos === "X" ? "X" : correctPos}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Slot UI ───────────────────────────────────────────────────────
function SlotUI({
  question,
  locked,
  onCommit,
  onRegisterConfirm,
}: {
  question: Question;
  locked: string | undefined;
  onCommit: (a: string) => void;
  onRegisterConfirm?: (fn: () => void) => void;
}) {
  const slots = question.slots ?? [];
  const options = question.slotOptions ?? [];
  const [selections, setSelections] = useState<Record<number, any>>({});
  useEffect(() => {
    setSelections({});
  }, [question.id]);
  const commit = () =>
    onCommit(slots.map((_, i) => selections[i] ?? "").join(","));
  useEffect(() => {
    onRegisterConfirm?.(commit);
  }, [selections, question.id]);
  const lockedSel: Record<number, any> = useMemo(() => {
    if (!locked) return selections;
    return Object.fromEntries(locked.split(",").map((v, i) => [i, v]));
  }, [locked, selections]);
  const correctAns = question.correctSlotAnswers ?? [];
  return (
    <div className="mt-4 grid gap-2">
      <p className="text-xs text-blue-300 mb-1">
        Izaberite redni broj modula za svaki slot:
      </p>
      {slots.map((slot, i) => {
        const val = locked !== undefined ? lockedSel[i] : selections[i];
        const isCorrect =
          locked !== undefined &&
          correctAns.some((ca) => Number(ca[i]) === Number(val));
        const isWrong = locked !== undefined && !isCorrect;
        return (
          <div
            key={i}
            className={`flex items-center gap-3 rounded-xl border p-2.5 ${
              isCorrect
                ? "border-emerald-400/40 bg-emerald-500/15"
                : isWrong
                ? "border-red-400/40 bg-red-500/15"
                : "border-white/10 bg-white/5"
            }`}
          >
            <span className="w-20 shrink-0 text-xs font-bold text-blue-200">
              {slot}
            </span>
            <select
              className="rounded-lg border border-white/20 bg-slate-800 px-2 py-1.5 text-white text-xs"
              value={val ?? ""}
              disabled={locked !== undefined}
              onChange={(e) =>
                setSelections((p) => ({ ...p, [i]: e.target.value }))
              }
            >
              <option value="">—</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
            </select>
            {isWrong && (
              <span className="text-xs text-red-300">
                tačno: {correctAns[0]?.[i]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Glavni DemoPage komponent ─────────────────────────────────────
export default function DemoPage() {
  const [, navigate] = useLocation();

  const [questions, setQuestions] = useState<Question[]>([]);
  const [shuffleMap, setShuffleMap] = useState<Record<number, number[]>>({});
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [overlayImg, setOverlayImg] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);
  const confirmRef = useRef<(() => void) | null>(null);

  const load = () => {
    setLoading(true);
    setError("");
    fetchQuestions()
      .then((qs) => {
        setQuestions(qs);
        setCurrent(0);
        setAnswers({});
        setFinished(false);
        const sm: Record<number, number[]> = {};
        for (const q of qs) {
          if ((q.type === "single" || q.type === "multi") && q.options) {
            sm[q.id] = shuffle(q.options.map((_, i) => i));
          }
        }
        setShuffleMap(sm);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const question = questions[current];
  const locked = question ? answers[question.id] : undefined;
  const answeredCount = Object.keys(answers).length;
  const progress = Math.round(
    (answeredCount / Math.max(questions.length, 1)) * 100
  );

  const commit = (answer: string) => {
    if (!question || answers[question.id] !== undefined) return;
    setAnswers((prev) => ({ ...prev, [question.id]: answer }));
  };

  // ── Rezultat ekran ──────────────────────────────────────────────
  if (finished) {
    const correct = questions.filter((q) =>
      answers[q.id] !== undefined ? isAnswerCorrect(q, answers[q.id]) : false
    ).length;
    const pct = Math.round((correct / questions.length) * 100);
    const passed = pct >= PASS_PCT;

    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#1d4ed8_0,#111827_36%,#312e81_100%)] flex items-center justify-center p-4 text-white">
        <div className="w-full max-w-lg rounded-[2rem] border border-white/15 bg-white/10 backdrop-blur-xl shadow-2xl p-8 text-center">
          {/* Demo badge */}
          <span className="inline-block rounded-full border border-amber-400/40 bg-amber-400/15 px-3 py-1 text-xs font-black text-amber-300 mb-6">
            DEMO — {DEMO_SUBJECT_LABEL}
          </span>

          <div
            className={`text-7xl font-black mb-2 ${
              passed ? "text-emerald-300" : "text-red-300"
            }`}
          >
            {pct}%
          </div>
          <p className="text-blue-100 text-sm mb-1">
            Tačno {correct} od {questions.length} pitanja
          </p>
          <p
            className={`font-black text-lg mb-8 ${
              passed ? "text-emerald-300" : "text-red-300"
            }`}
          >
            {passed ? "Položio/la si demo!" : "Pokušaj ponovo!"}
          </p>

          {/* Per-question mini review */}
          <div className="mb-8 grid grid-cols-10 gap-1.5 justify-center">
            {questions.map((q, idx) => {
              const ans = answers[q.id];
              const ok = ans !== undefined && isAnswerCorrect(q, ans);
              return (
                <div
                  key={q.id}
                  title={`Pitanje ${idx + 1}`}
                  className={`h-2.5 w-2.5 rounded-full ${
                    ans === undefined
                      ? "bg-white/20"
                      : ok
                      ? "bg-emerald-400"
                      : "bg-red-400"
                  }`}
                />
              );
            })}
          </div>

          {/* CTA — ulogovati se */}
          <div className="rounded-2xl border border-blue-400/25 bg-blue-500/15 p-5 mb-5">
            <p className="font-black text-base mb-1">
              Želiš sva {" "}
              <span className="text-blue-300">250+ pitanja</span>?
            </p>
            <p className="text-sm text-blue-200 mb-4">
              Prijavi se i vežbaj sve predmete, prati napredak i takmič se na
              scoreboardu.
            </p>
            <button
              onClick={() => navigate("/login")}
              className="w-full rounded-xl bg-white px-5 py-3 font-black text-indigo-950 hover:scale-[1.02] transition"
            >
              Prijavi se →
            </button>
          </div>

          <div className="flex gap-3">
            <button
              className="flex-1 rounded-xl border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-bold text-blue-200 hover:bg-white/10 transition"
              onClick={load}
            >
              ↺ Pokušaj ponovo
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Loading / Error ─────────────────────────────────────────────
  if (loading) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#1d4ed8_0,#111827_36%,#312e81_100%)] flex items-center justify-center text-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-blue-200">Učitavanje pitanja...</p>
        </div>
      </div>
    );
  }

  if (error || !question) {
    return (
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#1d4ed8_0,#111827_36%,#312e81_100%)] flex items-center justify-center p-4 text-white">
        <div className="text-center">
          <p className="text-red-300 mb-4">{error || "Greška pri učitavanju."}</p>
          <button
            onClick={load}
            className="rounded-xl bg-white px-5 py-2.5 font-bold text-slate-900"
          >
            Pokušaj ponovo
          </button>
        </div>
      </div>
    );
  }

  // ── Kviz ekran ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#1d4ed8_0,#111827_36%,#312e81_100%)] text-white pb-28">
      {overlayImg && (
        <ImageOverlay src={overlayImg} onClose={() => setOverlayImg(null)} />
      )}

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-amber-300">
              DEMO
            </span>
            <span className="ml-2 text-xs text-blue-300">
              {DEMO_SUBJECT_LABEL}
            </span>
          </div>
          <button
            onClick={() => navigate("/login")}
            className="rounded-full bg-white px-4 py-1.5 text-xs font-black text-indigo-950 hover:scale-105 transition"
          >
            Prijavi se →
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-0.5 bg-white/10">
          <div
            className="h-full bg-gradient-to-r from-amber-400 to-emerald-400 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
      </header>

      {/* Question card */}
      <main className="mx-auto max-w-3xl px-4 pt-4">
        {/* Counter */}
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs font-bold text-white">
            Pitanje {current + 1} / {questions.length}
          </span>
          <span className="text-xs text-blue-300">
            {answeredCount} odgovoreno
          </span>
        </div>

        <div className="rounded-[1.5rem] border border-white/10 bg-white/10 backdrop-blur-sm shadow-xl p-5">
          {/* Type badge + points */}
          <div className="mb-3 flex flex-wrap gap-2 items-center">
            <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-blue-300">
              {question.type === "single"
                ? "Jedan odgovor"
                : question.type === "multi"
                ? "Višestruki"
                : question.type === "fill"
                ? "Upiši"
                : question.type === "match"
                ? "Povezivanje"
                : question.type === "slot"
                ? "Slotovi"
                : "Redosled"}
            </span>
            {question.points != null && (
              <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-2 py-0.5 text-[10px] text-yellow-300 font-bold">
                {question.points} {question.points === 1 ? "bod" : "boda"}
              </span>
            )}
          </div>

          {/* Image */}
          {question.imageQuestion && (
            <div className="mb-3">
              <img
                src={question.imageQuestion}
                alt={`Pitanje ${question.id}`}
                className="max-h-48 w-full rounded-2xl border border-white/10 object-contain cursor-pointer"
                onClick={() => setOverlayImg(question.imageQuestion!)}
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
              />
              <p className="mt-1 text-center text-[10px] text-blue-400">
                👆 Klikni za uvećanje
              </p>
            </div>
          )}

          {/* Question text */}
          <h3 className="text-base font-black leading-snug md:text-xl">
            {question.question}
          </h3>

          {/* Answer UI */}
          {question.type === "single" && (
            <SingleUI
              question={question}
              shuffleMap={shuffleMap}
              locked={locked}
              onCommit={commit}
            />
          )}
          {question.type === "multi" && (
            <MultiUI
              question={question}
              shuffleMap={shuffleMap}
              locked={locked}
              onCommit={commit}
              onRegisterConfirm={(fn) => {
                confirmRef.current = fn;
              }}
            />
          )}
          {question.type === "fill" && (
            <FillUI
              question={question}
              locked={locked}
              onCommit={commit}
              onRegisterConfirm={(fn) => {
                confirmRef.current = fn;
              }}
            />
          )}
          {question.type === "match" && (
            <MatchUI
              question={question}
              locked={locked}
              onCommit={commit}
              onRegisterConfirm={(fn) => {
                confirmRef.current = fn;
              }}
            />
          )}
          {question.type === "order" && (
            <OrderUI
              question={question}
              locked={locked}
              onCommit={commit}
              onRegisterConfirm={(fn) => {
                confirmRef.current = fn;
              }}
            />
          )}
          {question.type === "slot" && (
            <SlotUI
              question={question}
              locked={locked}
              onCommit={commit}
              onRegisterConfirm={(fn) => {
                confirmRef.current = fn;
              }}
            />
          )}

          {/* Explanation */}
          {locked !== undefined && question.type !== "fill" && (
            <div className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 p-3">
              <p
                className={`font-black text-sm ${
                  isAnswerCorrect(question, locked)
                    ? "text-emerald-300"
                    : "text-red-300"
                }`}
              >
                {isAnswerCorrect(question, locked) ? "Tačno! ✓" : "Netačno ✗"}
              </p>
              <p className="mt-1 text-xs text-blue-100">{question.explanation}</p>
            </div>
          )}
        </div>

        {/* Inline CTA svako 5 pitanja (ne na prvom) */}
        {current > 0 && (current + 1) % 5 === 0 && locked !== undefined && (
          <div className="mt-4 rounded-2xl border border-blue-400/25 bg-blue-500/15 p-4 flex items-center justify-between gap-3">
            <p className="text-xs text-blue-200 font-bold">
              Sviđa ti se? Prijavi se za sva pitanja! 🎓
            </p>
            <button
              onClick={() => navigate("/login")}
              className="shrink-0 rounded-xl bg-white px-4 py-2 text-xs font-black text-indigo-950 hover:scale-105 transition"
            >
              Prijavi se
            </button>
          </div>
        )}
      </main>

      {/* Fixed bottom bar */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-slate-950/85 backdrop-blur-xl px-4 py-2">
        <div className="mx-auto max-w-3xl flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-blue-200 hover:bg-white/10 transition disabled:opacity-30"
              disabled={current === 0}
              onClick={() => setCurrent((v) => Math.max(0, v - 1))}
            >
              ← Nazad
            </button>

            <button
              className="flex-1 rounded-lg py-2 text-xs font-black transition active:scale-95 disabled:opacity-40"
              style={{
                background:
                  locked !== undefined
                    ? "rgba(255,255,255,0.07)"
                    : "linear-gradient(90deg,#f59e0b,#6366f1)",
                color:
                  locked !== undefined ? "rgba(147,197,253,0.7)" : "white",
                cursor: locked !== undefined ? "default" : "pointer",
              }}
              disabled={locked !== undefined}
              onClick={() => confirmRef.current?.()}
            >
              {locked !== undefined
                ? `✓ ${answeredCount}/${questions.length} odgovoreno`
                : "Potvrdi odgovor"}
            </button>

            {current < questions.length - 1 ? (
              <button
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-xs font-bold text-blue-200 hover:bg-white/10 transition"
                onClick={() =>
                  setCurrent((v) => Math.min(questions.length - 1, v + 1))
                }
              >
                Napred →
              </button>
            ) : (
              <button
                className="rounded-lg bg-emerald-500/80 border border-emerald-400/30 px-3 py-2 text-xs font-black text-white hover:bg-emerald-500 transition"
                onClick={() => setFinished(true)}
              >
                Završi
              </button>
            )}
          </div>

          {/* Progress dots */}
          <div className="flex flex-wrap justify-center gap-0.5">
            {questions.map((item, index) => {
              const ans = answers[item.id];
              const state =
                ans === undefined
                  ? "bg-white/20"
                  : isAnswerCorrect(item, ans)
                  ? "bg-emerald-400"
                  : "bg-red-400";
              return (
                <button
                  key={item.id}
                  title={`Pitanje ${index + 1}`}
                  onClick={() => setCurrent(index)}
                  className={`h-1 rounded-full transition-all ${state} ${
                    index === current ? "w-4 brightness-150" : "w-1.5"
                  }`}
                />
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
