"use client";
import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { api } from "@/lib/AuthContext";
import { Navbar } from "@/components/ui/Navbar";
import { Sidebar } from "@/components/Sidebar";
import toast from "react-hot-toast";

interface PodcastTurn {
  speaker: "A" | "B";
  text: string;
  audioUrl?: string;
}

interface Podcast {
  _id: string;
  topic: string;
  voice: string;
  duration: string;
  status: "generating" | "ready" | "failed";
  script: PodcastTurn[];
  createdAt: string;
  error?: string;
}

export default function AIPodcastPlayer() {
  const params = useParams();
  const router = useRouter();
  const audioRef = useRef<HTMLAudioElement>(null);
  const turnRefs = useRef<(HTMLDivElement | null)[]>([]);

  
  
  const [podcast, setPodcast] = useState<Podcast | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTurn, setCurrentTurn] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  useEffect(() => {
    fetchPodcast();
  }, [params.id]);

  useEffect(() => {
  if (turnRefs.current[currentTurn]) {
    turnRefs.current[currentTurn]?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  }
}, [currentTurn]);

  const fetchPodcast = async () => {
    try {
      const { data } = await api.get(`/api/ai-podcast/${params.id}`);
      setPodcast(data);
      
      if (data.status === "generating") {
        setTimeout(fetchPodcast, 3000);
      }
    } catch (error: any) {
      console.error("Failed to fetch podcast:", error);
      toast.error("Failed to load podcast");
    } finally {
      setLoading(false);
    }
  };

  const playTurn = async (index: number) => {
    if (!podcast || podcast.status !== "ready") return;
    
    setCurrentTurn(index);
    setIsPlaying(false);
    
    if (audioRef.current) {
      try {
        audioRef.current.pause();
        
        // Get R2 URL from backend
        const { data } = await api.get(
          `/api/ai-podcast/${params.id}/audio/${index}`
        );
        
        // Use R2 URL directly
        audioRef.current.src = data.audioUrl;
        
        await new Promise(resolve => setTimeout(resolve, 100));
        
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (error: any) {
        console.error('Failed to play audio:', error);
        if (error.name !== 'AbortError') {
          toast.error('Failed to play audio');
        }
        setIsPlaying(false);
      }
    }
  };

  const handleAudioEnded = () => {
    if (podcast && currentTurn < podcast.script.length - 1) {
      playTurn(currentTurn + 1);
    } else {
      setIsPlaying(false);
    }
  };

  const togglePlay = () => {
    if (!audioRef.current || !podcast) return;
    
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      // If no src set yet, load first turn
      if (!audioRef.current.src || audioRef.current.src === window.location.href) {
        playTurn(0);
      } else {
        // Resume current audio
        audioRef.current.play().catch((e) => {
          console.error('Play failed:', e);
          if (e.name !== 'AbortError') {
            toast.error('Failed to play');
          }
        });
        setIsPlaying(true);
      }
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-text-primary font-medium">Loading podcast...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!podcast) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <Navbar />
        <div className="flex flex-1 items-center justify-center">
          <div className="text-center">
            <p className="text-text-primary mb-4">Podcast not found</p>
            <button
              onClick={() => router.push("/ai-podcast")}
              className="px-6 py-3 bg-primary text-white rounded-lg hover:bg-primary/90"
            >
              Back to Podcasts
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="mb-8">
              <button
                onClick={() => router.push("/ai-podcast")}
                className="text-primary hover:text-accent-blue mb-4 flex items-center gap-2"
              >
                ← Back to Podcasts
              </button>
              <h1 className="text-3xl font-extrabold text-text-primary mb-2">
                {podcast.topic}
              </h1>
              <div className="flex items-center gap-4 text-sm text-text-tertiary">
                <span className="capitalize">{podcast.voice} voice</span>
                <span>•</span>
                <span>{podcast.duration}</span>
                <span>•</span>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${
                  podcast.status === "ready" 
                    ? "bg-green-500/20 text-green-400"
                    : podcast.status === "generating"
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-red-500/20 text-red-400"
                }`}>
                  {podcast.status}
                </span>
              </div>
            </div>

            {/* Status Messages */}
            {podcast.status === "generating" && (
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl p-6 mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin" />
                  <div>
                    <p className="text-yellow-400 font-semibold">Generating podcast...</p>
                    <p className="text-yellow-400/70 text-sm">This usually takes 30-60 seconds</p>
                  </div>
                </div>
              </div>
            )}

            {podcast.status === "failed" && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-6 mb-8">
                <p className="text-red-400 font-semibold mb-2">Generation failed</p>
                <p className="text-red-400/70 text-sm">{podcast.error || "Unknown error"}</p>
              </div>
            )}

            {/* Player */}
            {podcast.status === "ready" && (
              <>
                {/* Audio Element */}
                <audio
                  ref={audioRef}
                  onEnded={handleAudioEnded}
                  onPlay={() => setIsPlaying(true)}
                  onPause={() => setIsPlaying(false)}
                />

                {/* Compact Player Bar - Sticky */}
                <div className="sticky top-0 bg-background/95 backdrop-blur-sm border-b border-border py-4 mb-6 z-20">
                  <div className="flex items-center justify-between gap-4">
                    {/* Current Info */}
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${
                        podcast.script[currentTurn]?.speaker === "A"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-purple-500/20 text-purple-400"
                      } ${
                        isPlaying ? "animate-pulse" : ""
                      }`}>
                        {podcast.script[currentTurn]?.speaker}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs text-text-muted">Turn {currentTurn + 1} of {podcast.script.length}</p>
                        <p className="text-sm text-text-primary font-medium truncate">
                          {podcast.script[currentTurn]?.text.substring(0, 60)}...
                        </p>
                      </div>
                    </div>

                    {/* Controls */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => currentTurn > 0 && playTurn(currentTurn - 1)}
                        disabled={currentTurn === 0}
                        className="p-2 rounded-full bg-elevated hover:bg-elevated/80 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <svg className="w-5 h-5 text-text-primary" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M8.445 14.832A1 1 0 0010 14v-2.798l5.445 3.63A1 1 0 0017 14V6a1 1 0 00-1.555-.832L10 8.798V6a1 1 0 00-1.555-.832l-6 4a1 1 0 000 1.664l6 4z" />
                        </svg>
                      </button>

                      <button
                        onClick={togglePlay}
                        className="p-3 rounded-full bg-primary hover:bg-primary/90 transition"
                      >
                        {isPlaying ? (
                          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                          </svg>
                        ) : (
                          <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                          </svg>
                        )}
                      </button>

                      <button
                        onClick={() => currentTurn < podcast.script.length - 1 && playTurn(currentTurn + 1)}
                        disabled={currentTurn === podcast.script.length - 1}
                        className="p-2 rounded-full bg-elevated hover:bg-elevated/80 disabled:opacity-50 disabled:cursor-not-allowed transition"
                      >
                        <svg className="w-5 h-5 text-text-primary" fill="currentColor" viewBox="0 0 20 20">
                          <path d="M4.555 5.168A1 1 0 003 6v8a1 1 0 001.555.832L10 11.202V14a1 1 0 001.555.832l6-4a1 1 0 000-1.664l-6-4A1 1 0 0010 6v2.798l-5.445-3.63z" />
                        </svg>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Transcript - Full Width */}
                <div className="space-y-4">
                  {podcast.script.map((turn, index) => (
                    <div
                      key={index}
                      ref={(el) => { turnRefs.current[index] = el; }}
                      onClick={() => playTurn(index)}
                      className={`bg-surface border rounded-xl p-6 cursor-pointer transition ${
                        currentTurn === index
                          ? "border-primary shadow-lg ring-2 ring-primary/50 scale-[1.01]"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center font-bold transition ${
                          turn.speaker === "A"
                            ? "bg-blue-500/20 text-blue-400"
                            : "bg-purple-500/20 text-purple-400"
                        } ${
                          currentTurn === index && isPlaying
                            ? "animate-pulse"
                            : ""
                        }`}>
                          {turn.speaker}
                        </div>
                        <div className="flex-1">
                          {currentTurn === index && (
                            <div className="flex items-center gap-2 mb-3">
                              <div className="w-2 h-2 bg-primary rounded-full animate-pulse"></div>
                              <span className="text-xs font-semibold text-primary uppercase tracking-wider">Now Playing</span>
                            </div>
                          )}
                          <p className={`leading-relaxed ${
                            currentTurn === index
                              ? "text-text-primary text-lg font-medium"
                              : "text-text-secondary"
                          }`}>
                            {turn.text}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
