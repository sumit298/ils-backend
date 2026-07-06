"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/AuthContext";
import { Navbar } from "@/components/ui/Navbar";
import { Sidebar } from "@/components/Sidebar";
import toast from "react-hot-toast";

const VOICES = ["male", "female", "british"] as const;

export default function CreateAIStreamer() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    topic: "",
    persona: "",
    voice: "male" as (typeof VOICES)[number],
    title: "",
  });

  const set = (k: keyof typeof form, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.topic.trim() || !form.persona.trim()) {
      toast.error("Topic and persona are required");
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post("/api/ai-streamer/start", form);
      localStorage.setItem(
        "activeAIStreamer",
        JSON.stringify({ streamerId: data.streamerId, streamId: data.streamId })
      );
      toast.success("AI Streamer is live!");
      router.push(`/watch/${data.streamId}`);
    } catch (err: any) {
      toast.error(err.response?.data?.error || "Failed to start AI streamer");
    } finally {
      setLoading(false);
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
          <div className="max-w-2xl mx-auto px-4 sm:px-6 py-8">
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold text-text-primary mb-2">
                🤖 Launch AI Streamer
              </h1>
              <p className="text-text-tertiary">
                An AI persona that goes live, talks, and responds to chat
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="bg-surface border border-border rounded-xl p-5">
                <label className="block text-sm font-semibold text-text-primary mb-2">
                  Topic *
                </label>
                <input
                  type="text"
                  value={form.topic}
                  onChange={(e) => set("topic", e.target.value)}
                  placeholder="e.g., Latest AI news, crypto markets, indie game dev"
                  className="w-full px-4 py-3 bg-elevated border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={loading}
                />
              </div>

              <div className="bg-surface border border-border rounded-xl p-5">
                <label className="block text-sm font-semibold text-text-primary mb-2">
                  Persona *
                </label>
                <input
                  type="text"
                  value={form.persona}
                  onChange={(e) => set("persona", e.target.value)}
                  placeholder='e.g., "energetic tech bro who loves hype", "calm professor"'
                  className="w-full px-4 py-3 bg-elevated border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={loading}
                />
                <p className="text-xs text-text-muted mt-2">
                  Describe the personality and speaking style
                </p>
              </div>

              <div className="bg-surface border border-border rounded-xl p-5">
                <label className="block text-sm font-semibold text-text-primary mb-2">
                  Stream Title{" "}
                  <span className="text-text-muted font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => set("title", e.target.value)}
                  placeholder="Defaults to topic if left blank"
                  className="w-full px-4 py-3 bg-elevated border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={loading}
                />
              </div>

              <div className="bg-surface border border-border rounded-xl p-5">
                <label className="block text-sm font-semibold text-text-primary mb-3">
                  Voice
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {VOICES.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => set("voice", v)}
                      disabled={loading}
                      className={`py-3 rounded-lg font-medium capitalize transition ${
                        form.voice === v
                          ? "bg-primary text-white"
                          : "bg-elevated text-text-secondary hover:bg-elevated/80 border border-border"
                      }`}
                    >
                      {v === "male" ? "🎙️ Male" : v === "female" ? "🎤 Female" : "🎩 British"}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  type="submit"
                  disabled={loading}
                  className={`flex-1 py-4 rounded-xl font-bold text-white transition ${
                    loading
                      ? "bg-gray-600 cursor-not-allowed"
                      : "bg-primary hover:bg-primary/90"
                  }`}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Starting...
                    </span>
                  ) : (
                    "🚀 Go Live"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => router.back()}
                  disabled={loading}
                  className="px-6 py-4 rounded-xl font-semibold text-text-secondary bg-elevated hover:bg-elevated/80 border border-border transition"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
