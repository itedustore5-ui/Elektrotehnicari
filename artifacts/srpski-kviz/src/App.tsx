import { useEffect, useMemo, useRef, useState } from "react";
import { Route, Router as WouterRouter, Switch, useLocation, useSearch } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import DemoPage from "@/pages/DemoPage";

type AuthUser = {
  id: number;
  username: string;
  fullName: string;
  role: "admin" | "student";
  active: boolean;
  neverExpires: boolean;
  quizOnce: boolean;
};

type AdminUser = AuthUser & { password: string; createdAt: string };

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
  correctPairs?: (number | string)[] | (number | string)[][];
  items?: string[];
  correctOrder?: number[];
  hasSkips?: boolean;
  slots?: string[];
  slotOptions?: number[] | string[];
  correctSlotAnswers?: string[][];
  slotMulti?: boolean;
};

type SubjectScore = {
  key: string;
  label: string;
  score: number;
  total: number;
  percentage: number | null;
};

type DashboardStats = {
  attemptsCount: number;
  bestScore: number;
  lastScore: number | null;
  canTakeQuiz: boolean;
  lockReason: string | null;
  subjectScores: SubjectScore[];
};
type ScoreboardEntry = {
  rank: number;
  username: string;
  fullName: string;
  bestScore: number;
  attemptsCount: number;
  lastScore: number | null;
};
type AdminResult = {
  id: number;
  username: string;
  fullName: string;
  score: number;
  total: number;
  percentage: number;
  passed: boolean;
  createdAt: string;
};

type UserInput = {
  username: string;
  password: string;
  fullName: string;
  role: "admin" | "student";
  active: boolean;
  neverExpires: boolean;
  quizOnce: boolean;
};

const SUBJECTS = [
  { key: "rh",  label: "Рачунарски хардвер" },
  { key: "os",  label: "Оперативни системи" },
  { key: "ors", label: "Одржавање рачунарских система" },
  { key: "td",  label: "Техничка документација" },
];

const queryClient = new QueryClient();
const TOKEN_KEY = "srpski-kviz-token";
const emptyUser: UserInput = {
  username: "",
  password: "",
  fullName: "",
  role: "student",
  active: true,
  neverExpires: true,
  quizOnce: false,
};

async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.message ?? "Дошло је до грешке.");
  }
  return data as T;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isAnswerCorrect(question: Question, answer: string): boolean {
  try {
    if (question.type === "single") return Number(answer) === question.correctAnswer;
    if (question.type === "multi") {
      const sel = answer.split(",").map(Number).sort((a, b) => a - b);
      const exp = [...(question.correctAnswers ?? [])].sort((a, b) => a - b);
      return sel.length === exp.length && sel.every((v, i) => v === exp[i]);
    }
    if (question.type === "fill") {
      if (Array.isArray(question.correctText)) {
        const parts = answer.split("|").map((s) => s.trim().toLowerCase());
        return question.correctText.every((c, i) => c.trim().toLowerCase() === (parts[i] ?? ""));
      }
      return answer.trim().toLowerCase() === (question.correctText ?? "").trim().toLowerCase();
    }
if (question.type === "match") {
  const pairs = answer.split(",").map(Number);
  const correct = question.correctPairs ?? [];
  if (Array.isArray(correct[0])) {
    return (correct as (number | string)[][]).some((combo) =>
      pairs.every((v, i) => v === Number(combo[i]))
    );
  }
  return pairs.every((v, i) => v === Number(correct[i]));
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
        // FIX 1: obični slot — poredi svaki odgovor sa correctSlotAnswers
        const userVals = answer.split(",");
        return (question.correctSlotAnswers ?? []).some((ca) =>
          ca.every((correctVal, i) => Number(userVals[i]) === Number(correctVal))
        );
      }
    }
  } catch { return false; }
  return false;
}

function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!localStorage.getItem(TOKEN_KEY)) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      setUser(await api<AuthUser>("/auth/me"));
    } catch {
      localStorage.removeItem(TOKEN_KEY);
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void refresh(); }, []);
  return { user, setUser, loading, refresh };
}

// ── Fullscreen image overlay with pinch-zoom support ─────────────────────────
function ImageOverlay({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    // Omogući zoom na celoj stranici dok je overlay otvoren
    const viewport = document.querySelector('meta[name="viewport"]');
    const original = viewport?.getAttribute("content") ?? "";
    viewport?.setAttribute("content", "width=device-width, initial-scale=1, maximum-scale=5, user-scalable=yes");
    return () => {
      document.removeEventListener("keydown", handler);
      viewport?.setAttribute("content", original);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/95"
      style={{ touchAction: "pan-x pan-y pinch-zoom" }}
    >
      <button
        className="absolute top-3 right-3 z-10 rounded-full bg-white/10 border border-white/20 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/20 transition"
        onClick={onClose}
        style={{ touchAction: "manipulation" }}
      >
        ✕ Затвори
      </button>
      <img
        src={src}
        alt={alt}
        style={{
          touchAction: "pan-x pan-y pinch-zoom",
          position: "absolute",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
          maxWidth: "100%",
          maxHeight: "90vh",
          objectFit: "contain",
        }}
      />
      <p
        className="absolute bottom-4 left-0 right-0 text-center text-xs text-white/40"
        onClick={onClose}
      >
        Кликни испод слике за затварање · Pinch за зум
      </p>
    </div>
  );
}
function Shell({ user, onLogout, children }: { user: AuthUser; onLogout: () => void; children: React.ReactNode }) {
  const [, navigate] = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,#1d4ed8_0,#111827_36%,#312e81_100%)] text-white">
      <header className="sticky top-0 z-30 border-b border-white/10 bg-slate-950/55 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-2 px-3 py-1 md:px-4 md:py-4">
          <button onClick={() => { navigate("/dashboard"); setMenuOpen(false); }} className="text-left">
            <p className="text-xs uppercase tracking-[0.35em] text-blue-200 hidden sm:block">Матурски квиз</p>
            <h1 className="text-sm font-black md:text-xl">Електротехничар рачунара</h1>
          </button>

          <nav className="hidden md:flex flex-wrap items-center gap-2 text-sm">
            <button className="nav-btn" onClick={() => navigate("/dashboard")}>Dashboard</button>
            <button className="nav-btn" onClick={() => navigate("/quiz")}>Квиз</button>
            <button className="nav-btn" onClick={() => navigate("/scoreboard")}>Scoreboard</button>
            {user.role === "admin" && <button className="nav-btn" onClick={() => navigate("/admin")}>Admin</button>}
            <span className="rounded-full border border-white/15 px-3 py-2 text-blue-100">{user.fullName}</span>
            <button className="rounded-full bg-white px-4 py-2 font-bold text-slate-900" onClick={onLogout}>Одјава</button>
          </nav>

          <button
            className="md:hidden flex flex-col gap-1.5 p-2 rounded-xl border border-white/15"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="Мени"
          >
            <span className={`block h-0.5 w-5 bg-white transition-transform ${menuOpen ? "rotate-45 translate-y-2" : ""}`} />
            <span className={`block h-0.5 w-5 bg-white transition-opacity ${menuOpen ? "opacity-0" : ""}`} />
            <span className={`block h-0.5 w-5 bg-white transition-transform ${menuOpen ? "-rotate-45 -translate-y-2" : ""}`} />
          </button>
        </div>

        {menuOpen && (
          <div className="md:hidden border-t border-white/10 bg-slate-950/80 backdrop-blur-xl px-3 py-3 flex flex-col gap-2">
            <button className="nav-btn text-left w-full" onClick={() => { navigate("/dashboard"); setMenuOpen(false); }}>Dashboard</button>
            <button className="nav-btn text-left w-full" onClick={() => { navigate("/quiz"); setMenuOpen(false); }}>Квиз</button>
            <button className="nav-btn text-left w-full" onClick={() => { navigate("/scoreboard"); setMenuOpen(false); }}>Scoreboard</button>
            {user.role === "admin" && <button className="nav-btn text-left w-full" onClick={() => { navigate("/admin"); setMenuOpen(false); }}>Admin</button>}
            <div className="flex items-center justify-between pt-2 border-t border-white/10 mt-1">
              <span className="text-sm text-blue-100">{user.fullName}</span>
              <button className="rounded-full bg-white px-4 py-2 text-sm font-bold text-slate-900" onClick={onLogout}>Одјава</button>
            </div>
          </div>
        )}
      </header>

      {/* Mobile: px-2 py-2 | Desktop: px-4 py-8 */}
      <main className="mx-auto max-w-7xl px-2 py-2 md:px-4 md:py-8">{children}</main>
    </div>
  );
}

function Login({ onLogin }: { onLogin: (user: AuthUser) => void }) {
  const [, navigate] = useLocation();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const data = await api<{ token: string; user: AuthUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      onLogin(data.user);
      navigate("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Пријава није успела.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(135deg,#0f172a,#1e3a8a,#4f46e5)] p-4 text-white">
      <div className="grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-white/15 bg-white/10 shadow-2xl backdrop-blur md:grid-cols-[1.1fr_0.9fr]">
        <div className="p-8 md:p-12">
          <p className="mb-4 text-sm font-bold uppercase tracking-[0.35em] text-blue-200">Припрема за</p>
          <h1 className="text-4xl font-black leading-tight md:text-6xl">матурски испит</h1>
          <p className="text-4xl font-black leading-tight md:text-6xl">Електротехничар рачунара.</p>
          <p className="mt-6 max-w-xl text-lg text-blue-100">Садржај је идентичан приручнику ЗУОВ-а.</p>
        </div>
        <form onSubmit={submit} className="bg-slate-950/45 p-8 md:p-12">
          <h2 className="text-2xl font-black">Пријава</h2>
          <label className="mt-8 block text-sm font-bold text-blue-100">Корисничко ime</label>
          <input className="input" value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
          <label className="mt-4 block text-sm font-bold text-blue-100">Лозинка</label>
          <input className="input" type="password" value={password} autoComplete="current-password" onChange={(e) => setPassword(e.target.value)} />
          {error && <p className="mt-4 rounded-xl border border-red-300/40 bg-red-500/20 p-3 text-sm text-red-100">{error}</p>}
          <button disabled={loading} className="mt-6 w-full rounded-2xl bg-white px-5 py-4 font-black text-indigo-950 transition hover:scale-[1.01] disabled:opacity-60">
            {loading ? "Пријављивање..." : "Уђи у квиз"}
          </button>
        </form>
      </div>
    </div>
  );
}

function SubjectCard({ subject, onClick }: { subject: SubjectScore; onClick?: () => void }) {
  const pct = subject.percentage;
  const color = pct === null ? "bg-white/20" : pct >= 60 ? "bg-emerald-400" : "bg-red-400";
  return (
    <div
      className={`card p-4 transition-all ${onClick ? "cursor-pointer hover:scale-[1.02] hover:border-white/25" : ""}`}
      onClick={onClick}
    >
      <p className="text-xs md:text-sm text-blue-200 font-bold">{subject.label}</p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p className="text-2xl md:text-3xl font-black">{pct === null ? "—" : `${pct}%`}</p>
        <p className="text-xs text-blue-300 mb-1">{subject.score}/{subject.total} тачних</p>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/10">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: pct === null ? "0%" : `${pct}%` }} />
      </div>
      {onClick && (
        <p className="mt-2 text-xs text-blue-300 font-bold">Кликни за вежбање овог предмета →</p>
      )}
    </div>
  );
}

function Dashboard({ user }: { user: AuthUser }) {
  const [, navigate] = useLocation();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api<DashboardStats>("/dashboard").then(setStats).catch((err) => setError(err.message));
  }, []);

  const defaultSubjects: SubjectScore[] = [
    { key: "rh",  label: "Рачунарски хардвер",           score: 0, total: 50,  percentage: null },
    { key: "os",  label: "Оперативни системи",            score: 0, total: 101, percentage: null },
    { key: "ors", label: "Одржавање рачунарских система", score: 0, total: 49,  percentage: null },
    { key: "td",  label: "Техничка документација",        score: 0, total: 50,  percentage: null },
  ];

  return (
    <section>
      <div className="mb-6 rounded-[2rem] border border-white/10 bg-white/10 p-6 md:p-8 shadow-xl backdrop-blur">
        <p className="text-blue-200">Добро дошли, {user.fullName}</p>
        <h2 className="mt-2 text-3xl md:text-4xl font-black">Ваш dashboard</h2>
        {error && <p className="mt-4 text-red-200">{error}</p>}
      </div>

      <div className="grid gap-3 grid-cols-3 md:gap-4">
        <Stat title="Покушаји" value={stats?.attemptsCount ?? "—"} />
        <Stat title="Најбољи" value={`${stats?.bestScore ?? 0}%`} />
        <Stat title="Последњи" value={stats?.lastScore == null ? "—" : `${stats.lastScore}%`} />
      </div>

      <div className="mt-4">
        <h3 className="text-sm font-bold text-blue-200 uppercase tracking-widest mb-3">
          Резултати по предмету — кликни на предмет за вежбање
        </h3>
        <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {(stats?.subjectScores ?? defaultSubjects).map((s) => (
            <SubjectCard
              key={s.key}
              subject={s}
              onClick={() => navigate(`/quiz?subject=${s.key}`)}
            />
          ))}
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="card">
          <h3 className="text-xl md:text-2xl font-black">Квиз — сва питања</h3>
          <p className="mt-2 text-sm md:text-base text-blue-100">
            Можете се враћати на претходна питања, али већ одговорена питања остају закључана.
          </p>
          {stats?.canTakeQuiz ? (
            <button className="primary mt-4 md:mt-6 w-full md:w-auto" onClick={() => navigate("/quiz")}>
              Почни квиз (сва питања)
            </button>
          ) : (
            <p className="mt-4 rounded-2xl border border-amber-300/30 bg-amber-400/15 p-4 text-amber-100 text-sm">
              {stats?.lockReason}
            </p>
          )}
        </div>
        <div className="card space-y-3">
          <button className="secondary w-full" onClick={() => navigate("/scoreboard")}>Погледај scoreboard</button>
          {user.role === "admin" && <button className="secondary w-full" onClick={() => navigate("/admin")}>Admin panel</button>}
        </div>
      </div>
    </section>
  );
}

function Stat({ title, value }: { title: string; value: string | number }) {
  return (
    <div className="card p-4 md:p-6">
      <p className="text-xs md:text-sm text-blue-200">{title}</p>
      <p className="mt-2 text-2xl md:text-4xl font-black">{value}</p>
    </div>
  );
}

function SingleUI({ question, shuffleMap, locked, onCommit }: {
  question: Question;
  shuffleMap: Record<number, number[]>;
  locked: string | undefined;
  onCommit: (answer: string) => void;
}) {
  const sm = shuffleMap[question.id] ?? (question.options ?? []).map((_, i) => i);
  const displayOptions = sm.map((origIdx) => (question.options ?? [])[origIdx]);

  return (
    <div className="mt-4 grid gap-1.5 md:gap-3">
      {displayOptions.map((option, si) => {
        const origIdx = sm[si];
        const isSelected = locked !== undefined && Number(locked) === origIdx;
        const isCorrect = origIdx === question.correctAnswer;
        let cls = "answer text-xs md:text-base";
        if (locked !== undefined && isCorrect) cls += " correct";
        if (locked !== undefined && isSelected && !isCorrect) cls += " wrong";
        return (
          <button key={si} className={cls} disabled={locked !== undefined} onClick={() => onCommit(String(origIdx))}>
            {si + 1}. {option}
          </button>
        );
      })}
    </div>
  );
}

function MultiUI({ question, shuffleMap, locked, onCommit, onRegisterConfirm }: {
  question: Question;
  shuffleMap: Record<number, number[]>;
  locked: string | undefined;
  onCommit: (answer: string) => void;
  onRegisterConfirm?: (fn: () => void) => void;
}) {
  const sm = shuffleMap[question.id] ?? (question.options ?? []).map((_, i) => i);
  const displayOptions = sm.map((origIdx) => (question.options ?? [])[origIdx]);
  const [sel, setSel] = useState<Set<number>>(new Set());

  useEffect(() => { setSel(new Set()); }, [question.id]);
  useEffect(() => { onRegisterConfirm?.(commit); }, [sel, question.id]);

  const toggle = (si: number) => {
    if (locked !== undefined) return;
    setSel((prev) => { const next = new Set(prev); next.has(si) ? next.delete(si) : next.add(si); return next; });
  };

  const commit = () => {
    if (sel.size === 0) return;
    const origIndices = [...sel].map((si) => sm[si]).sort((a, b) => a - b).join(",");
    onCommit(origIndices);
  };

  const lockedOrigIndices = locked !== undefined ? locked.split(",").map(Number) : null;

  return (
    <div className="mt-4 grid gap-1.5 md:gap-3">
      <p className="text-xs md:text-sm text-blue-200 -mb-1">Изаберите све тачне одговоре:</p>
      {displayOptions.map((option, si) => {
        const origIdx = sm[si];
        const isSelectedNow = sel.has(si);
        const isLockedSelected = lockedOrigIndices?.includes(origIdx) ?? false;
        const isCorrect = (question.correctAnswers ?? []).includes(origIdx);
        let cls = "answer text-left flex items-start gap-3 text-xs md:text-base";
        if (locked !== undefined && isCorrect) cls += " correct";
        else if (locked !== undefined && isLockedSelected && !isCorrect) cls += " wrong";
        else if (locked === undefined && isSelectedNow) cls += " selected";
        return (
          <button key={si} className={cls} disabled={locked !== undefined} onClick={() => toggle(si)}>
            <span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 ${isSelectedNow || (locked !== undefined && isLockedSelected) ? "border-white bg-white/30" : "border-white/40"}`}>
              {(isSelectedNow || (locked !== undefined && isLockedSelected)) && <span className="block h-2.5 w-2.5 rounded-sm bg-white" />}
            </span>
            {si + 1}. {option}
          </button>
        );
      })}
      {/* Potvrdi is in the bottom bar — no duplicate here */}
    </div>
  );
}

function FillUI({ question, locked, onCommit, onRegisterConfirm }: {
  question: Question;
  locked: string | undefined;
  onCommit: (answer: string) => void;
  onRegisterConfirm?: (fn: () => void) => void;
}) {
  const [text, setText] = useState("");
  useEffect(() => { setText(""); }, [question.id]);
  const commit = () => { if (text.trim()) onCommit(text.trim()); };
  useEffect(() => { onRegisterConfirm?.(commit); }, [text, question.id]);

  return (
    <div className="mt-4">
      {question.hint && <p className="mb-3 text-xs md:text-sm italic text-blue-300">Напомена: {question.hint}</p>}
      <input
        className="input text-sm md:text-xl"
        placeholder="Упишите одговор..."
        value={locked !== undefined ? locked : text}
        disabled={locked !== undefined}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") commit(); }}
      />
      {locked !== undefined && (
        <p className={`mt-3 font-black text-xs md:text-base ${isAnswerCorrect(question, locked) ? "text-emerald-200" : "text-red-200"}`}>
          {isAnswerCorrect(question, locked) ? "Тачно" : `Нетачно — тачан одговор: ${Array.isArray(question.correctText) ? question.correctText.join(", ") : question.correctText}`}
        </p>
      )}
    </div>
  );
}

function MatchUI({ question, locked, onCommit, onRegisterConfirm }: {
  question: Question;
  locked: string | undefined;
  onCommit: (answer: string) => void;
  onRegisterConfirm?: (fn: () => void) => void;
}) {
  const left = question.leftItems ?? [];
  const right = question.rightItems ?? [];
  const [pairs, setPairs] = useState<Record<number, number>>({});
  const [selectedLeft, setSelectedLeft] = useState<number | null>(null);
  useEffect(() => { setPairs({}); setSelectedLeft(null); }, [question.id]);
  useEffect(() => { onRegisterConfirm?.(commit); }, [pairs, question.id]);

  const lockedPairs: Record<number, number> = useMemo(() => {
    if (!locked) return pairs;
    return Object.fromEntries(locked.split(",").map((v, i) => [i, Number(v)]));
  }, [locked, pairs]);

  // FIX: correctPairs može biti number[] ili number[][] (više tačnih kombinacija)
 const cp = question.correctPairs ?? [];
  const allCombos: number[][] = Array.isArray(cp[0])
    ? (cp as number[][])
    : [(cp as number[])];
  // Koristi kombinaciju koja odgovara lockedPairs, ili prvu kao fallback
  const firstCombo: number[] = locked
    ? allCombos.find((combo) =>
        combo.every((v, i) => v === lockedPairs[i])
      ) ?? allCombos[0]
    : allCombos[0];

  const clickLeft = (li: number) => {
    if (locked !== undefined) return;
    if (selectedLeft === li) {
      setSelectedLeft(null);
    } else if (pairs[li] !== undefined && selectedLeft === null) {
      setPairs((prev) => { const next = { ...prev }; delete next[li]; return next; });
      setSelectedLeft(li);
    } else {
      setSelectedLeft(li);
    }
  };

  const clickRight = (ri: number) => {
    if (locked !== undefined || selectedLeft === null) return;
    setPairs((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[Number(key)] === ri) delete next[Number(key)];
      }
      next[selectedLeft] = ri;
      return next;
    });
    setSelectedLeft(null);
  };

  const commit = () => {
    if (Object.keys(pairs).length < left.length) return;
    const answer = left.map((_, i) => pairs[i] ?? -1).join(",");
    onCommit(answer);
  };

  return (
    <div className="mt-4">
      <p className="mb-3 text-xs md:text-sm text-blue-200">Кликните на ставку лево, затим на одговарајућу ставку десно:</p>
      <div className="grid grid-cols-2 gap-2 md:gap-4">
        <div className="grid gap-2">
          {left.map((item, li) => {
            const paired = locked !== undefined ? lockedPairs[li] : pairs[li];
            const isActive = selectedLeft === li;
            const isCorrect = locked !== undefined && firstCombo[li] === lockedPairs[li];
            const isWrong = locked !== undefined && firstCombo[li] !== lockedPairs[li];
            let cls = "answer text-left text-xs md:text-sm cursor-pointer";
            if (isActive) cls += " ring-2 ring-white";
            if (isCorrect) cls += " correct";
            else if (isWrong) cls += " wrong";
            else if (paired !== undefined) cls += " bg-white/20";
            return (
              <button key={li} className={cls} onClick={() => clickLeft(li)} disabled={locked !== undefined}>
                {item}
                {paired !== undefined && <span className="ml-1 opacity-60 text-xs">→ {right[paired]}</span>}
              </button>
            );
          })}
        </div>
        <div className="grid gap-2 content-start">
          {right.map((item, ri) => {
            const usedByLeft = locked !== undefined
              ? Object.entries(lockedPairs).find(([, v]) => v === ri)?.[0]
              : Object.entries(pairs).find(([, v]) => v === ri)?.[0];
            let cls = "answer text-left text-xs md:text-sm cursor-pointer";
            if (locked !== undefined) {
              const li = usedByLeft !== undefined ? Number(usedByLeft) : -1;
              if (li >= 0) {
                const isCorrect = firstCombo[li] === ri;
                cls += isCorrect ? " correct" : " wrong";
              }
            } else if (usedByLeft !== undefined) {
              cls += " bg-white/20";
            }
            return (
              <button key={ri} className={cls} onClick={() => clickRight(ri)} disabled={locked !== undefined || usedByLeft !== undefined}>
                {item}
              </button>
            );
          })}
          {locked !== undefined && (
            <div className="mt-2 text-xs md:text-sm text-blue-200">
              <p className="font-black">Тачни парови:</p>
              {left.map((lItem, li) => (
                <p key={li}>{lItem} → {right[firstCombo[li]]}</p>
              ))}
            </div>
          )}
        </div>
      </div>
      {/* Potvrdi is in the bottom bar */}
    </div>
  );
}

function OrderUI({ question, locked, onCommit, onRegisterConfirm }: {
  question: Question;
  locked: string | undefined;
  onCommit: (answer: string) => void;
  onRegisterConfirm?: (fn: () => void) => void;
}) {
  const items = question.items ?? [];
  const hasSkips = question.hasSkips ?? false;
  const correctRef = question.correctOrder ?? question.correctPairs ?? [];
  const maxPos = hasSkips
    ? correctRef.filter((v) => v !== "X" && Number(v) > 0).length
    : items.length;
  const [positions, setPositions] = useState<Record<number, number>>({});
  useEffect(() => { setPositions({}); }, [question.id]);
  useEffect(() => { onRegisterConfirm?.(commit); }, [positions, question.id]);

  const lockedPositions: Record<number, number> = useMemo(() => {
    if (!locked) return positions;
    return Object.fromEntries(locked.split(",").map((v, i) => [i, Number(v)]));
  }, [locked, positions]);

  const commit = () => {
    const answer = items.map((_, i) => positions[i] ?? 0).join(",");
    onCommit(answer);
  };

  const posOptions = hasSkips
    ? [0, ...Array.from({ length: maxPos }, (_, i) => i + 1)]
    : Array.from({ length: maxPos }, (_, i) => i + 1);

  return (
    <div className="mt-4 grid gap-2 md:gap-3">
      <p className="text-xs md:text-sm text-blue-200 -mb-1">
        {hasSkips ? "Додели редни број (1, 2, 3...) или X (нула) за акције које не треба предузети:" : "Додели редни број свакој ставци (1 = прво):"}
      </p>
      {items.map((item, i) => {
        const pos = locked !== undefined ? lockedPositions[i] : positions[i];
        const correctPos = correctRef[i];
        const isCorrect = locked !== undefined && (
          correctPos === "X" || correctPos === 0 ? pos === 0 : pos === Number(correctPos)
        );
        const isWrong = locked !== undefined && !isCorrect;
        return (
          <div key={i} className={`flex items-center gap-2 md:gap-3 rounded-2xl border p-2 md:p-3 ${isCorrect ? "border-emerald-400/40 bg-emerald-500/15" : isWrong ? "border-red-400/40 bg-red-500/15" : "border-white/10 bg-white/5"}`}>
            <select
              className="rounded-xl border border-white/20 bg-slate-800 px-2 py-1.5 md:px-3 md:py-2 text-white text-xs md:text-sm"
              value={pos ?? ""}
              disabled={locked !== undefined}
              onChange={(e) => setPositions((prev) => ({ ...prev, [i]: Number(e.target.value) }))}
            >
              <option value="">—</option>
              {posOptions.map((v) => (
                <option key={v} value={v}>{v === 0 ? "X" : v}</option>
              ))}
            </select>
            <span className="flex-1 text-xs md:text-sm">{item}</span>
            {isWrong && <span className="text-xs text-red-300">тачно: {correctPos === 0 || correctPos === "X" ? "X" : correctPos}</span>}
          </div>
        );
      })}
      {/* Potvrdi is in the bottom bar */}
    </div>
  );
}

function SlotUI({ question, locked, onCommit, onRegisterConfirm }: {
  question: Question;
  locked: string | undefined;
  onCommit: (answer: string) => void;
  onRegisterConfirm?: (fn: () => void) => void;
}) {
  const slots = question.slots ?? [];
  const options = question.slotOptions ?? [];
  const isMulti = question.slotMulti ?? false;

  const [selections, setSelections] = useState<Record<number, any>>({});
  const [multiSelections, setMultiSelections] = useState<Record<number, Set<number>>>({});
  useEffect(() => { setSelections({}); setMultiSelections({}); }, [question.id]);
  useEffect(() => {
    onRegisterConfirm?.(isMulti ? commitMulti : commitDropdown);
  }, [selections, multiSelections, question.id, isMulti]);

  const lockedSelections: Record<number, any> = useMemo(() => {
    if (!locked || isMulti) return selections;
    return Object.fromEntries(locked.split(",").map((v, i) => [i, v]));
  }, [locked, selections, isMulti]);

  const dropdownAllFilled = slots.every((_, i) => selections[i] !== undefined);
  const commitDropdown = () => onCommit(slots.map((_, i) => selections[i] ?? "").join(","));

  const lockedMultiSlots = locked?.split("|") ?? [];
  const toggleMulti = (slotIdx: number, opt: number) => {
    if (locked !== undefined) return;
    setMultiSelections((prev) => {
      const next = { ...prev };
      const set = new Set(next[slotIdx] ?? []);
      set.has(opt) ? set.delete(opt) : set.add(opt);
      next[slotIdx] = set;
      return next;
    });
  };
  const multiAllFilled = slots.every((_, i) => (multiSelections[i]?.size ?? 0) > 0);
  const commitMulti = () => {
    const answer = slots.map((_, i) =>
      [...(multiSelections[i] ?? [])].sort((a, b) => a - b).join(",")
    ).join("|");
    onCommit(answer);
  };

  const correctAns = question.correctSlotAnswers ?? [];

  if (isMulti) {
    return (
      <div className="mt-4 grid gap-3">
        <p className="text-xs md:text-sm text-blue-200 -mb-1">Означите бројеве за сваки тип:</p>
        {slots.map((slot, i) => {
          const selectedVals = locked !== undefined
            ? new Set(lockedMultiSlots[i]?.split(",").map(Number).filter(Boolean) ?? [])
            : (multiSelections[i] ?? new Set<number>());
          const correctVals = new Set((correctAns[i]?.[0] ?? "").split(",").map(Number).filter(Boolean));
          const isCorrect = locked !== undefined &&
           [...correctVals].every((v) => selectedVals.has(v)) &&
            selectedVals.size === correctVals.size;
          const isWrong = locked !== undefined && !isCorrect;
          return (
            <div key={i} className={`rounded-2xl border p-3 ${isCorrect ? "border-emerald-400/40 bg-emerald-500/15" : isWrong ? "border-red-400/40 bg-red-500/15" : "border-white/10 bg-white/5"}`}>
              <p className="text-xs md:text-sm font-bold text-blue-200 mb-2">{slot}</p>
              <div className="flex flex-wrap gap-2">
                {options.map((opt) => {
                  const isSelected = selectedVals.has(opt);
                  return (
                    <button
                      key={opt}
                      disabled={locked !== undefined}
                      onClick={() => toggleMulti(i, opt)}
                      className={`rounded-xl border px-3 py-1.5 text-xs md:text-sm font-bold transition ${
                        isSelected ? "border-white bg-white/25 text-white" : "border-white/20 bg-white/5 text-blue-200"
                      }`}
                    >
                      {opt}
                    </button>
                  );
                })}
              </div>
              {isWrong && <p className="mt-2 text-xs text-red-300">тачно: {correctAns[i]?.[0]}</p>}
            </div>
          );
        })}
        {/* Potvrdi is in the bottom bar */}
      </div>
    );
  }

  return (
    <div className="mt-4 grid gap-2 md:gap-3">
      <p className="text-xs md:text-sm text-blue-200 -mb-1">Изаберите редни број модула за сваки слот:</p>
      {slots.map((slot, i) => {
        const val = locked !== undefined ? lockedSelections[i] : selections[i];
        // FIX 2: koristi Number(val) da bi poređenje string/number uvek bilo ispravno
        const isCorrect = locked !== undefined && correctAns.some((ca) => Number(ca[i]) === Number(val));
        const isWrong = locked !== undefined && !isCorrect;
        return (
          <div key={i} className={`flex items-center gap-3 rounded-2xl border p-2 md:p-3 ${isCorrect ? "border-emerald-400/40 bg-emerald-500/15" : isWrong ? "border-red-400/40 bg-red-500/15" : "border-white/10 bg-white/5"}`}>
            <span className="w-20 shrink-0 text-xs md:text-sm font-bold text-blue-200">{slot}</span>
            <select
              className="rounded-xl border border-white/20 bg-slate-800 px-2 py-1.5 text-white text-xs md:text-sm"
              value={val ?? ""}
              disabled={locked !== undefined}
              onChange={(e) => setSelections((prev) => ({ ...prev, [i]: e.target.value as any }))}
            >
              <option value="">—</option>
              {options.map((opt) => (
               <option key={opt} value={opt}>{opt === 0 ? "X" : opt}</option>
              ))}
            </select>
            {isWrong && <span className="text-xs text-red-300">тачно: {correctAns[0]?.[i]}</span>}
          </div>
        );
      })}
      {/* Potvrdi is in the bottom bar */}
    </div>
  );
}

function QuizPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const subjectKey = params.get("subject") ?? undefined;
  const subjectLabel = subjectKey ? SUBJECTS.find((s) => s.key === subjectKey)?.label : undefined;

  const [questions, setQuestions] = useState<Question[]>([]);
  const [shuffleMap, setShuffleMap] = useState<Record<number, number[]>>({});
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<number, string>>({});
  const [result, setResult] = useState<{ percentage: number; passed: boolean; score: number; total: number } | null>(null);
  const [error, setError] = useState("");
  const [overlayImg, setOverlayImg] = useState<string | null>(null);
  const confirmRef = useRef<(() => void) | null>(null);

  const answeredCount = Object.keys(answers).length;
  const question = questions[current];

  const loadQuestions = (subject?: string) => {
    const url = subject ? `/questions?subject=${subject}` : "/questions";
    api<Question[]>(url)
      .then((qs) => {
        setQuestions(qs);
        setCurrent(0);
        setAnswers({});
        setResult(null);
        const sm: Record<number, number[]> = {};
        for (const q of qs) {
          if ((q.type === "single" || q.type === "multi") && q.options) {
            sm[q.id] = shuffle(q.options.map((_, i) => i));
          }
        }
        setShuffleMap(sm);
      })
      .catch((err) => setError(err.message));
  };

  useEffect(() => {
    loadQuestions(subjectKey);
  }, [subjectKey]);

  const commit = (answer: string) => {
    if (!question || answers[question.id] !== undefined) return;
    setAnswers((prev) => ({ ...prev, [question.id]: answer }));
  };

  const submit = async () => {
    try {
      const payload = {
        answers: Object.entries(answers).map(([questionId, answer]) => ({
          questionId: Number(questionId),
          answer,
        })),
      };
      const saved = await api<{ percentage: number; passed: boolean; score: number; total: number }>(
        "/attempts",
        { method: "POST", body: JSON.stringify(payload) },
      );
      setResult(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Резултат није сачуван.");
    }
  };

  const restart = () => { loadQuestions(subjectKey); };

  if (result) {
    return (
      <div className="mx-auto max-w-3xl card text-center">
        <p className="text-blue-200">{subjectLabel ? `Квиз — ${subjectLabel}` : "Квиз је завршен"}</p>
        <h2 className="mt-2 text-5xl md:text-6xl font-black">{result.percentage}%</h2>
        <p className="mt-2 text-blue-100 text-sm md:text-base">Тачно {result.score} од {result.total} питања.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <button className="secondary" onClick={() => navigate("/dashboard")}>Dashboard</button>
          <button className="secondary" onClick={() => navigate(`/scoreboard${subjectKey ? `?subject=${subjectKey}` : ""}`)}>
            {subjectLabel ? `Ранглиста — ${subjectLabel}` : "Scoreboard"}
          </button>
          <button className="primary" onClick={restart}>Почни из почетка</button>
        </div>
      </div>
    );
  }

  if (!question) return (
    <div className="card text-center p-8">
      <p className="text-blue-200">Учитавање питања...</p>
      {error && <p className="mt-4 text-red-200">{error}</p>}
    </div>
  );

  const locked = answers[question.id];
  const progress = Math.round((answeredCount / Math.max(questions.length, 1)) * 100);

  return (
    <section className="mx-auto max-w-5xl pb-16">
      {/* Fullscreen image overlay */}
      {overlayImg && (
        <ImageOverlay
          src={overlayImg}
          alt="Слика питања"
          onClose={() => setOverlayImg(null)}
        />
      )}

      {/* Compact top strip: counter + progress bar + action buttons */}
      <div className="mb-1.5 flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-white whitespace-nowrap">
          {current + 1}/{questions.length}
          {subjectLabel && <span className="ml-1 font-normal text-blue-400">— {subjectLabel}</span>}
        </span>
        <div className="flex-1 h-0.5 overflow-hidden rounded-full bg-white/15 mx-1">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-300 to-emerald-300 transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>
        {subjectKey && (
          <button
            className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-blue-300 hover:bg-white/10 transition"
            onClick={() => navigate("/dashboard")}
          >
            Dashboard
          </button>
        )}
        <button
          className="rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] font-bold text-blue-300 hover:bg-white/10 transition"
          onClick={restart}
        >
          ↺
        </button>
      </div>

      {/* Question card — mobile: p-3, desktop: p-6 */}
      <div className="card p-3 md:p-6">
        {/* Meta badges — mobile smaller */}
        <div className="mb-2 flex flex-wrap items-center gap-1.5 md:gap-2">
          <span className="text-[10px] md:text-sm font-black text-blue-200">#{question.id}</span>
          <span className="rounded-full border border-white/15 bg-white/5 px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs text-blue-300">
            {question.type === "single" ? "Један одговор" :
              question.type === "multi" ? "Вишеструки одговори" :
              question.type === "fill" ? "Попунити" :
              question.type === "match" ? "Повезивање" :
              question.type === "slot" ? "Слотови" : "Редослед"}
          </span>
          {question.points != null && (
            <span className="rounded-full border border-yellow-400/30 bg-yellow-400/10 px-1.5 md:px-2 py-0.5 text-[10px] md:text-xs text-yellow-300 font-bold">
              {question.points} {question.points === 1 ? "бод" : "бода"}
            </span>
          )}
        </div>

        {/* Image — mobile: max-h-32 + click to fullscreen; desktop: max-h-80 */}
        {question.imageQuestion && (
          <div className="mb-3">
            <img
              key={question.id}
              src={question.imageQuestion}
              alt={`Питање ${question.id}`}
              className="max-h-32 md:max-h-80 w-full rounded-2xl md:rounded-3xl border border-white/10 object-contain cursor-pointer active:opacity-80 transition"
              onClick={() => setOverlayImg(question.imageQuestion!)}
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
            {/* Mobile-only hint */}
            <p className="mt-1 text-center text-[10px] text-blue-400 md:hidden">👆 Кликни за увећање</p>
          </div>
        )}

        {/* Question text — mobile: text-sm font-bold | desktop: text-2xl font-black */}
        <h3 className="text-sm font-bold leading-snug md:text-2xl md:font-black md:leading-relaxed">
          {question.question}
        </h3>

        {/* Answer UIs */}
        {question.type === "single" && (
          <SingleUI question={question} shuffleMap={shuffleMap} locked={locked} onCommit={commit} />
        )}
        {question.type === "multi" && (
          <MultiUI question={question} shuffleMap={shuffleMap} locked={locked} onCommit={commit} onRegisterConfirm={(fn) => { confirmRef.current = fn; }} />
        )}
        {question.type === "fill" && (
          <FillUI question={question} locked={locked} onCommit={commit} onRegisterConfirm={(fn) => { confirmRef.current = fn; }} />
        )}
        {question.type === "match" && (
          <MatchUI question={question} locked={locked} onCommit={commit} onRegisterConfirm={(fn) => { confirmRef.current = fn; }} />
        )}
        {question.type === "order" && (
          <OrderUI question={question} locked={locked} onCommit={commit} onRegisterConfirm={(fn) => { confirmRef.current = fn; }} />
        )}
        {question.type === "slot" && (
          <SlotUI question={question} locked={locked} onCommit={commit} onRegisterConfirm={(fn) => { confirmRef.current = fn; }} />
        )}

        {/* Explanation — mobile: p-2.5 text-xs rounded-xl */}
        {locked !== undefined && question.type !== "fill" && question.type !== "match" && (
          <div className="mt-3 md:mt-4 rounded-xl md:rounded-2xl border border-white/10 bg-slate-950/35 p-2.5 md:p-4">
            <p className={`font-black text-xs md:text-base ${isAnswerCorrect(question, locked) ? "text-emerald-200" : "text-red-200"}`}>
              {isAnswerCorrect(question, locked) ? "Тачно!" : "Нетачно"}
            </p>
            <p className="mt-1 md:mt-2 text-xs md:text-sm text-blue-50">{question.explanation}</p>
          </div>
        )}
        {locked !== undefined && question.type === "match" && (
          <div className="mt-3 md:mt-4 rounded-xl md:rounded-2xl border border-white/10 bg-slate-950/35 p-2.5 md:p-4">
            <p className="text-xs md:text-sm text-blue-100">{question.explanation}</p>
          </div>
        )}
      </div>

      {/* Error */}
      {error && <p className="mt-4 rounded-2xl bg-red-500/20 p-4 text-red-100 text-sm">{error}</p>}

      {/* ── Fixed bottom navigation bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-slate-950/85 backdrop-blur-xl px-3 py-1.5 md:px-6">
        <div className="mx-auto max-w-5xl flex flex-col gap-1">

          {/* Назад / Потврди / Напред */}
          <div className="flex items-center gap-2">
            <button
              className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-blue-200 hover:bg-white/10 transition disabled:opacity-30"
              disabled={current === 0}
              onClick={() => setCurrent((v) => Math.max(0, v - 1))}
            >
              ← Назад
            </button>

            <button
              className="flex-1 rounded-lg py-1.5 text-xs font-black transition active:scale-95 disabled:opacity-40"
              style={{
                background: locked !== undefined
                  ? "rgba(255,255,255,0.07)"
                  : "linear-gradient(90deg,#0ea5e9,#6366f1)",
                color: locked !== undefined ? "rgba(147,197,253,0.7)" : "white",
                cursor: locked !== undefined ? "default" : "pointer",
              }}
              disabled={locked !== undefined}
              onClick={() => confirmRef.current?.()}
            >
              {locked !== undefined ? `✓ ${answeredCount}/${questions.length} одговорено` : "Потврди одговор"}
            </button>

            {current < questions.length - 1 ? (
              <button
                className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-bold text-blue-200 hover:bg-white/10 transition"
                onClick={() => setCurrent((v) => Math.min(questions.length - 1, v + 1))}
              >
                Напред →
              </button>
            ) : (
              <button
                className="rounded-lg bg-emerald-500/80 border border-emerald-400/30 px-3 py-1.5 text-xs font-black text-white hover:bg-emerald-500 transition"
                onClick={submit}
              >
                Заврши
              </button>
            )}
          </div>

          {/* Progress dots */}
          <div className="flex flex-wrap justify-center gap-0.5">
            {questions.map((item, index) => {
              const ans = answers[item.id];
              const state =
                ans === undefined ? "bg-white/20"
                : isAnswerCorrect(item, ans) ? "bg-emerald-400"
                : "bg-red-400";
              return (
                <button
                  key={item.id}
                  title={`Питање ${index + 1}`}
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
    </section>
  );
}

function Scoreboard({ user }: { user: AuthUser }) {
  const search = useSearch();
  const [, navigate] = useLocation();
  const params = new URLSearchParams(search);
  const subjectKey = params.get("subject") ?? undefined;
  const subjectLabel = subjectKey ? SUBJECTS.find((s) => s.key === subjectKey)?.label : undefined;

  const [rows, setRows] = useState<ScoreboardEntry[]>([]);
  useEffect(() => {
    const url = subjectKey ? `/scoreboard?subject=${subjectKey}` : "/scoreboard";
    api<ScoreboardEntry[]>(url).then(setRows).catch(() => setRows([]));
  }, [subjectKey]);

  const title = user.role === "admin"
    ? (subjectLabel ? `Scoreboard — ${subjectLabel}` : "Scoreboard — сви студенти")
    : (subjectLabel ? `Резултати — ${subjectLabel}` : "Мoji резултати");

  return (
    <div className="card">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <h2 className="text-2xl md:text-3xl font-black">{title}</h2>
        <div className="flex flex-wrap gap-2">
          {subjectKey && (
            <button className="secondary text-sm" onClick={() => navigate("/scoreboard")}>
              Укупни scoreboard
            </button>
          )}
          {SUBJECTS.map((s) => (
            <button
              key={s.key}
              className={`text-sm ${subjectKey === s.key ? "primary" : "secondary"}`}
              onClick={() => navigate(`/scoreboard?subject=${s.key}`)}
            >
              {s.label.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[500px] text-left text-sm md:text-base">
          <thead className="text-blue-200">
            <tr>
              <th>Ранг</th>
              <th>Ime</th>
              <th className="hidden sm:table-cell">Корисник</th>
              <th>{subjectLabel ? "Резултат" : "Најбољи"}</th>
              <th className="hidden sm:table-cell">Последњи</th>
              <th>Покушаји</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.username} className="border-t border-white/10">
                <td className="py-3 font-black">{row.rank}</td>
                <td>{row.fullName}</td>
                <td className="hidden sm:table-cell">{row.username}</td>
                <td>{row.bestScore}%</td>
                <td className="hidden sm:table-cell">{row.lastScore ?? "—"}</td>
                <td>{row.attemptsCount}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="py-8 text-center text-blue-300">Нема резултата</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function AdminPanel() {
  const [tab, setTab] = useState<"users" | "results">("users");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [results, setResults] = useState<AdminResult[]>([]);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<UserInput>(emptyUser);
  const editing = useMemo(() => users.find((u) => u.id === editingId), [users, editingId]);

  const load = async () => {
    setUsers(await api<AdminUser[]>("/admin/users"));
    setResults(await api<AdminResult[]>("/admin/results"));
  };
  useEffect(() => { void load(); }, []);

  const editUser = (user: AdminUser) => {
    setEditingId(user.id);
    setForm({ username: user.username, password: user.password, fullName: user.fullName, role: user.role, active: user.active, neverExpires: user.neverExpires, quizOnce: user.quizOnce });
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (editingId) await api(`/admin/users/${editingId}`, { method: "PUT", body: JSON.stringify(form) });
    else await api("/admin/users", { method: "POST", body: JSON.stringify(form) });
    setForm(emptyUser);
    setEditingId(null);
    await load();
  };
  const remove = async (id: number) => { await api(`/admin/users/${id}`, { method: "DELETE" }); await load(); };

  return (
    <div className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <form onSubmit={save} className="card">
        <h2 className="text-xl md:text-2xl font-black">{editing ? "Измена корисника" : "Нови корисник"}</h2>
        <input className="input" placeholder="Корисничко ime" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
        <input className="input" placeholder="Лозинка" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className="input" placeholder="Пуно ime" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        <select className="input" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserInput["role"] })}>
          <option value="student">student</option>
          <option value="admin">admin</option>
        </select>
        <label className="check"><input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} /> Активан</label>
        <label className="check"><input type="checkbox" checked={form.neverExpires} onChange={(e) => setForm({ ...form, neverExpires: e.target.checked })} /> Не истиче</label>
        <label className="check"><input type="checkbox" checked={form.quizOnce} onChange={(e) => setForm({ ...form, quizOnce: e.target.checked })} /> Само 1x квиз</label>
        <button className="primary mt-4 w-full">Сачувај</button>
        {editingId && <button type="button" className="secondary mt-3 w-full" onClick={() => { setEditingId(null); setForm(emptyUser); }}>Откажи</button>}
      </form>
      <div className="card">
        <div className="mb-5 flex gap-2">
          <button className={tab === "users" ? "primary" : "secondary"} onClick={() => setTab("users")}>Корисници</button>
          <button className={tab === "results" ? "primary" : "secondary"} onClick={() => setTab("results")}>Резултати</button>
        </div>
        {tab === "users" ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="text-blue-200">
                <tr><th>Корисник</th><th>Лозинка</th><th>Ime</th><th>Улога</th><th>Статус</th><th>1x</th><th></th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-t border-white/10">
                    <td className="py-3 font-bold">{u.username}</td>
                    <td>{u.password}</td>
                    <td>{u.fullName}</td>
                    <td>{u.role}</td>
                    <td>{u.active ? "активан" : "неактиван"}</td>
                    <td>{u.quizOnce ? "да" : "не"}</td>
                    <td className="space-x-2">
                      <button className="mini" onClick={() => editUser(u)}>Измени</button>
                      <button className="mini danger" onClick={() => remove(u.id)}>Обриши</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[750px] text-left text-sm">
              <thead className="text-blue-200">
                <tr><th>Корисник</th><th>Ime</th><th>Резултат</th><th>Статус</th><th>Датум</th></tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.id} className="border-t border-white/10">
                    <td className="py-3">{r.username}</td>
                    <td>{r.fullName}</td>
                    <td>{r.percentage}% ({r.score}/{r.total})</td>
                    <td>{r.passed ? "положио" : "пао"}</td>
                    <td>{new Date(r.createdAt).toLocaleString("sr-RS")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Protected({ auth, children }: { auth: ReturnType<typeof useAuth>; children: React.ReactNode }) {
  const [, navigate] = useLocation();
  useEffect(() => { if (!auth.loading && !auth.user) navigate("/login"); }, [auth.loading, auth.user, navigate]);
  if (auth.loading) return <div className="min-h-screen bg-slate-950 p-8 text-white">Учитавање...</div>;
  if (!auth.user) return null;
  return <Shell user={auth.user} onLogout={() => { localStorage.removeItem(TOKEN_KEY); auth.setUser(null); navigate("/login"); }}>{children}</Shell>;
}

function AppRouter() {
  const auth = useAuth();
  return (
    <Switch>
      <Route path="/demo">{() => <DemoPage />}</Route> 
      <Route path="/login">{() => <Login onLogin={auth.setUser} />}</Route>
      <Route path="/">{() => <Protected auth={auth}><Dashboard user={auth.user!} /></Protected>}</Route>
      <Route path="/dashboard">{() => <Protected auth={auth}><Dashboard user={auth.user!} /></Protected>}</Route>
      <Route path="/quiz">{() => <Protected auth={auth}><QuizPage /></Protected>}</Route>
      <Route path="/scoreboard">{() => <Protected auth={auth}><Scoreboard user={auth.user!} /></Protected>}</Route>
      <Route path="/admin">{() => <Protected auth={auth}>{auth.user?.role === "admin" ? <AdminPanel /> : <Dashboard user={auth.user!} />}</Protected>}</Route>
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <AppRouter />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
