"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/AuthContext";
import { Navbar } from "@/components/ui/Navbar";
import { Sidebar } from "@/components/Sidebar";
import toast from "react-hot-toast";

interface Podcast {
  _id: string;
  topic: string;
  voice: string;
  duration: string;
  status: "generating" | "ready" | "failed";
  createdAt: string;
}

export default function AIPodcastList() {
  const router = useRouter();
  const [podcasts, setPodcasts] = useState<Podcast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchPodcasts();
  }, []);

  const fetchPodcasts = async () => {
    try {
      const { data } = await api.get("/api/ai-podcast");
      setPodcasts(data.podcasts);
    } catch (error: any) {
      console.error("Failed to fetch podcasts:", error);
      toast.error("Failed to load podcasts");
    } finally {
      setLoading(false);
    }
  };

  const deletePodcast = async (id: string) => {
    if (!confirm("Delete this podcast?")) return;

    try {
      await api.delete(`/api/ai-podcast/${id}`);
      toast.success("Podcast deleted");
      setPodcasts(podcasts.filter((p) => p._id !== id));
    } catch (error: any) {
      console.error("Failed to delete podcast:", error);
      toast.error("Failed to delete podcast");
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      <Navbar />
      <div className="flex flex-1 overflow-hidden">
        <div className="hidden lg:block">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <h1 className="text-3xl font-extrabold text-text-primary mb-2">
                  🎙️ AI Podcasts
                </h1>
                <p className="text-text-tertiary">
                  Your AI-generated podcasts
                </p>
              </div>
              <button
                onClick={() => router.push("/ai-podcast/create")}
                className="px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition"
              >
                + Create Podcast
              </button>
            </div>

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-20">
                <div className="w-12 h-12 border-4 border-primary border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Empty State */}
            {!loading && podcasts.length === 0 && (
              <div className="text-center py-20">
                <div className="w-20 h-20 bg-surface rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-10 h-10 text-text-muted"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z"
                    />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-text-primary mb-2">
                  No podcasts yet
                </h3>
                <p className="text-text-tertiary mb-6">
                  Create your first AI-generated podcast
                </p>
                <button
                  onClick={() => router.push("/ai-podcast/create")}
                  className="px-6 py-3 bg-primary text-white rounded-xl font-semibold hover:bg-primary/90 transition"
                >
                  Create Podcast
                </button>
              </div>
            )}

            {/* Podcast Grid */}
            {!loading && podcasts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {podcasts.map((podcast) => (
                  <div
                    key={podcast._id}
                    className="bg-surface border border-border rounded-xl overflow-hidden hover:border-primary/50 transition cursor-pointer"
                    onClick={() => router.push(`/ai-podcast/${podcast._id}`)}
                  >
                    <div className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className={`px-2 py-1 rounded-full text-xs font-semibold ${
                          podcast.status === "ready"
                            ? "bg-green-500/20 text-green-400"
                            : podcast.status === "generating"
                            ? "bg-yellow-500/20 text-yellow-400"
                            : "bg-red-500/20 text-red-400"
                        }`}>
                          {podcast.status}
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deletePodcast(podcast._id);
                          }}
                          className="p-2 text-text-muted hover:text-red-400 transition"
                        >
                          <svg
                            className="w-5 h-5"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                            />
                          </svg>
                        </button>
                      </div>

                      <h3 className="text-lg font-bold text-text-primary mb-2 line-clamp-2">
                        {podcast.topic}
                      </h3>

                      <div className="flex items-center gap-3 text-sm text-text-tertiary">
                        <span className="capitalize">{podcast.voice}</span>
                        <span>•</span>
                        <span>{podcast.duration}</span>
                      </div>

                      <div className="mt-4 pt-4 border-t border-border">
                        <p className="text-xs text-text-muted">
                          {new Date(podcast.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
