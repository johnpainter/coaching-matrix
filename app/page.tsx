"use client";

export const dynamic = "force-dynamic";

import { useEffect, useRef, useState, useCallback } from "react";
import { supabase, type Placement } from "@/lib/supabase";

type AppPhase = "name_entry" | "placement" | "submitted" | "revealed";

// Preset dot colors for other participants (own dot is always white-bordered)
const DOT_COLORS = [
  "#F97316", // orange
  "#A855F7", // purple
  "#EC4899", // pink
  "#06B6D4", // cyan
  "#84CC16", // lime
  "#F59E0B", // amber
  "#14B8A6", // teal
  "#6366F1", // indigo
  "#EF4444", // red
  "#22C55E", // green
];

function truncate(s: string, max = 12) {
  return s.length > max ? s.slice(0, max) + "…" : s;
}

export default function CoachingMatrix() {
  const [phase, setPhase] = useState<AppPhase>("name_entry");
  const [nameInput, setNameInput] = useState("");
  const [myName, setMyName] = useState("");
  const [preview, setPreview] = useState<{ x: number; y: number } | null>(null);
  const [myPlacement, setMyPlacement] = useState<{ x: number; y: number } | null>(null);
  const [allPlacements, setAllPlacements] = useState<Placement[]>([]);
  const [revealed, setRevealed] = useState(false);
  const matrixRef = useRef<HTMLDivElement>(null);

  // Restore from localStorage on mount
  useEffect(() => {
    const savedName = localStorage.getItem("coaching_matrix_name");
    const savedSubmitted = localStorage.getItem("coaching_matrix_submitted");
    if (savedName) {
      setMyName(savedName);
      if (savedSubmitted === "true") {
        setPhase("submitted");
      } else {
        setPhase("placement");
      }
    }
  }, []);

  // Fetch initial data and set up real-time subscriptions
  useEffect(() => {
    let placementsChannel: ReturnType<typeof supabase.channel> | null = null;
    let appStateChannel: ReturnType<typeof supabase.channel> | null = null;

    async function init() {
      // Fetch current placements
      const { data: placementsData } = await supabase
        .from("placements")
        .select("*");
      if (placementsData) setAllPlacements(placementsData as Placement[]);

      // Fetch current app state
      const { data: stateData } = await supabase
        .from("app_state")
        .select("*")
        .eq("id", 1)
        .single();
      if (stateData?.revealed) {
        setRevealed(true);
        setPhase("revealed");
      }

      // Subscribe to placements changes
      placementsChannel = supabase
        .channel("placements-changes")
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "placements" },
          (payload) => {
            if (payload.eventType === "INSERT" || payload.eventType === "UPDATE") {
              setAllPlacements((prev) => {
                const filtered = prev.filter(
                  (p) => p.name !== (payload.new as Placement).name
                );
                return [...filtered, payload.new as Placement];
              });
            } else if (payload.eventType === "DELETE") {
              setAllPlacements((prev) =>
                prev.filter((p) => p.id !== (payload.old as Placement).id)
              );
            }
          }
        )
        .subscribe();

      // Subscribe to app_state changes
      appStateChannel = supabase
        .channel("app-state-changes")
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "app_state" },
          (payload) => {
            if (payload.new && (payload.new as { revealed: boolean }).revealed) {
              setRevealed(true);
              setPhase("revealed");
            } else if (payload.new && !(payload.new as { revealed: boolean }).revealed) {
              setRevealed(false);
            }
          }
        )
        .subscribe();
    }

    init();

    return () => {
      if (placementsChannel) supabase.removeChannel(placementsChannel);
      if (appStateChannel) supabase.removeChannel(appStateChannel);
    };
  }, []);

  // When revealed state changes, also update phase
  useEffect(() => {
    if (revealed) {
      setPhase("revealed");
    } else if (myName) {
      const savedSubmitted = localStorage.getItem("coaching_matrix_submitted");
      if (savedSubmitted === "true") {
        setPhase("submitted");
      } else if (myPlacement) {
        setPhase("submitted");
      } else {
        setPhase("placement");
      }
    }
  }, [revealed, myName, myPlacement]);

  const handleNameSubmit = useCallback(() => {
    const trimmed = nameInput.trim();
    if (!trimmed) return;
    setMyName(trimmed);
    localStorage.setItem("coaching_matrix_name", trimmed);
    localStorage.removeItem("coaching_matrix_submitted");
    setPhase("placement");
  }, [nameInput]);

  const getMatrixCoords = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const rect = matrixRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      return { x, y };
    },
    []
  );

  const handleMatrixPointer = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (phase !== "placement") return;
      const coords = getMatrixCoords(e);
      if (coords) setPreview(coords);
    },
    [phase, getMatrixCoords]
  );

  const handleMatrixClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (phase !== "placement") return;
      const rect = matrixRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
      setPreview({ x, y });
    },
    [phase]
  );

  const handleSubmit = useCallback(async () => {
    if (!preview || !myName) return;
    const { error } = await supabase.from("placements").upsert(
      { name: myName, x: preview.x, y: preview.y },
      { onConflict: "name" }
    );
    if (!error) {
      setMyPlacement(preview);
      localStorage.setItem("coaching_matrix_submitted", "true");
      setPhase("submitted");
    }
  }, [preview, myName]);

  const handleRevealAll = useCallback(async () => {
    await supabase
      .from("app_state")
      .update({ revealed: true })
      .eq("id", 1);
  }, []);

  const handleReset = useCallback(async () => {
    await supabase.from("placements").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await supabase
      .from("app_state")
      .update({ revealed: false })
      .eq("id", 1);
    // Reset local state
    setAllPlacements([]);
    setMyPlacement(null);
    setPreview(null);
    setRevealed(false);
    localStorage.removeItem("coaching_matrix_submitted");
    if (myName) {
      setPhase("placement");
    }
  }, [myName]);

  // Assign stable colors to other participants
  const otherPlacements = allPlacements.filter((p) => p.name !== myName);
  const colorMap = new Map<string, string>();
  otherPlacements.forEach((p, i) => {
    colorMap.set(p.name, DOT_COLORS[i % DOT_COLORS.length]);
  });

  // Dot to show for own placement on matrix
  const myDotCoords =
    phase === "placement"
      ? preview
      : phase === "submitted" || phase === "revealed"
      ? myPlacement ?? allPlacements.find((p) => p.name === myName)
      : null;

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

  return (
    <div className="flex flex-col items-center justify-start min-h-screen gap-5 px-4 py-8">
      <h1 className="text-2xl font-bold tracking-tight">Coaching Matrix</h1>

      {/* Status banner */}
      {phase === "submitted" && (
        <div className="text-yellow-400 font-medium animate-pulse">
          Waiting for reveal…
        </div>
      )}
      {phase === "placement" && (
        <div className="text-gray-400 text-sm">
          Click anywhere on the matrix to place your dot, then submit.
        </div>
      )}
      {phase === "revealed" && (
        <div className="text-green-400 font-medium">Results revealed!</div>
      )}

      {/* Matrix */}
      <div
        className="relative select-none"
        style={{
          width: "min(80vw, 80vh, 600px)",
          height: "min(80vw, 80vh, 600px)",
          maxWidth: 600,
          maxHeight: 600,
        }}
      >
        {/* Quadrant grid */}
        <div
          ref={matrixRef}
          className="absolute inset-0 grid grid-cols-2 grid-rows-2 gap-0.5 bg-white cursor-crosshair"
          onPointerMove={handleMatrixPointer}
          onClick={handleMatrixClick}
        >
          {/* Top-left: Yellow */}
          <div style={{ backgroundColor: "#FFD700" }} />
          {/* Top-right: Green */}
          <div style={{ backgroundColor: "#22C55E" }} />
          {/* Bottom-left: Red */}
          <div style={{ backgroundColor: "#EF4444" }} />
          {/* Bottom-right: Blue */}
          <div style={{ backgroundColor: "#3B82F6" }} />
        </div>

        {/* Own dot */}
        {myDotCoords && (
          <div
            className="absolute pointer-events-none flex flex-col items-center"
            style={{
              left: `${myDotCoords.x * 100}%`,
              top: `${myDotCoords.y * 100}%`,
              transform: "translate(-50%, -50%)",
              zIndex: 20,
            }}
          >
            <div
              className="w-5 h-5 rounded-full border-2 border-white shadow-lg"
              style={{ backgroundColor: "#1e293b" }}
            />
            <span
              className="mt-1 text-xs font-bold text-white drop-shadow-md leading-none"
              style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
            >
              {truncate(myName)}
            </span>
          </div>
        )}

        {/* Other dots (only when revealed) */}
        {phase === "revealed" &&
          otherPlacements.map((p) => (
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
                className="w-5 h-5 rounded-full border-2 border-white shadow-lg"
                style={{ backgroundColor: colorMap.get(p.name) }}
              />
              <span
                className="mt-1 text-xs font-bold text-white drop-shadow-md leading-none"
                style={{ textShadow: "0 1px 3px rgba(0,0,0,0.8)" }}
              >
                {truncate(p.name)}
              </span>
            </div>
          ))}
      </div>

      {/* Participant count */}
      <p className="text-gray-500 text-sm">
        {allPlacements.length} participant{allPlacements.length !== 1 ? "s" : ""} submitted
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
          onClick={handleRevealAll}
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

      {/* Legend (visible when revealed) */}
      {phase === "revealed" && allPlacements.length > 0 && (
        <div className="flex flex-wrap gap-3 justify-center mt-2 max-w-lg">
          {allPlacements.map((p, i) => {
            const isMe = p.name === myName;
            const color = isMe ? "#1e293b" : DOT_COLORS[otherPlacements.findIndex(op => op.name === p.name) % DOT_COLORS.length];
            return (
              <div key={p.name} className="flex items-center gap-1.5">
                <div
                  className="w-3 h-3 rounded-full border border-white"
                  style={{ backgroundColor: color }}
                />
                <span className="text-xs text-gray-300">
                  {truncate(p.name)}{isMe ? " (you)" : ""}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
