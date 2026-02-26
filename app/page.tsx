"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState } from "react";
import { supabase, type Placement } from "@/lib/supabase";

const DOT_COLORS = [
  "#F97316", "#A855F7", "#EC4899", "#06B6D4",
  "#84CC16", "#F59E0B", "#14B8A6", "#6366F1",
  "#EF4444", "#22C55E",
];

function truncate(s: string, max = 12) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export default function CoachingMatrix() {
  const [name, setName] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [revealed, setRevealed] = useState(false);

  const matrixRef = useRef<HTMLDivElement>(null);
  // Written during render so event handlers always read the latest value
  const canPlaceRef = useRef(false);

  // Phase is purely derived — no setState("phase") anywhere
  const phase = !name
    ? "name_entry"
    : revealed
    ? "revealed"
    : submitted
    ? "submitted"
    : "placement";

  // Keep canPlaceRef current every render (no stale closure in pointer handlers)
  canPlaceRef.current = phase === "placement";

  // Restore name from localStorage (submitted state comes from DB, not localStorage)
  useEffect(() => {
    const saved = localStorage.getItem("cm_name");
    if (saved) setName(saved);
  }, []);

  // Supabase: initial fetch + real-time subscriptions
  useEffect(() => {
    let pc: ReturnType<typeof supabase.channel> | null = null;
    let ac: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      const [{ data: ps }, { data: as }] = await Promise.all([
        supabase.from("placements").select("*"),
        supabase.from("app_state").select("*").eq("id", 1).single(),
      ]);

      if (ps) setPlacements(ps as Placement[]);
      if (as?.revealed) setRevealed(true);

      // Restore submitted state: if user's placement exists in DB, they already submitted
      const savedName = localStorage.getItem("cm_name");
      if (savedName && ps) {
        const found = (ps as Placement[]).some((p) => p.name === savedName);
        if (found) setSubmitted(true);
      }

      pc = supabase
        .channel("placements-rt")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "placements" },
          (payload) => {
            if (
              payload.eventType === "INSERT" ||
              payload.eventType === "UPDATE"
            ) {
              const incoming = payload.new as Placement;
              setPlacements((prev) => [
                ...prev.filter((p) => p.name !== incoming.name),
                incoming,
              ]);
            } else if (payload.eventType === "DELETE") {
              const deleted = payload.old as Placement;
              setPlacements((prev) => prev.filter((p) => p.id !== deleted.id));
              // If our own placement was deleted (session reset), go back to placement
              const myName = localStorage.getItem("cm_name");
              if (myName && deleted.name === myName) {
                setSubmitted(false);
                setPreview(null);
              }
            }
          }
        )
        .subscribe();

      ac = supabase
        .channel("appstate-rt")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "app_state" },
          (payload) => {
            const rev = (payload.new as { revealed: boolean }).revealed;
            setRevealed(rev);
            // If reset (revealed → false), clear submitted so users can re-place
            if (!rev) {
              setSubmitted(false);
              setPreview(null);
            }
          }
        )
        .subscribe();
    }

    init();
    return () => {
      if (pc) supabase.removeChannel(pc);
      if (ac) supabase.removeChannel(ac);
    };
  }, []);

  function getCoords(e: React.PointerEvent<HTMLDivElement>) {
    const rect = matrixRef.current?.getBoundingClientRect();
    if (!rect) return null;
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!canPlaceRef.current) return;
    const coords = getCoords(e);
    if (coords) setPreview(coords);
  }


  async function handleSubmit() {
    if (!preview || !name) return;
    const { error } = await supabase
      .from("placements")
      .upsert({ name, x: preview.x, y: preview.y }, { onConflict: "name" });
    if (!error) setSubmitted(true);
  }

  async function handleReveal() {
    await supabase.from("app_state").update({ revealed: true }).eq("id", 1);
  }

  async function handleReset() {
    await Promise.all([
      supabase
        .from("placements")
        .delete()
        .neq("id", "00000000-0000-0000-0000-000000000000"),
      supabase.from("app_state").update({ revealed: false }).eq("id", 1),
    ]);
    setPlacements([]);
    setPreview(null);
    setSubmitted(false);
    setRevealed(false);
  }

  function handleNameSubmit() {
    const n = nameInput.trim();
    if (!n) return;
    localStorage.setItem("cm_name", n);
    setName(n);
    setPreview(null);
    setSubmitted(false);
  }

  const myPlacement = placements.find((p) => p.name === name);
  const others = placements.filter((p) => p.name !== name);
  const myDot = phase === "placement" ? preview : (myPlacement ?? null);

  // ── Name entry screen ──────────────────────────────────────────────────────
  if (phase === "name_entry") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-6 px-4">
        <h1 className="text-3xl font-bold tracking-tight">Coaching Matrix</h1>
        <p className="text-gray-400 text-center max-w-sm">
          Enter your name to place yourself on the matrix.
        </p>
        <div className="flex flex-col gap-3 w-full max-w-xs">
          <input
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNameSubmit()}
            placeholder="Your name"
            maxLength={40}
            autoFocus
            className="px-4 py-3 rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 text-lg"
          />
          <button
            onClick={handleNameSubmit}
            disabled={!nameInput.trim()}
            className="px-6 py-3 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold text-lg transition-colors"
          >
            Enter
          </button>
        </div>
      </div>
    );
  }

  // ── Matrix screen ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col items-center min-h-screen gap-5 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Coaching Matrix</h1>

      {phase === "placement" && (
        <p className="text-gray-400 text-sm">
          {preview
            ? "Click to move your dot · then Submit"
            : "Click anywhere on the matrix to place your dot"}
        </p>
      )}
      {phase === "submitted" && (
        <p className="text-yellow-400 font-medium animate-pulse">
          Waiting for reveal…
        </p>
      )}
      {phase === "revealed" && (
        <p className="text-green-400 font-medium">Results revealed!</p>
      )}

      {/* Matrix container */}
      <div
        className="relative select-none"
        style={{
          width: "min(80vw, 600px)",
          height: "min(80vw, 600px)",
          maxWidth: 600,
          maxHeight: 600,
        }}
      >
        {/* Quadrant grid — event target */}
        <div
          ref={matrixRef}
          className="absolute inset-0 grid grid-cols-2 grid-rows-2 bg-white"
          style={{
            gap: "2px",
            touchAction: "none",
            cursor: phase === "placement" ? "crosshair" : "default",
          }}
          onPointerDown={handlePointerDown}
        >
          <div style={{ background: "#FFD700" }} />
          <div style={{ background: "#22C55E" }} />
          <div style={{ background: "#EF4444" }} />
          <div style={{ background: "#3B82F6" }} />
        </div>

        {/* My dot */}
        {myDot && (
          <div
            className="absolute pointer-events-none flex flex-col items-center"
            style={{
              left: `${myDot.x * 100}%`,
              top: `${myDot.y * 100}%`,
              transform: "translate(-50%, -50%)",
              zIndex: 20,
            }}
          >
            <div className="w-6 h-6 rounded-full bg-white border-[3px] border-gray-900 shadow-xl" />
            <span
              className="mt-0.5 text-xs font-bold text-white"
              style={{ textShadow: "0 0 4px #000, 0 1px 3px #000" }}
            >
              {truncate(name ?? "")}
            </span>
          </div>
        )}

        {/* Other dots — only when revealed */}
        {phase === "revealed" &&
          others.map((p, i) => (
            <div
              key={p.name}
              className="absolute pointer-events-none flex flex-col items-center"
              style={{
                left: `${p.x * 100}%`,
                top: `${p.y * 100}%`,
                transform: "translate(-50%, -50%)",
                zIndex: 10,
              }}
            >
              <div
                className="w-6 h-6 rounded-full border-2 border-white shadow-xl"
                style={{ background: DOT_COLORS[i % DOT_COLORS.length] }}
              />
              <span
                className="mt-0.5 text-xs font-bold text-white"
                style={{ textShadow: "0 0 4px #000, 0 1px 3px #000" }}
              >
                {truncate(p.name)}
              </span>
            </div>
          ))}
      </div>

      <p className="text-gray-500 text-sm">
        {placements.length} participant{placements.length !== 1 ? "s" : ""}{" "}
        submitted
      </p>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 justify-center">
        {phase === "placement" && (
          <button
            onClick={handleSubmit}
            disabled={!preview}
            className="px-6 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed font-semibold transition-colors"
          >
            Submit My Placement
          </button>
        )}
        <button
          onClick={handleReveal}
          className="px-6 py-2.5 rounded-lg bg-green-700 hover:bg-green-600 font-semibold transition-colors"
        >
          Reveal All
        </button>
        <button
          onClick={handleReset}
          className="px-6 py-2.5 rounded-lg bg-gray-700 hover:bg-gray-600 font-semibold transition-colors"
        >
          Reset Session
        </button>
      </div>

      {/* Legend — revealed only */}
      {phase === "revealed" && placements.length > 0 && (
        <div className="flex flex-wrap gap-3 justify-center mt-2 max-w-lg">
          {placements.map((p) => {
            const isMe = p.name === name;
            const otherIdx = others.findIndex((o) => o.name === p.name);
            const color = isMe
              ? "#ffffff"
              : DOT_COLORS[otherIdx % DOT_COLORS.length];
            return (
              <div key={p.name} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full border border-gray-500"
                  style={{ background: color }}
                />
                <span className="text-xs text-gray-300">
                  {truncate(p.name)}
                  {isMe ? " (you)" : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
