"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/AuthContext";
import { Navbar } from "@/components/ui/Navbar";
import { Sidebar } from "@/components/Sidebar";
import toast from "react-hot-toast";

export default function CreateAIPodcast() {
  const router = useRouter();
  const [isGenerating, setIsGenerating] = useState(false);
  const [formData, setFormData] = useState({
    topic: "",
    voice: "male" as "male" | "female" | "british",
    duration: "5min" as "5min" | "10min" | "15min",
    knowledgeBase: "",
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.topic.trim()) {
      toast.error("Please enter a topic");
      return;
    }

    setIsGenerating(true);

    try {
      const { data } = await api.post("/api/ai-podcast", formData);

      toast.success("Podcast generation started!");
      
      // Redirect to podcast page
      router.push(`/ai-podcast/${data.podcastId}`);
    } catch (error: any) {
      console.error("Failed to create podcast:", error);
      toast.error(error.response?.data?.error || "Failed to create podcast");
    } finally {
      setIsGenerating(false);
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
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold text-text-primary mb-2">
                🎙️ Create AI Podcast
              </h1>
              <p className="text-text-tertiary">
                Generate an AI-powered podcast on any topic
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Topic */}
              <div className="bg-surface border border-border rounded-xl p-6">
                <label className="block text-sm font-semibold text-text-primary mb-2">
                  Topic *
                </label>
                <input
                  type="text"
                  value={formData.topic}
                  onChange={(e) =>
                    setFormData({ ...formData, topic: e.target.value })
                  }
                  placeholder="e.g., The Future of AI in 2026"
                  className="w-full px-4 py-3 bg-elevated border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary"
                  disabled={isGenerating}
                />
              </div>

              {/* Voice */}
              <div className="bg-surface border border-border rounded-xl p-6">
                <label className="block text-sm font-semibold text-text-primary mb-3">
                  Voice
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(["male", "female", "british"] as const).map((voice) => (
                    <button
                      key={voice}
                      type="button"
                      onClick={() => setFormData({ ...formData, voice })}
                      disabled={isGenerating}
                      className={`px-4 py-3 rounded-lg font-medium capitalize transition ${
                        formData.voice === voice
                          ? "bg-primary text-white"
                          : "bg-elevated text-text-secondary hover:bg-elevated/80 border border-border"
                      }`}
                    >
                      {voice}
                    </button>
                  ))}
                </div>
              </div>

              {/* Duration */}
              <div className="bg-surface border border-border rounded-xl p-6">
                <label className="block text-sm font-semibold text-text-primary mb-3">
                  Duration
                </label>
                <div className="grid grid-cols-3 gap-3">
                  {(["5min", "10min", "15min"] as const).map((duration) => (
                    <button
                      key={duration}
                      type="button"
                      onClick={() => setFormData({ ...formData, duration })}
                      disabled={isGenerating}
                      className={`px-4 py-3 rounded-lg font-medium transition ${
                        formData.duration === duration
                          ? "bg-primary text-white"
                          : "bg-elevated text-text-secondary hover:bg-elevated/80 border border-border"
                      }`}
                    >
                      {duration}
                    </button>
                  ))}
                </div>
              </div>

              {/* Knowledge Base (Optional) */}
              <div className="bg-surface border border-border rounded-xl p-6">
                <label className="block text-sm font-semibold text-text-primary mb-2">
                  Knowledge Base (Optional)
                </label>
                <p className="text-xs text-text-muted mb-3">
                  Paste context or information you want the AI to use. The AI will stay within this knowledge.
                </p>
                <textarea
                  value={formData.knowledgeBase}
                  onChange={(e) =>
                    setFormData({ ...formData, knowledgeBase: e.target.value })
                  }
                  placeholder="Paste relevant context, facts, or information here..."
                  rows={8}
                  className="w-full px-4 py-3 bg-elevated border border-border rounded-lg text-text-primary placeholder-text-muted focus:outline-none focus:ring-2 focus:ring-primary resize-none"
                  disabled={isGenerating}
                />
              </div>

              {/* Submit Button */}
              <div className="flex items-center gap-4">
                <button
                  type="submit"
                  disabled={isGenerating}
                  className={`flex-1 py-4 rounded-xl font-bold text-white transition ${
                    isGenerating
                      ? "bg-gray-600 cursor-not-allowed"
                      : "bg-primary hover:bg-primary/90"
                  }`}
                >
                  {isGenerating ? (
                    <span className="flex items-center justify-center gap-2">
                      <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                      Generating Podcast...
                    </span>
                  ) : (
                    "🎙️ Generate Podcast"
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/ai-podcast")}
                  disabled={isGenerating}
                  className="px-6 py-4 rounded-xl font-semibold text-text-secondary bg-elevated hover:bg-elevated/80 border border-border transition"
                >
                  Cancel
                </button>
              </div>

              {/* Info */}
              <div className="bg-elevated/50 border border-border rounded-xl p-4">
                <p className="text-sm text-text-tertiary">
                  ⏱️ Estimated generation time:{" "}
                  {formData.duration === "5min"
                    ? "~30 seconds"
                    : formData.duration === "10min"
                    ? "~45 seconds"
                    : "~60 seconds"}
                </p>
              </div>
            </form>
          </div>
        </main>
      </div>
    </div>
  );
}
