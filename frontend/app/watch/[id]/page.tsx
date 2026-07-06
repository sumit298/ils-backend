"use client";
import React, { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { Device, types } from "mediasoup-client";
import { io, Socket } from "socket.io-client";
import toast from "react-hot-toast";
import { api, useAuth } from "@/lib/AuthContext";
import ChatPanel from "@/components/ChatPanel";
import { FollowButton } from "@/components/FollowButton";
import MediaStatsOverlay from "@/components/MediaStatsOverlay";
import { getAvatarUrl } from "@/lib/avatar";

const WatchPage = () => {
  const params = useParams();
  const { user, getSocketAuth } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const pipVideoRef = useRef<HTMLVideoElement>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const audioConsumerRef = useRef<types.Consumer | null>(null);
  const videoConsumerRef = useRef<types.Consumer | null>(null);
  const initRef = useRef(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [device, setDevice] = useState<Device | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [viewerCount, setViewerCount] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [streamInfo, setStreamInfo] = useState<{
    title?: string;
    category?: string;
    tags?: string[];
    description?: string;
    userId?: {
      _id: string;
      username: string;
      email: string;
      avatar?: string;
    };
  } | null>(null);
  const [isMuted, setIsMuted] = useState(true);
  const [streamStartTime, setStreamStartTime] = useState<number | null>(null);
  const [duration, setDuration] = useState(0);
  const [streamEnded, setStreamEnded] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const screenVideoRef = useRef<HTMLVideoElement>(null);
  const [recvTransport, setRecvTransport] = useState<types.Transport | null>(
    null,
  );
  const [consumedProducers, setConsumedProducers] = useState<Set<string>>(
    new Set(),
  );
  const [streamerInfo, setStreamerInfo] = useState<any>(null);

  // Sync state to ref
  useEffect(() => {
    consumedProducersRef.current = consumedProducers;
  }, [consumedProducers]);
  const screenProducerIds = useRef<Set<string>>(new Set());
  const consumedProducersRef = useRef<Set<string>>(new Set());
  const [pipPosition, setPipPosition] = useState({ x: 16, y: 16 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const videoContainerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isAudioOnly, setIsAudioOnly] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [subtitle, setSubtitle] = useState<string | null>(null);
  const subtitleTimerRef = useRef<NodeJS.Timeout | null>(null);
  const analyserRafRef = useRef<number | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(true);

  const toggleMute = () => {
    const newMutedState = !isMuted;

    // On first unmute, add audio track to stream (guard against duplicate)
    if (isMuted && audioConsumerRef.current && cameraStreamRef.current) {
      const audioTrack = audioConsumerRef.current.track;
      const alreadyInStream = cameraStreamRef.current.getTracks().includes(audioTrack);
      if (!alreadyInStream) {
        cameraStreamRef.current.addTrack(audioTrack);
        console.log("🔊 [UNMUTE] Audio track added to stream");
      }
    }

    setIsMuted(newMutedState);

    // Mute/unmute main video
    if (videoRef.current) {
      videoRef.current.muted = newMutedState;
    }

    // Mute/unmute PiP video
    if (pipVideoRef.current) {
      pipVideoRef.current.muted = newMutedState;
    }

    // Mute/unmute screen share video
    if (screenVideoRef.current) {
      screenVideoRef.current.muted = newMutedState;
    }
  };

  const toggleFullscreen = () => {
    if (!videoContainerRef.current) return;

    if (!document.fullscreenElement) {
      videoContainerRef.current.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    if (streamInfo?.userId) {
      setStreamerInfo(streamInfo.userId);
    }
  }, [streamInfo]);

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };

    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () =>
      document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  const handlePipStart = (clientX: number, clientY: number) => {
    setIsDragging(true);
    dragStart.current = {
      x: clientX - pipPosition.x,
      y: clientY - pipPosition.y,
    };
  };

  const handlePipMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    handlePipStart(e.clientX, e.clientY);
  };

  const handlePipTouchStart = (e: React.TouchEvent) => {
    e.preventDefault();
    const touch = e.touches[0];
    handlePipStart(touch.clientX, touch.clientY);
  };

  useEffect(() => {
    const handleMove = (clientX: number, clientY: number) => {
      if (isDragging) {
        setPipPosition({
          x: clientX - dragStart.current.x,
          y: clientY - dragStart.current.y,
        });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      handleMove(e.clientX, e.clientY);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY);
      }
    };

    const handleEnd = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener("mousemove", handleMouseMove);
      document.addEventListener("mouseup", handleEnd);
      document.addEventListener("touchmove", handleTouchMove);
      document.addEventListener("touchend", handleEnd);
    }

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleEnd);
      document.removeEventListener("touchmove", handleTouchMove);
      document.removeEventListener("touchend", handleEnd);
    };
  }, [isDragging]);

  useEffect(() => {
    // Reset on mount
    initRef.current = false;

    return () => {
      // Reset on unmount so reload works
      initRef.current = false;
    };
  }, []);

  useEffect(() => {
    const init = async () => {
      console.log(
        "🚀 [INIT] Starting initialization at:",
        new Date().toISOString(),
      );

      const fetchStart = performance.now();
      await fetchStreamInfo();
      console.log(
        `📊 [INIT] Stream info fetched in ${(performance.now() - fetchStart).toFixed(0)}ms`,
      );

      const socketStart = performance.now();
      const authData = getSocketAuth();

      const newSocket = io(
        process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001",
        {
          transports: ["websocket", "polling"],
          auth: authData,
        },
      );
      console.log(
        `🔌 [INIT] Socket created in ${(performance.now() - socketStart).toFixed(0)}ms`,
      );

      newSocket.on("connect", () => {
        console.log(
          "✅ [SOCKET] Connected at:",
          new Date().toISOString(),
          "Socket ID:",
          newSocket.id,
        );
        const joinStart = performance.now();
        newSocket.emit("join-stream", { streamId: params.id });
        console.log(
          `📡 [SOCKET] join-stream emitted in ${(performance.now() - joinStart).toFixed(0)}ms`,
        );
      });

      newSocket.on("viewer-count", (count: number) => {
        console.log(
          "👁️ [EVENT] viewer-count received at:",
          new Date().toISOString(),
          "Count:",
          count,
        );
        setViewerCount(count);
      });

      newSocket.on(
        "new-producer",
        async (data: {
          producerId: string;
          kind: string;
          userId: string;
          isScreenShare?: boolean;
        }) => {
          console.log(
            "📺 [EVENT] new-producer received at:",
            new Date().toISOString(),
            "Data:",
            data,
          );
          // If viewer hasn't initialized yet and this is a camera producer, trigger initialization
          if (!initRef.current && data.kind === "video") {
            console.log(
              "🎬 [EVENT] Camera producer available, triggering initialization",
            );
            initializeViewer();
          }
        },
      );

      newSocket.on(
        "existing-producers",
        async (
          producers: Array<{
            id: string;
            kind: string;
            userId: string;
            isScreenShare?: boolean;
          }>,
        ) => {
          console.log(
            "🎬 [EVENT] existing-producers received at:",
            new Date().toISOString(),
            "Producers:",
            producers,
          );

          if (!initRef.current && producers.length > 0) {
            console.log(
              "🎬 [EVENT] Producers available, triggering initialization",
            );
            initializeViewer(newSocket);
          }
        },
      );

      newSocket.on("stream-start-time", (data) => {
        console.log(
          "⏱️ [EVENT] stream-start-time received at:",
          new Date().toISOString(),
          "Start time:",
          data.startTime,
        );
        setStreamStartTime(data.startTime);
      });

      newSocket.on("stream-ended", () => {
        console.log(
          "🛑 [EVENT] stream-ended received at:",
          new Date().toISOString(),
        );
        localStorage.removeItem("activeAIStreamer");
        setStreamEnded(true);
        toast.error("Stream has ended", { position: "bottom-left" });
      });

      newSocket.on("ai-subtitle", ({ text }: { text: string }) => {
        setSubtitle(text);
        if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
        // Keep subtitle visible for ~6s or until next one arrives
        subtitleTimerRef.current = setTimeout(() => setSubtitle(null), 6000);
      });

      newSocket.on("error", (error) => {
        console.error("❌ [SOCKET] Error at:", new Date().toISOString(), error);
        toast.error("Connection error", { position: "bottom-left" });
      });

      const socketSetStart = performance.now();
      setSocket(newSocket);
      console.log(
        `🔧 [INIT] Socket state set in ${(performance.now() - socketSetStart).toFixed(0)}ms`,
      );
      console.log(
        "✅ [INIT] Initialization complete at:",
        new Date().toISOString(),
      );
    };

    init();
    return () => {
      console.log(
        "🧹 [CLEANUP] Cleaning up socket listeners at:",
        new Date().toISOString(),
      );
      if (analyserRafRef.current) cancelAnimationFrame(analyserRafRef.current);
      if (subtitleTimerRef.current) clearTimeout(subtitleTimerRef.current);
      socket?.off("connect");
      socket?.off("viewer-count");
      socket?.off("existing-producers");
      socket?.off("new-producer");
      socket?.off("stream-start-time");
      socket?.off("stream-ended");
      socket?.off("ai-subtitle");
      socket?.off("error");
      socket?.close();
    };
  }, [params.id]);

  useEffect(() => {
    console.log(
      "🔍 [EFFECT] useEffect triggered at:",
      new Date().toISOString(),
    );
    console.log(
      "🔍 [EFFECT] socket:",
      !!socket,
      "streamInfo:",
      !!streamInfo,
      "initRef.current:",
      initRef.current,
    );

    if (socket && streamInfo && !initRef.current) {
      console.log(
        "🚀 [EFFECT] All conditions met, calling initializeViewer at:",
        new Date().toISOString(),
      );
      initializeViewer();
    } else {
      console.log("⏸️ [EFFECT] Conditions not met - waiting...");
      if (!socket) console.log("  - Missing socket");
      if (!streamInfo) console.log("  - Missing streamInfo");
      if (initRef.current) console.log("  - Already initialized");
    }
  }, [socket, streamInfo]);

  useEffect(() => {
    if (!streamStartTime) return;

    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - streamStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [streamStartTime]);

  // Set PiP video stream when screen sharing becomes active
  useEffect(() => {
    if (pipVideoRef.current && cameraStreamRef.current && screenStream) {
      pipVideoRef.current.srcObject = cameraStreamRef.current;
      pipVideoRef.current
        .play()
        .catch((e) => console.error("PiP play failed:", e));
    }
  }, [screenStream]);

  // Restore camera to main video when screen share ends
  useEffect(() => {
    if (!screenStream && videoRef.current && cameraStreamRef.current) {
      console.log(
        "🔄 [EFFECT] Screen share ended, restoring camera to main video",
      );
      console.log(
        "🔄 [EFFECT] Camera stream tracks:",
        cameraStreamRef.current
          .getTracks()
          .map((t) => `${t.kind}: ${t.readyState}`),
      );
      videoRef.current.srcObject = cameraStreamRef.current;
      videoRef.current.muted = isMuted;
      videoRef.current
        .play()
        .catch((e) => console.error("🔄 [EFFECT] Play failed:", e));
    }
  }, [screenStream, isMuted]);

  // Handle new producers (screen share) after device and transport are ready
  useEffect(() => {
    if (!socket || !device || !recvTransport) return;

    const handleNewProducer = async (data: {
      producerId: string;
      kind: string;
      userId: string;
      isScreenShare?: boolean;
    }) => {
      console.log("📺 New producer available (handler):", data);

      // Only handle screen share producers here
      if (!data.isScreenShare) {
        console.log("Ignoring non-screen-share producer");
        return;
      }

      if (consumedProducersRef.current.has(data.producerId)) {
        console.log("Already consumed this producer:", data.producerId);
        return;
      }

      console.log(
        "🎬 [HANDLER] Attempting to consume screen producer:",
        data.producerId,
      );

      const consumer = await consumeProducer(data.producerId, data.kind);
      if (!consumer) {
        console.error(
          "❌ [HANDLER] Failed to consume producer:",
          data.producerId,
        );
        return;
      }

      console.log(
        "✅ [HANDLER] Successfully consumed producer:",
        data.producerId,
      );
      setConsumedProducers((prev) => new Set(prev).add(data.producerId));

      if (data.kind === "video") {
        screenProducerIds.current.add(data.producerId);
        const stream = new MediaStream([consumer.track]);
        setScreenStream(stream);
        if (screenVideoRef.current) {
          screenVideoRef.current.srcObject = stream;
          screenVideoRef.current.muted = isMuted;
          await screenVideoRef.current
            .play()
            .catch((e) => console.error("Play failed:", e));
        }
        toast.success("Screen sharing started", { position: "bottom-left" });
      } else if (data.kind === "audio") {
        screenProducerIds.current.add(data.producerId);
        setScreenStream((prev) => {
          if (prev && screenVideoRef.current) {
            prev.addTrack(consumer.track);
            screenVideoRef.current.srcObject = new MediaStream(
              prev.getTracks(),
            );
          }
          return prev;
        });
      }
    };

    const handleProducerClosed = (data: { producerId: string }) => {
      console.log(
        "Producer closed:",
        data.producerId,
        "Screen producers:",
        Array.from(screenProducerIds.current),
      );

      // Only handle screen producers
      if (screenProducerIds.current.has(data.producerId)) {
        screenProducerIds.current.delete(data.producerId);
        setConsumedProducers((prev) => {
          const newSet = new Set(prev);
          newSet.delete(data.producerId);
          return newSet;
        });

        // Clear screen only when ALL screen producers are closed
        if (screenProducerIds.current.size === 0) {
          console.log(
            "All screen producers closed, clearing screen and restoring camera",
          );

          // First, restore camera to main video BEFORE clearing screen
          if (videoRef.current && cameraStreamRef.current) {
            console.log("Restoring camera stream to main video");
            videoRef.current.srcObject = cameraStreamRef.current;
            videoRef.current.muted = isMuted;
            videoRef.current
              .play()
              .catch((e) => console.error("Play failed:", e));
          }

          // Then clear screen stream
          setScreenStream((prev) => {
            if (prev) {
              prev.getTracks().forEach((track) => track.stop());
              if (screenVideoRef.current) {
                screenVideoRef.current.srcObject = null;
              }
            }
            return null;
          });

          toast("Screen sharing stopped", { position: "bottom-left" });
        }
      }
    };

    socket.on("new-producer", handleNewProducer);
    socket.on("producer-closed", handleProducerClosed);

    return () => {
      socket.off("new-producer", handleNewProducer);
      socket.off("producer-closed", handleProducerClosed);
    };
  }, [socket, device, recvTransport, consumedProducers]);

  const fetchStreamInfo = async () => {
    try {
      const { data } = await api.get(`/api/streams/${params.id}`);
      setStreamInfo(data.stream);
      setStreamerInfo(data.stream.userId);
      if (process.env.NODE_ENV === "development") {
        console.log("🔍 Stream data received:", {
          id: data.stream?._id,
          title: data.stream?.title,
          userId: data.stream?.userId?._id,
        });
      }
    } catch (error) {
      console.error("Failed to fetch stream info:", error);
      toast.error("Stream not found", { position: "bottom-left" });
    }
  };

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  };

  const consumeProducer = async (producerId: string, kind: string) => {
    if (!socket || !device || !recvTransport) return;

    try {
      const consumerData = await new Promise<{
        id: string;
        producerId: string;
        kind: string;
        rtpParameters: types.RtpParameters;
      }>((resolve) => {
        socket.emit(
          "consume",
          {
            roomId: params.id,
            producerId,
            rtpCapabilities: device.rtpCapabilities,
          },
          resolve,
        );
      });

      if (!consumerData?.id) return;

      const consumer = await recvTransport.consume({
        id: consumerData.id,
        producerId: consumerData.producerId,
        kind: consumerData.kind as types.MediaKind,
        rtpParameters: consumerData.rtpParameters,
      });

      await new Promise<void>((resolve) => {
        socket.emit(
          "resume-consumer",
          {
            roomId: params.id,
            consumerId: consumer.id,
          },
          resolve,
        );
      });
      return consumer;
    } catch (error) {
      console.error("Failed to consume producer:", error);
    }
  };

  const initializeViewer = async (activeSocket: Socket | null = socket) => {
    console.log(
      "🎯 [VIEWER] initializeViewer called at:",
      new Date().toISOString(),
    );

    if (!activeSocket) {
      console.error("❌ [VIEWER] No active socket available");
      initRef.current = false;
      return;
    }

    if (initRef.current) {
      console.log("⚠️ [VIEWER] Already initialized, skipping");
      return;
    }

    console.log("🔒 [VIEWER] Setting initRef.current = true");
    initRef.current = true;

    try {
      const startTime = performance.now();
      console.log(
        "🎬 [VIEWER] Starting viewer initialization for stream:",
        params.id,
      );

      const t1 = performance.now();
      console.log("📡 [VIEWER] Getting router capabilities...");
      const routerCapabilities = await new Promise<types.RtpCapabilities>(
        (resolve) => {
          activeSocket.emit(
            "get-router-capabilities",
            { roomId: params.id },
            resolve,
          );
        },
      );
      console.log(
        `✅ [VIEWER] Got router capabilities (${(performance.now() - t1).toFixed(0)}ms)`,
      );

      const t2 = performance.now();
      console.log("🔧 [VIEWER] Loading device...");
      const newDevice = new Device();
      await newDevice.load({ routerRtpCapabilities: routerCapabilities });
      setDevice(newDevice);
      console.log(
        `✅ [VIEWER] Device loaded (${(performance.now() - t2).toFixed(0)}ms)`,
      );

      const t3 = performance.now();
      console.log("🚛 [VIEWER] Creating transport...");
      const transportInfo = await new Promise<types.TransportOptions>(
        (resolve) => {
          activeSocket.emit(
            "create-transport",
            { roomId: params.id, direction: "recv" },
            resolve,
          );
        },
      );
      console.log(
        `✅ [VIEWER] Transport created (${(performance.now() - t3).toFixed(0)}ms)`,
      );

      const recvTransport = newDevice.createRecvTransport(transportInfo);
      setRecvTransport(recvTransport);
      console.log("🔗 [VIEWER] Receive transport created");

      // Monitor connection state
      recvTransport.on("connectionstatechange", (state) => {
        console.log(
          `🔗 [VIEWER] Recv transport connection state: ${state} at:`,
          new Date().toISOString(),
        );
        if (state === "failed" || state === "closed") {
          console.error("❌ [VIEWER] Transport connection failed!");
          toast.error("Connection failed");
        }
      });

      recvTransport.on("connect", async ({ dtlsParameters }, callback) => {
        console.log(
          "🔌 [VIEWER] Recv transport connecting at:",
          new Date().toISOString(),
        );
        const connectStart = performance.now();
        activeSocket.emit(
          "connect-transport",
          {
            roomId: params.id,
            transportId: recvTransport.id,
            dtlsParameters,
          },
          () => {
            console.log(
              `✅ [VIEWER] Recv transport connected (${(performance.now() - connectStart).toFixed(0)}ms)`,
            );
            callback();
          },
        );
      });

      // Get existing producers first
      const t4 = performance.now();
      console.log("🎭 [VIEWER] Getting existing producers...");
      const producers = await new Promise<
        Array<{
          id: string;
          kind: string;
          userId: string;
          isScreenShare?: boolean;
        }>
      >((resolve) => {
        activeSocket.emit("get-producers", { roomId: params.id }, resolve);
      });
      console.log(
        `✅ [VIEWER] Got producers (${(performance.now() - t4).toFixed(0)}ms):`,
        producers,
      );

      if (!producers || producers.length === 0) {
        console.log(
          "⏳ [VIEWER] No producers yet, waiting for stream to start...",
        );
        initRef.current = false;
        setIsLoading(false);
        toast("Waiting for stream to start...", {
          icon: "⏳",
          position: "bottom-left",
        });
        return;
      }

      const screenProducers = producers.filter((p) => p.isScreenShare === true);

      console.log("🖥️ [VIEWER] Screen producers found:", screenProducers);

      const consumeProducerLocal = async (producerId: string, kind: string) => {
        try {
          const consumerData = await new Promise<{
            id: string;
            producerId: string;
            kind: string;
            rtpParameters: types.RtpParameters;
          }>((resolve) => {
            activeSocket.emit(
              "consume",
              {
                roomId: params.id,
                producerId,
                rtpCapabilities: newDevice.recvRtpCapabilities,
              },
              resolve,
            );
          });

          if (!consumerData?.id) {
            console.error(
              "❌ [VIEWER] No consumer ID returned for producer:",
              producerId,
            );
            return null;
          }

          const consumer = await recvTransport.consume({
            id: consumerData.id,
            producerId: consumerData.producerId,
            kind: consumerData.kind as types.MediaKind,
            rtpParameters: consumerData.rtpParameters,
          });

          await new Promise<void>((resolve) => {
            activeSocket.emit(
              "resume-consumer",
              {
                roomId: params.id,
                consumerId: consumer.id,
              },
              resolve,
            );
          });

          console.log(
            "✅ [VIEWER] Consumer ready for:",
            producerId,
            "kind:",
            kind,
            "consumerId:",
            consumer.id,
          );

          return consumer;
        } catch (error) {
          console.error("❌ Failed to consume producer:", producerId, error);
          return null;
        }
      };

      // Consume screen video first
      const screenVideoProducer = screenProducers.find(
        (p) => p.kind === "video",
      );
      if (screenVideoProducer) {
        if (!consumedProducers.has(screenVideoProducer.id)) {
          console.log(
            "🖥️ [VIEWER] Consuming existing screen VIDEO producer:",
            screenVideoProducer.id,
          );

          const consumer = await consumeProducerLocal(
            screenVideoProducer.id,
            screenVideoProducer.kind,
          );
          if (consumer) {
            screenProducerIds.current.add(screenVideoProducer.id);
            setConsumedProducers((prev) =>
              new Set(prev).add(screenVideoProducer.id),
            );

            const stream = new MediaStream([consumer.track]);
            setScreenStream(stream);

            if (screenVideoRef.current) {
              screenVideoRef.current.srcObject = stream;
              screenVideoRef.current.muted = isMuted;
              await screenVideoRef.current.play().catch(console.error);
              console.log("✅ [VIEWER] Screen video element playing");
            }

            toast.success("Screen sharing started", {
              position: "bottom-left",
            });
          } else {
            console.log("⚠️ [VIEWER] Screen video consumer failed to create");
          }
        }
      }

      // Then consume screen audio if available
      const screenAudioProducer = screenProducers.find(
        (p) => p.kind === "audio",
      );
      if (screenAudioProducer) {
        if (!consumedProducers.has(screenAudioProducer.id)) {
          console.log(
            "🖥️ [VIEWER] Consuming existing screen AUDIO producer:",
            screenAudioProducer.id,
          );

          const consumer = await consumeProducerLocal(
            screenAudioProducer.id,
            screenAudioProducer.kind,
          );
          if (consumer) {
            screenProducerIds.current.add(screenAudioProducer.id);
            setConsumedProducers((prev) =>
              new Set(prev).add(screenAudioProducer.id),
            );

            // Add audio track to existing screen stream
            setScreenStream((prev) => {
              if (prev && screenVideoRef.current) {
                prev.addTrack(consumer.track);
                screenVideoRef.current.srcObject = new MediaStream(
                  prev.getTracks(),
                );
                console.log("🔊 [VIEWER] Screen audio track added to stream");
              }
              return prev;
            });
          } else {
            console.log("⚠️ [VIEWER] Screen audio consumer failed to create");
          }
        }
      }

      // Filter out screen share producers - only consume camera/mic initially
      const cameraProducers = producers.filter((p) => !p.isScreenShare);
      const mediaProducers = producers.filter(
        (p) => p.kind === "video" || p.kind === "audio",
      );

      if (mediaProducers.length === 0) {
        initRef.current = false;
        setIsLoading(false);
        return;
      }

      console.log("📹 [VIEWER] Camera producers to consume:", cameraProducers);

      // if (cameraProducers.length === 0) {
      //   console.log('⏳ [VIEWER] No camera producers yet, waiting for stream to start...');
      //   initRef.current = false;
      //   setIsLoading(false);
      //   toast("Waiting for stream to start...", { icon: "⏳", position: "bottom-left" });
      //   return;
      // }

      const stream = new MediaStream();
      console.log("🎵 [VIEWER] Created new MediaStream");

      // Consume audio FIRST but DON'T add to stream yet
      const audioProducer = cameraProducers.find((p) => p.kind === "audio");
      if (audioProducer) {
        const t5 = performance.now();
        console.log("🎵 [VIEWER] Consuming audio producer:", audioProducer.id);
        const audioConsumer = await new Promise<{
          id: string;
          producerId: string;
          kind: string;
          rtpParameters: types.RtpParameters;
        }>((resolve) => {
          activeSocket.emit(
            "consume",
            {
              roomId: params.id,
              producerId: audioProducer.id,
              rtpCapabilities: newDevice.rtpCapabilities,
            },
            resolve,
          );
        });
        console.log(
          `✅ [VIEWER] Audio consumer created (${(performance.now() - t5).toFixed(0)}ms):`,
          audioConsumer,
        );

        if (audioConsumer?.id) {
          const t6 = performance.now();
          const consumer = await recvTransport.consume({
            id: audioConsumer.id,
            producerId: audioConsumer.producerId,
            kind: audioConsumer.kind as types.MediaKind,
            rtpParameters: audioConsumer.rtpParameters,
          });
          console.log(
            `✅ [VIEWER] Audio consumer transport consume (${(performance.now() - t6).toFixed(0)}ms)`,
          );

          const t7 = performance.now();
          await new Promise((resolve) => {
            activeSocket.emit(
              "resume-consumer",
              {
                roomId: params.id,
                consumerId: consumer.id,
              },
              resolve,
            );
          });
          console.log(
            `✅ [VIEWER] Audio consumer resumed (${(performance.now() - t7).toFixed(0)}ms)`,
          );

          // For audio-only streams, add the track directly to stream
          stream.addTrack(consumer.track);
          audioConsumerRef.current = consumer;
          setConsumedProducers((prev) => new Set(prev).add(audioProducer.id));
          console.log("🎵 [VIEWER] Audio track added to stream");
        }
      }

      // Then consume video (only camera video)
      const videoProducer = cameraProducers.find(
        (p: any) => p.kind === "video",
      );
      if (!videoProducer) {
        // No video - audio-only stream (like AI streamer)
        console.log('[VIEWER] Audio-only stream detected, skipping video');
        
        // Store camera stream with audio only
        cameraStreamRef.current = stream;
        setCameraStream(stream);
        setIsAudioOnly(true);
        setIsLoading(false);
        
        // Wait for next tick to ensure DOM is ready
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Play the audio through the video element (audio works without video track)
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.muted = isMuted;
          await videoRef.current.play().catch((e) => {
            console.log('Audio play deferred (will play on unmute):', e.name);
          });
        }
        
        toast.success("Connected to audio stream - Click unmute to hear!", { position: "bottom-left" });
        console.log('✓ [VIEWER] Audio-only stream ready - unmute to hear');

        // Start audio analyser to detect speaking
        try {
          const audioCtx = new AudioContext();
          const source = audioCtx.createMediaStreamSource(stream);
          const analyser = audioCtx.createAnalyser();
          analyser.fftSize = 256;
          source.connect(analyser);
          const data = new Uint8Array(analyser.frequencyBinCount);
          const detect = () => {
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            setIsSpeaking(avg > 8);
            analyserRafRef.current = requestAnimationFrame(detect);
          };
          analyserRafRef.current = requestAnimationFrame(detect);
        } catch (e) {
          console.warn('[VIEWER] Audio analyser failed:', e);
        }

        return;
      }

      const t8 = performance.now();
      console.log("📹 [VIEWER] Consuming video producer:", videoProducer.id);
      const videoConsumer = await new Promise<{
        id: string;
        producerId: string;
        kind: string;
        rtpParameters: types.RtpParameters;
      }>((resolve) => {
        activeSocket.emit(
          "consume",
          {
            roomId: params.id,
            producerId: videoProducer.id,
            rtpCapabilities: newDevice.rtpCapabilities,
          },
          resolve,
        );
      });
      console.log(
        `✅ [VIEWER] Video consumer created (${(performance.now() - t8).toFixed(0)}ms):`,
        videoConsumer,
      );

      if (videoConsumer?.id) {
        const t9 = performance.now();
        const consumer = await recvTransport.consume({
          id: videoConsumer.id,
          producerId: videoConsumer.producerId,
          kind: videoConsumer.kind as types.MediaKind,
          rtpParameters: videoConsumer.rtpParameters,
        });
        console.log(
          `✅ [VIEWER] Video consumer transport consume (${(performance.now() - t9).toFixed(0)}ms)`,
        );

        // Resume consumer to start receiving media
        const t10 = performance.now();
        await new Promise((resolve) => {
          activeSocket.emit(
            "resume-consumer",
            {
              roomId: params.id,
              consumerId: consumer.id,
            },
            resolve,
          );
        });
        console.log(
          `✅ [VIEWER] Video consumer resumed (${(performance.now() - t10).toFixed(0)}ms)`,
        );

        videoConsumerRef.current = consumer;
        stream.addTrack(consumer.track);
        setConsumedProducers((prev) => new Set(prev).add(videoProducer.id));
        console.log("📹 [VIEWER] Video track added to stream");
      }

      // Store camera stream first
      cameraStreamRef.current = stream;
      setCameraStream(stream);
      console.log("📹 [VIEWER] Camera stream stored");

      // Check if screen share is already active
      if (screenProducers.length > 0) {
        // Screen share active - put camera in PiP
        console.log("🖼️ [VIEWER] Screen share active, putting camera in PiP");
        if (pipVideoRef.current) {
          pipVideoRef.current.srcObject = stream;
          pipVideoRef.current.muted = isMuted;
          await pipVideoRef.current
            .play()
            .catch((e) => console.error("❌ [VIEWER] PiP play failed:", e));
          console.log("✅ [VIEWER] Camera in PiP started");
        }
        setIsLoading(false);
        toast.success("Connected to stream", { position: "bottom-left" });
      } else {
        // No screen share - put camera in main video
        console.log(
          "📺 [VIEWER] No screen share, putting camera in main video",
        );
        if (!videoRef.current) {
          throw new Error("Video element not found");
        }

        const video = videoRef.current;
        video.muted = true;
        video.srcObject = stream;
        console.log(
          "✅ [VIEWER] Stream set to video element, tracks:",
          stream.getTracks().length,
        );

        await video
          .play()
          .then(() => {
            console.log("✅ [VIEWER] Video playback started");
            setIsLoading(false);
            toast.success("Connected to stream", { position: "bottom-left" });
          })
          .catch((e) => {
            console.error("❌ [VIEWER] Play failed:", e);
            setIsLoading(false);
          });
      }

      console.log(
        `🎉 [VIEWER] Total initialization time: ${(performance.now() - startTime).toFixed(0)}ms`,
      );
    } catch (error) {
      console.error("❌ [VIEWER] Failed to initialize viewer:", error);
      setIsLoading(false);
      initRef.current = false;
      toast.error("Failed to connect to stream", { position: "bottom-left" });
    }
  };

  const leaveStream = () => {
    if (analyserRafRef.current) cancelAnimationFrame(analyserRafRef.current);
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
    socket?.close();
    toast.success("Disconnected from stream", { position: "bottom-left" });
    window.location.href = "/dashboard";
  };

  return (
    <div
      className="fixed inset-0 bg-black overflow-hidden"
      style={{ ["--viewport-height" as any]: "100dvh" }}
    >
      {/* Stream Ended Overlay */}
      {streamEnded && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-gray-800 rounded-xl p-8 max-w-md text-center border border-gray-700">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-red-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </div>
            <h2 className="text-2xl font-bold mb-2 text-white">Stream Ended</h2>
            <p className="text-gray-400 mb-6">
              The streamer has ended this broadcast
            </p>
            <button
              onClick={() => (window.location.href = "/dashboard")}
              className="bg-gray-700 hover:bg-gray-600 text-white px-6 py-3 rounded-xl font-semibold transition w-full"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      )}

      {/* Container - vertical on mobile, horizontal on desktop */}
      <div
        className="h-screen md:h-screen flex flex-col md:flex-row"
        style={{ height: "var(--viewport-height, 100vh)" }}
      >
        {/* Main Video Area */}
        <div className="flex-1 relative">
          {/* Header */}
          <div className="absolute top-4 left-4 z-20 flex items-center gap-2">
            {/* Stream Timer */}
            <div className="bg-black/70 backdrop-blur-sm p-3 rounded-lg hover:bg-black/70 transition px-3 py-1.5 flex items-center gap-2 border border-white/20">
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span className="text-white text-sm font-medium">
                {formatDuration(duration)}
              </span>
            </div>
            {streamerInfo && (
              <div className="hidden landscape:flex md:flex bg-black/60 backdrop-blur-sm p-3 hover:bg-black/70 transition pl-2 pr-1 py-1 rounded-lg items-center gap-2 border border-white/20">
                <img
                  src={getAvatarUrl(streamerInfo.avatar, streamerInfo.username)}
                  alt={streamerInfo.username}
                  className="w-5 h-5 rounded-full"
                />
                <span className="text-white text-sm font-medium">
                  {streamerInfo.username}
                </span>
                {user?.id !== (streamerInfo._id || streamerInfo.id) && (
                  <FollowButton userId={streamerInfo._id || streamerInfo.id} />
                )}
              </div>
            )}
          </div>

          {/* Top Right Controls */}
          <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
            <MediaStatsOverlay
              videoConsumerRef={videoConsumerRef}
              audioConsumerRef={audioConsumerRef}
            />
            <button className="bg-black/50 backdrop-blur-sm px-4 py-2 rounded-lg hover:bg-black/70 transition flex items-center gap-2">
              <svg
                className="w-4 h-4 text-white"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
              </svg>
              <span className="text-white font-medium">{viewerCount}</span>
            </button>
            <button
              onClick={() => setShowMobileChat(!showMobileChat)}
              className="bg-black/60 backdrop-blur-sm p-3 rounded-lg hover:bg-black/70 transition"
            >
              <svg
                className="w-4 h-4 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
              </svg>
            </button>
          </div>
          {/* AI Subtitle overlay */}
          {subtitle && (
            <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-30 max-w-2xl w-full px-4 pointer-events-none">
              <div className="bg-black/75 backdrop-blur-sm text-white text-center text-sm md:text-base font-medium px-5 py-3 rounded-xl leading-relaxed">
                {subtitle}
              </div>
            </div>
          )}

          {screenProducerIds.current.size > 0 ? (
            /* Screen Share with Camera PiP */
            <div
              ref={videoContainerRef}
              className="w-full h-full bg-black relative"
            >
              {/* Screen Share - Main */}
              <video
                ref={screenVideoRef}
                autoPlay
                playsInline
                muted={isMuted}
                className="w-full h-full object-contain"
              />
              <div className="absolute bottom-4 left-4 bg-gray-750 px-3 py-2 rounded-lg flex items-center gap-2">
                <svg
                  className="w-5 h-5 text-white"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
                  />
                </svg>
                {/* <span className="text-sm text-white font-medium">
                  Screen Share
                </span> */}
              </div>

              {/* Camera - Picture in Picture */}
              <div
                className={`absolute w-32 h-20 landscape:w-40 landscape:h-24 md:w-64 md:h-36 bg-gray-800 rounded-lg overflow-hidden border-2 border-gray-700 shadow-xl cursor-move touch-none ${!cameraStreamRef.current ? "hidden" : ""}`}
                style={{
                  left: `${pipPosition.x}px`,
                  top: `${pipPosition.y}px`,
                }}
                onMouseDown={handlePipMouseDown}
                onTouchStart={handlePipTouchStart}
              >
                <video
                  ref={pipVideoRef}
                  autoPlay
                  playsInline
                  muted={isMuted}
                  className="w-full h-full object-cover"
                />
                {!isLoading && isMuted && (
                  <button
                    onClick={toggleMute}
                    className="absolute bottom-2 right-2 bg-white hover:bg-gray-100 text-black p-2 rounded-lg font-semibold transition shadow-lg"
                    title="Unmute"
                  >
                    <svg
                      className="w-4 h-4"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                        clipRule="evenodd"
                      />
                    </svg>
                  </button>
                )}
              </div>

              {/* Bottom Control Bar - Inside video area */}
              <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-30">
                <div className="bg-black/80 backdrop-blur-lg rounded-full px-2 landscape:px-3 md:px-6 py-1.5 landscape:py-2 md:py-3 flex items-center gap-1.5 landscape:gap-2 md:gap-4 shadow-2xl">
                  <button
                    onClick={toggleMute}
                    className={`p-1.5 landscape:p-2 md:p-3 rounded-full transition-all ${
                      isMuted
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-white/20 hover:bg-white/30"
                    }`}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? (
                      <svg
                        className="w-3.5 h-3.5 landscape:w-4 landscape:h-4 md:w-6 md:h-6 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-3.5 h-3.5 landscape:w-4 landscape:h-4 md:w-6 md:h-6 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    className="p-1.5 landscape:p-2 md:p-3 rounded-full bg-white/20 hover:bg-white/30 transition-all"
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  >
                    {isFullscreen ? (
                      <svg
                        className="w-3.5 h-3.5 landscape:w-4 landscape:h-4 md:w-6 md:h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-3.5 h-3.5 landscape:w-4 landscape:h-4 md:w-6 md:h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={leaveStream}
                    className="p-1.5 landscape:p-2 md:p-3 rounded-full bg-red-600 hover:bg-red-700 transition-all"
                    title="Leave Stream"
                  >
                    <svg
                      className="w-3.5 h-3.5 landscape:w-4 landscape:h-4 md:w-6 md:h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Camera - Full View */
            <div
              ref={videoContainerRef}
              className="w-full h-full bg-black relative"
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted={isMuted}
                className={`w-full h-full object-cover ${isAudioOnly ? "hidden" : ""}`}
              />
              {isAudioOnly && !isLoading && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-900 gap-6">
                  <div className="relative w-32 h-32">
                    {isSpeaking && (
                      <span className="absolute inset-0 rounded-full animate-ping bg-primary/30" />
                    )}
                    <div className="w-full h-full rounded-full overflow-hidden ring-4 ring-primary/50">
                      <img
                        src={getAvatarUrl(streamerInfo?.avatar, streamerInfo?.username)}
                        alt={streamerInfo?.username || "AI Streamer"}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <span className="absolute bottom-1 right-1 w-5 h-5 bg-accent-red rounded-full border-2 border-gray-900 flex items-center justify-center">
                      <span className="w-2 h-2 bg-white rounded-full live-dot" />
                    </span>
                  </div>
                  <div className="text-center">
                    <p className="text-white font-bold text-lg">{streamerInfo?.username || "AI Streamer"}</p>
                    <p className="text-gray-400 text-sm mt-1">Audio-only stream</p>
                  </div>
                  {isMuted && (
                    <button
                      onClick={toggleMute}
                      className="px-5 py-2.5 bg-primary hover:bg-primary/90 text-white rounded-full font-semibold text-sm transition flex items-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z" clipRule="evenodd" />
                      </svg>
                      Unmute to hear
                    </button>
                  )}
                </div>
              )}
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-800">
                  <div className="text-center">
                    <div className="w-16 h-16 border-4 border-gray-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                    <p className="text-white font-medium">
                      Connecting to stream...
                    </p>
                    <p className="text-gray-400 text-sm mt-2">Please wait</p>
                  </div>
                </div>
              )}

              {/* Bottom Control Bar - Inside video area */}
              <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-30">
                <div className="bg-black/80 backdrop-blur-lg rounded-full px-2 landscape:px-3 md:px-6 py-1.5 landscape:py-2 md:py-3 flex items-center gap-1.5 landscape:gap-2 md:gap-4 shadow-2xl">
                  <button
                    onClick={toggleMute}
                    className={`p-1.5 landscape:p-2 md:p-3 rounded-full transition-all ${
                      isMuted
                        ? "bg-red-600 hover:bg-red-700"
                        : "bg-white/20 hover:bg-white/30"
                    }`}
                    title={isMuted ? "Unmute" : "Mute"}
                  >
                    {isMuted ? (
                      <svg
                        className="w-3.5 h-3.5 landscape:w-4 landscape:h-4 md:w-6 md:h-6 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM12.293 7.293a1 1 0 011.414 0L15 8.586l1.293-1.293a1 1 0 111.414 1.414L16.414 10l1.293 1.293a1 1 0 01-1.414 1.414L15 11.414l-1.293 1.293a1 1 0 01-1.414-1.414L13.586 10l-1.293-1.293a1 1 0 010-1.414z"
                          clipRule="evenodd"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-3.5 h-3.5 landscape:w-4 landscape:h-4 md:w-6 md:h-6 text-white"
                        fill="currentColor"
                        viewBox="0 0 20 20"
                      >
                        <path
                          fillRule="evenodd"
                          d="M9.383 3.076A1 1 0 0110 4v12a1 1 0 01-1.707.707L4.586 13H2a1 1 0 01-1-1V8a1 1 0 011-1h2.586l3.707-3.707a1 1 0 011.09-.217zM14.657 2.929a1 1 0 011.414 0A9.972 9.972 0 0119 10a9.972 9.972 0 01-2.929 7.071 1 1 0 01-1.414-1.414A7.971 7.971 0 0017 10c0-2.21-.894-4.208-2.343-5.657a1 1 0 010-1.414zm-2.829 2.828a1 1 0 011.415 0A5.983 5.983 0 0115 10a5.984 5.984 0 01-1.757 4.243 1 1 0 01-1.415-1.415A3.984 3.984 0 0013 10a3.983 3.983 0 00-1.172-2.828 1 1 0 010-1.415z"
                          clipRule="evenodd"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={toggleFullscreen}
                    className="p-1.5 landscape:p-2 md:p-3 rounded-full bg-white/20 hover:bg-white/30 transition-all"
                    title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}
                  >
                    {isFullscreen ? (
                      <svg
                        className="w-3.5 h-3.5 landscape:w-4 landscape:h-4 md:w-6 md:h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-3.5 h-3.5 landscape:w-4 landscape:h-4 md:w-6 md:h-6 text-white"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
                        />
                      </svg>
                    )}
                  </button>
                  <button
                    onClick={leaveStream}
                    className="p-1.5 landscape:p-2 md:p-3 rounded-full bg-red-600 hover:bg-red-700 transition-all"
                    title="Leave Stream"
                  >
                    <svg
                      className="w-3.5 h-3.5 landscape:w-4 landscape:h-4 md:w-6 md:h-6 text-white"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                      />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Chat - Below video on mobile, sidebar on desktop */}
        <div
          className={`bg-gray-900 border-t md:border-t-0 md:border-l border-gray-800 flex-shrink-0 transition-all duration-300 overflow-hidden ${showMobileChat ? "h-1/3 md:h-full md:w-80 w-full" : "h-0 w-0 border-0"}`}
        >
          <div className="h-full flex flex-col w-full">
            <div className="flex items-center justify-between p-4 border-b border-gray-700 md:flex hidden">
              <h3 className="text-lg font-semibold text-white">Live Chat</h3>
              <button
                onClick={() => setShowMobileChat(false)}
                className="text-gray-400 hover:text-white transition"
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
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-hidden">
              <ChatPanel
                socket={socket}
                streamId={params.id as string}
                username={user?.username || "Anonymous"}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
    // </div>
  );
};

export default WatchPage;
