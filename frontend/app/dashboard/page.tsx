"use client";
import { Sidebar } from "@/components/Sidebar";
import { Navbar } from "@/components/ui/Navbar";
import { useEffect, useState } from "react";
import { useAuth, api } from "@/lib/AuthContext";
import type { AxiosError } from "axios";
import { io, Socket } from "socket.io-client";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";
import toast from "react-hot-toast";

interface Stream {
  id: string;
  _id: string;
  title: string;
  category?: string;
  isLive: boolean;
  status: string;
  createdAt: string;
  thumbnail?: string;
  userId?: { _id: string; username: string; avatar?: string };
  stats?: {
    viewers: number;
    peakViewers: number;
    duration: number;
    chatMessages: number;
  };
  streamer?: { username: string };
}

const getCategoryColor = (category?: string) => {
  const colors: Record<string, string> = {
    gaming: "bg-purple-500/20 text-purple-300 border-purple-500/30",
    music: "bg-pink-500/20 text-pink-300 border-pink-500/30",
    art: "bg-blue-500/20 text-blue-300 border-blue-500/30",
    technology: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
    education: "bg-green-500/20 text-green-300 border-green-500/30",
    entertainment: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",
    sports: "bg-orange-500/20 text-orange-300 border-orange-500/30",
    general: "bg-gray-500/20 text-gray-300 border-gray-500/30",
  };
  return colors[category?.toLowerCase() ?? ""] || colors.general;
};

const formatDuration = (ms: number) => {
  if (!ms) return "—";
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
};

const Dashboard = () => {
  const [viewerCounts, setViewerCounts] = useState<Record<string, number>>({});
  const [socket, setSocket] = useState<Socket | null>(null);
  const [activeAIStreamer, setActiveAIStreamer] = useState<{ streamerId: string; streamId: string } | null>(null);
  const [stoppingAI, setStoppingAI] = useState(false);
  const { user, getSocketAuth } = useAuth();
  const router = useRouter();
  const socketInitialized = useRef(false);

  const {
    data: streamsData,
    isLoading: loading,
    error: streamsError,
    refetch: refetchStreams,
  } = useQuery<Stream[]>({
    queryKey: ["dashboard-streams"],
    queryFn: () =>
      api
        .get(`/api/streams?status=pending`)
        .then((res) => res.data.streams || []),
    retry: (failureCount, error) =>
      (error as AxiosError)?.response?.status === 429
        ? false
        : failureCount < 1,
  });

  const { data: stats } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      try {
        const res = await api.get(`/api/auth/me/stats`);
        return res.data.stats || {};
      } catch (error) {
        console.error("[DASHBOARD] Failed to load stats:", error);
        return {};
      }
    },
  });

  useEffect(() => {
    const stored = localStorage.getItem("activeAIStreamer");
    if (stored) {
      try { setActiveAIStreamer(JSON.parse(stored)); } catch {}
    }
  }, []);

  const stopAIStreamer = async () => {
    if (!activeAIStreamer) return;
    setStoppingAI(true);
    try {
      await api.post(`/api/ai-streamer/${activeAIStreamer.streamerId}/stop`);
      localStorage.removeItem("activeAIStreamer");
      setActiveAIStreamer(null);
      toast.success("AI Streamer stopped");
    } catch (err: any) {
      if (err.response?.status === 404 || err.response?.status === 403) {
        localStorage.removeItem("activeAIStreamer");
        setActiveAIStreamer(null);
      } else {
        toast.error("Failed to stop AI streamer");
      }
    } finally {
      setStoppingAI(false);
    }
  };

  const streams = streamsData || [];
  const error = streamsError
    ? (streamsError as AxiosError)?.response?.status === 429
      ? "Too many requests — please wait a moment and retry."
      : "Failed to load streams"
    : null;

  useEffect(() => {
    if (socketInitialized.current) {
      console.log("[DASHBOARD] Socket already initialized, skipping");
      return;
    }

    // Only initialize socket when user is authenticated
    if (!user) {
      console.log("[DASHBOARD] User not loaded yet, waiting...");
      return;
    }

    socketInitialized.current = true;
    const authData = getSocketAuth();

    console.log("[DASHBOARD] Initializing socket with auth:", !!authData.token);

    const newSocket = io(
      process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001",
      {
        transports: ["websocket", "polling"],
        auth: authData,
      },
    );

    newSocket.on(
      "viewer-count",
      ({ streamId, count }: { streamId: string; count: number }) => {
        setViewerCounts((prev) => ({ ...prev, [streamId]: count }));
      },
    );

    newSocket.on("notification", (notification: { type: string }) => {
      if (notification.type === "stream-live") refetchStreams();
    });

    setSocket(newSocket);
    return () => {
      newSocket.close();
    };
  }, [user, getSocketAuth]);

  useEffect(() => {
    if (socket && streams.length > 0) {
      streams.forEach((stream: Stream) => {
        if (stream.isLive)
          socket.emit("subscribe-viewer-count", { streamId: stream.id });
      });
    }
  }, [socket, streams]);

  const statCards = [
    {
      label: "Total Streams",
      value: stats?.totalStreams ?? "—",
      color: "text-emerald-400",
    },
    {
      label: "Total Views",
      value: stats?.totalViews ?? "—",
      color: "text-blue-400",
    },
    {
      label: "Time Streamed",
      value: stats ? formatDuration(stats.totalStreamTime) : "—",
      color: "text-purple-400",
    },
    {
      label: "Chat Messages",
      value: stats?.totalChatMessages ?? "—",
      color: "text-pink-400",
    },
  ];

  return (
    <div className="flex flex-col h-screen bg-background">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
            {/* Header */}
            <div>
              <h1 className="text-3xl font-extrabold text-text-primary mb-1">
                Welcome back, {user?.username || "User"}!
              </h1>
              <p className="text-text-tertiary">
                Here's how your channel is doing
              </p>
            </div>

            {/* Stats cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {statCards.map((s) => (
                <div
                  key={s.label}
                  className="bg-surface border border-border rounded-xl p-5 card-hover"
                >
                  <div className={`text-2xl font-extrabold mb-1 ${s.color}`}>
                    {s.value}
                  </div>
                  <div className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            {/* Active AI Streamer */}
            {activeAIStreamer && (
              <div className="bg-surface border border-primary/30 rounded-xl p-5 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center text-xl">🤖</div>
                  <div>
                    <p className="font-semibold text-text-primary">AI Streamer is live</p>
                    <button
                      onClick={() => router.push(`/watch/${activeAIStreamer.streamId}`)}
                      className="text-xs text-primary hover:underline"
                    >
                      Watch stream →
                    </button>
                  </div>
                </div>
                <button
                  onClick={stopAIStreamer}
                  disabled={stoppingAI}
                  className="px-4 py-2 bg-accent-red hover:bg-accent-red/80 text-white rounded-lg font-semibold text-sm transition disabled:opacity-50"
                >
                  {stoppingAI ? "Stopping..." : "Stop AI"}
                </button>
              </div>
            )}

            {/* Live / Pending streams */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-text-primary">
                  Your Streams
                </h2>
                <a
                  href="/browse"
                  className="text-primary hover:text-accent-blue text-sm font-semibold transition"
                >
                  Browse all →
                </a>
              </div>
              {error ? (
                <div className="text-center py-10">
                  <p className="text-accent-red">{error}</p>
                  <button
                    onClick={() => refetchStreams()}
                    className="mt-3 px-4 py-2 btn-primary rounded-lg text-sm"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {loading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div
                        key={i}
                        className="bg-surface rounded-xl border border-border overflow-hidden"
                      >
                        <div className="aspect-video shimmer" />
                        <div className="p-4 space-y-3">
                          <div className="h-4 rounded w-3/4 shimmer" />
                          <div className="h-3 rounded w-1/2 shimmer" />
                        </div>
                      </div>
                    ))
                  ) : streams.length > 0 ? (
                    streams.map((stream: Stream) => {
                      const isMyStream =
                        stream.userId === user?.id ||
                        stream.userId?._id === user?.id ||
                        stream.userId?.toString() === user?.id;
                      return (
                        <div
                          key={stream._id}
                          onClick={() =>
                            router.push(
                              isMyStream
                                ? `/stream/${stream.id}`
                                : `/watch/${stream.id}`,
                            )
                          }
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ")
                              router.push(
                                isMyStream
                                  ? `/stream/${stream.id}`
                                  : `/watch/${stream.id}`,
                              );
                          }}
                          role="button"
                          tabIndex={0}
                          className="bg-surface rounded-xl border-2 border-primary/30 overflow-hidden card-hover cursor-pointer"
                        >
                          <div className="aspect-video bg-elevated relative">
                            {stream.thumbnail ? (
                              <>
                                <img
                                  src={stream.thumbnail}
                                  alt={stream.title}
                                  className="w-full h-full object-cover"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                              </>
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-text-muted text-sm">
                                No Preview
                              </div>
                            )}
                            {stream.isLive ? (
                              <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-accent-red px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white live-glow">
                                <span className="h-1.5 w-1.5 rounded-full bg-white live-dot" />
                                LIVE
                              </span>
                            ) : (
                              <span className="absolute top-3 left-3 bg-yellow-600/90 backdrop-blur-md text-white px-2.5 py-1 text-[10px] rounded-full font-bold uppercase tracking-wider">
                                PENDING
                              </span>
                            )}
                          </div>
                          <div className="p-3">
                            <h3 className="font-semibold truncate text-sm text-text-primary">
                              {stream.title}
                            </h3>
                            <p className="text-xs text-text-tertiary mt-0.5">
                              by {stream.streamer?.username || "Unknown"}
                            </p>
                            <div className="flex items-center justify-between mt-1.5">
                              <p className="text-xs text-text-muted">
                                {stream.isLive
                                  ? `${viewerCounts[stream.id] ?? stream.stats?.viewers ?? 0} watching`
                                  : "Ready to start"}
                              </p>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded-full capitalize border font-semibold ${getCategoryColor(stream.category)}`}
                              >
                                {stream.category}
                              </span>
                            </div>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="col-span-full bg-surface border-2 border-dashed border-border rounded-xl py-14 flex flex-col items-center gap-3 text-center">
                      <svg
                        className="w-12 h-12 text-text-muted"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1.5}
                          d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                      <p className="text-text-secondary font-medium">
                        No streams yet
                      </p>
                      <p className="text-text-muted text-sm">
                        Click "Go Live" in the navbar to create your first
                        stream
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
};

export default Dashboard;
