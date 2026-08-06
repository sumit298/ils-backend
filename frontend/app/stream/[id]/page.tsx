"use client";
import React, { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";
import { Device, types } from "mediasoup-client";
import { io, Socket } from "socket.io-client";
import toast from "react-hot-toast";
import { api, useAuth } from "@/lib/AuthContext";
import ChatPanel from "@/components/ChatPanel";
import BottomControlBar from "@/components/BottomControlBar";
import ViewerStats from "@/components/ViewerStats";
import MediaStatsOverlay from "@/components/MediaStatsOverlay";
import { RECORDING_CONFIG, getRecorderOptions } from "@/lib/recordingConfig";

const StreamsPage = ({ isStreamer = true }) => {
  const params = useParams();
  const { user } = useAuth();
  const videoRef = useRef<HTMLVideoElement>(null);
  const chunkIndexRef = useRef<number>(0); // Ref to track chunk index for recording
  // Refs so the onended callback always sees the latest values (avoids stale closure)
  const videoProducerRef = useRef<types.Producer | null>(null);
  const audioProducerRef = useRef<types.Producer | null>(null);
  const screenProducersRef = useRef<{
    video: types.Producer | null;
    audio: types.Producer | null;
  } | null>(null);
  const screenStreamRef = useRef<MediaStream | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [permissions, setPermissions] = useState({
    camera: false,
    microphone: false,
  });
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOff, setIsCameraOff] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [device, setDevice] = useState<Device | null>(null);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [producer, setProducer] = useState<{
    video: types.Producer | null;
    audio: types.Producer | null;
  } | null>(null);
  const [connectionStatus, setConnectionStatus] =
    useState<string>("disconnected");
  const [viewerCount, setViewerCount] = useState(0);
  const [duration, setDuration] = useState(0);
  const [streamStartTime, setStreamStartTime] = useState(null);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [connectionTested, setConnectionTested] = useState(false);
  const [streamingStatus, setStreamingStatus] = useState<
    "idle" | "connecting" | "live" | "failed"
  >("idle");
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [screenStream, setScreenStream] = useState<MediaStream | null>(null);
  const [screenProducers, setScreenProducers] = useState<{
    video: types.Producer | null;
    audio: types.Producer | null;
  } | null>(null);
  const [sendTransport, setSendTransport] = useState<types.Transport | null>(
    null,
  ); //store transport for reuse
  const [isMobile, setIsMobile] = useState(false);
  const [showEndStreamModal, setShowEndStreamModal] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [mediaRecorder, setMediaRecorder] = useState<MediaRecorder | null>(
    null,
  );
  const [isRecording, setIsRecording] = useState(false);
  const recordingIdRef = useRef<string | null>(null);
  const recordingStartTimeRef = useRef<number | null>(null);
  const [availableDevices, setAvailableDevices] = useState<{
    cameras: MediaDeviceInfo[];
    microphones: MediaDeviceInfo[];
  }>({ cameras: [], microphones: [] });
  const [selectedDevices, setSelectedDevices] = useState<{
    cameraId: string;
    microphoneId: string;
  }>({ cameraId: "", microphoneId: "" });
  const [streamInfo, setStreamInfo] = useState<{
    title?: string;
    category?: string;
  } | null>(null);
  const [showMobileChat, setShowMobileChat] = useState(false);

  useEffect(() => {
    // Detect mobile device
    const checkMobile = () => {
      const userAgent = navigator.userAgent.toLowerCase();
      const isMobileDevice =
        /android|webos|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(
          userAgent,
        );
      setIsMobile(isMobileDevice);
    };
    checkMobile();

    // Fetch stream info
    const fetchStreamInfo = async () => {
      try {
        const { data } = await api.get(`/api/streams/${params.id}`);
        setStreamInfo(data.stream);
      } catch (error) {
        console.error("Failed to fetch stream info:", error);
      }
    };
    fetchStreamInfo();
  }, [params.id]);

  useEffect(() => {
    if (!isStreaming) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "You are currently live. End your stream before leaving.";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isStreaming]);

  useEffect(() => {
    const token = sessionStorage.getItem("accessToken") || "";
    const newSocket = io(
      process.env.NEXT_PUBLIC_SOCKET_URL || "http://localhost:3001",
      {
        withCredentials: true, // Sends httpOnly cookies automatically
        transports: ["websocket", "polling"],
        auth: { token },
      },
    );
    newSocket.on("connect", () => {
      console.log("Connected to server", newSocket.id);
      setConnectionStatus("connected");
    });

    newSocket.on("disconnect", () => {
      console.log("Disconnected from server");
      setConnectionStatus("disconnected");
    });

    newSocket.on("error", (error) => {
      console.error("Socket error", error);
      setConnectionStatus("error");
    });

    setSocket(newSocket);

    return () => {
      newSocket.off("connect");
      newSocket.off("disconnect");
      newSocket.off("error");
      newSocket.close();
    };
  }, []);

  useEffect(() => {
    if (socket) {
      const handleViewerCount = (count: number) => {
        console.log("🎥 STREAMER received viewer-count:", count, typeof count);
        setViewerCount(count);
      };

      const handleStreamStartTime = (data: any) => {
        console.log("⏱️ Received stream start time:", data.startTime);
        setStreamStartTime(data.startTime);
      };

      socket.on("viewer-count", handleViewerCount);
      socket.on("stream-start-time", handleStreamStartTime);

      return () => {
        socket.off("viewer-count", handleViewerCount);
        socket.off("stream-start-time", handleStreamStartTime);
      };
    }
  }, [socket]);

  useEffect(() => {
    if (!streamStartTime) {
      setDuration(0);
      return;
    }

    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - streamStartTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, [streamStartTime]);

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  };

  const toggleMute = () => {
    if (stream) {
      stream.getAudioTracks()[0].enabled = isMuted;
      setIsMuted(!isMuted);
    }
  };

  const toggleCamera = () => {
    if (stream) {
      stream.getVideoTracks()[0].enabled = isCameraOff;
      setIsCameraOff(!isCameraOff);
    }
  };

  const initializeMediaSoup = async () => {
    try {
      setIsTestingConnection(true);
      setConnectionStatus("connecting");

      console.log(
        "Testing connection to:",
        process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_SOCKET_URL,
      );

      const routerCapabilities = (await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Connection timeout - server not responding")),
          10000,
        );
        socket?.emit(
          "get-router-capabilities",
          { roomId: params.id },
          (response: any) => {
            clearTimeout(timeout);
            if (!response) {
              reject(new Error("No response from server"));
            } else {
              resolve(response);
            }
          },
        );
      })) as any;

      console.log("Router capabilities received");

      const newDevice = new Device();
      await newDevice.load({ routerRtpCapabilities: routerCapabilities });
      setDevice(newDevice);
      setConnectionStatus("connected");
      setConnectionTested(true);
      toast.success("Connection test successful! You can now go live.", {
        position: "bottom-left",
      });
    } catch (error: any) {
      console.error("MediaSoup initialization failed:", error);
      setConnectionStatus("failed");
      // setConnectionTested(false);
      toast.error(
        error.message ||
          "Connection test failed. Please check your network and try again.",
        { position: "bottom-left" },
      );
    } finally {
      setIsTestingConnection(false);
    }
  };

  const requestPermissions = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });

      setStream(mediaStream);
      setPermissions({ camera: true, microphone: true });

      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Get available devices
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput");
      const microphones = devices.filter(
        (device) => device.kind === "audioinput",
      );

      console.log("Available cameras:", cameras);
      console.log("Available microphones:", microphones);

      setAvailableDevices({ cameras, microphones });

      // Set default selected devices
      const videoTrack = mediaStream.getVideoTracks()[0];
      const audioTrack = mediaStream.getAudioTracks()[0];
      setSelectedDevices({
        cameraId:
          videoTrack.getSettings().deviceId || cameras[0]?.deviceId || "",
        microphoneId:
          audioTrack.getSettings().deviceId || microphones[0]?.deviceId || "",
      });
    } catch (error) {
      console.error("Permission denied:", error);
    }
  };

  const changeCamera = async (deviceId: string) => {
    if (!stream) return;

    try {
      const audioTrack = stream.getAudioTracks()[0];
      const audioEnabled = audioTrack?.enabled ?? true;

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: deviceId } },
        audio: { deviceId: { exact: selectedDevices.microphoneId } },
      });

      // Restore audio state
      const newAudioTrack = newStream.getAudioTracks()[0];
      if (newAudioTrack) {
        newAudioTrack.enabled = audioEnabled;
      }

      // Stop old tracks
      stream.getTracks().forEach((track) => track.stop());

      setStream(newStream);
      setSelectedDevices((prev) => ({ ...prev, cameraId: deviceId }));

      const newVideoTrack = newStream.getVideoTracks()[0];
      if (videoProducerRef.current && newVideoTrack) {
        await videoProducerRef.current.replaceTrack({ track: newVideoTrack });
      }

      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (error) {
      console.error("Failed to change camera:", error);
      toast.error("Failed to change camera", { position: "bottom-left" });
    }
  };

  const changeMicrophone = async (deviceId: string) => {
    if (!stream) return;

    try {
      const videoTrack = stream.getVideoTracks()[0];
      const audioTrack = stream.getAudioTracks()[0];
      const videoEnabled = videoTrack?.enabled ?? true;
      const audioEnabled = audioTrack?.enabled ?? true;

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: { exact: selectedDevices.cameraId } },
        audio: { deviceId: { exact: deviceId } },
      });

      // Restore track states
      const newVideoTrack = newStream.getVideoTracks()[0];
      const newAudioTrack = newStream.getAudioTracks()[0];
      if (newVideoTrack) {
        newVideoTrack.enabled = videoEnabled;
      }
      if (newAudioTrack) {
        newAudioTrack.enabled = audioEnabled;
      }

      // Stop old tracks
      stream.getTracks().forEach((track) => track.stop());

      setStream(newStream);
      setSelectedDevices((prev) => ({ ...prev, microphoneId: deviceId }));

      if (audioProducerRef.current && newAudioTrack) {
        await audioProducerRef.current.replaceTrack({ track: newAudioTrack });
      }
      if (videoRef.current) {
        videoRef.current.srcObject = newStream;
      }
    } catch (error) {
      console.error("Failed to change microphone:", error);
      toast.error("Failed to change microphone", { position: "bottom-left" });
    }
  };

  const startStream = async () => {
    if (isStarting) return;

    if (!stream || !device || !socket) {
      toast.error("Please enable camera and test connection first", {
        position: "bottom-left",
      });
      return;
    }

    if (!connectionTested || connectionStatus !== "connected") {
      toast.error("Please test connection before going live", {
        position: "bottom-left",
      });
      return;
    }

    setIsStarting(true);

    try {
      const transportInfo = (await new Promise((resolve, reject) => {
        const timeout = setTimeout(
          () => reject(new Error("Transport creation timeout")),
          10000,
        );
        socket.emit(
          "create-transport",
          { roomId: params.id, direction: "send" },
          (response: any) => {
            clearTimeout(timeout);
            resolve(response);
          },
        );
      })) as any;

      console.log("Transport info received:", transportInfo); // Add this

      if (!transportInfo || !transportInfo.id) {
        throw new Error("Invalid transport info received");
      }

      const sendTransport = device.createSendTransport(transportInfo);
      setSendTransport(sendTransport);

      sendTransport.on(
        "connect",
        async ({ dtlsParameters }, callback, errback) => {
          try {
            console.log("🔌 Connecting transport...", {
              transportId: sendTransport.id,
              roomId: params.id,
            });

            await new Promise((resolve, reject) => {
              const timeout = setTimeout(
                () => reject(new Error("Connect transport timeout")),
                10000,
              );
              socket.emit(
                "connect-transport",
                {
                  roomId: params.id,
                  transportId: sendTransport.id,
                  dtlsParameters,
                },
                (response: any) => {
                  clearTimeout(timeout);
                  if (response?.error) {
                    console.error(
                      "❌ Transport connect error:",
                      response.error,
                    );
                    reject(new Error(response.error));
                  } else {
                    console.log("✅ Transport connected successfully");
                    resolve(response);
                  }
                },
              );
            });

            callback();
          } catch (error: any) {
            console.error("❌ Connect transport exception:", error);
            errback(error);
          }
        },
      );

      sendTransport.on(
        "produce",
        async ({ kind, rtpParameters, appData }, callback, errback) => {
          console.log("Producing...", {
            kind,
            rtpParameters,
            isScreenShare: appData?.isScreenShare,
          });

          socket.emit(
            "produce",
            {
              transportId: sendTransport.id,
              kind,
              rtpParameters,
              roomId: params.id,
              isScreenShare: appData?.isScreenShare || false,
            },
            (response: any) => {
              console.log("Produce response:", response);

              if (response.error) {
                console.error("Produce error:", response.error);
                errback(new Error(response.error));
                return; // Don't call callback on error
              }

              callback({ id: response.producerId });
            },
          );
        },
      );

      sendTransport.on("connectionstatechange", (state) => {
        console.log("🔗 Transport connection state:", state);

        if (state === "connected") {
          console.log("✅ Transport fully connected, stream is live!");
          setStreamingStatus("live");
          toast.success("Stream is now live!", { position: "bottom-left" });
        } else if (state === "connecting") {
          setStreamingStatus("connecting");
        }
      });

      const videoTrack = stream.getVideoTracks()[0];
      const videoProducer = await sendTransport.produce({ track: videoTrack });
      console.log("video producer created", videoProducer.id);

      const audioTrack = stream.getAudioTracks()[0];
      const audioProducer = await sendTransport.produce({ track: audioTrack });

      console.log("audio producer created", audioProducer.id);
      videoProducerRef.current = videoProducer;
      audioProducerRef.current = audioProducer;
      setProducer({ video: videoProducer, audio: audioProducer });

      await api.patch(`/api/streams/${params.id}`, { isLive: true });

      setIsStreaming(true);
      toast.success("Stream started successfully", { position: "bottom-left" });
    } catch (error) {
      console.error("Failed to start stream", error);
      setConnectionStatus("failed");
      setConnectionTested(false);
      setIsStreaming(false);
      toast.error("Failed to start stream", { position: "bottom-left" });
    } finally {
      setIsStarting(false);
    }
  };

  const stopStream = async () => {
    if (isStopping) return;

    setShowEndStreamModal(false);
    setIsStopping(true);

    try {
      if (mediaRecorder && isRecording && recordingIdRef.current) {
        const id = recordingIdRef.current;
        const startTime = recordingStartTimeRef.current;
        mediaRecorder.onstop = async () => {
          const durationMs = startTime ? Date.now() - startTime : 0;
          try {
            await api.post("/api/vods/recording-end", {
              streamId: params.id,
              recordingId: id,
              durationMs,
            });
            console.log("Recording ended successfully");
          } catch (err) {
            console.error("Failed to end recording:", err);
          }
        };
        mediaRecorder.stop();
        recordingIdRef.current = null;
        recordingStartTimeRef.current = null;
        setIsRecording(false);
      }

      if (producer) {
        producer.video?.close();
        producer.audio?.close();
        setProducer(null);
      }

      if (isScreenSharing) {
        stopScreenShare();
      }

      const { data } = await api.post(`/api/streams/${params.id}/end`);

      // Notify backend that stream ended
      socket?.emit("stream-ended", { streamId: params.id });
      console.log("🎥 STREAMER received duration:", data.duration);
      setStreamStartTime(null);
      setIsStreaming(false);
      if (data.duration && !isNaN(data.duration)) {
        const finalDurationSeconds = data.duration
          ? Math.floor(data.duration / 1000)
          : duration;
        setDuration(finalDurationSeconds);
        toast.success(
          `Stream ended. Duration: ${formatDuration(finalDurationSeconds)}`,
          { position: "bottom-left" },
        );
      } else {
        // Fallback: use current duration state
        toast.success(`Stream ended. Duration: ${formatDuration(duration)}`, {
          position: "bottom-left",
        });
      }

      // Redirect to dashboard after stream ends
      setTimeout(() => {
        window.location.href = "/dashboard";
      }, 2000);
    } catch (error) {
      console.error("Failed to stop stream:", error);
      toast.error("Failed to end stream", { position: "bottom-left" });
    } finally {
      setIsStopping(false);
    }
  };

  const toggleRecording = async () => {
    if (isRecording &&mediaRecorder && recordingIdRef.current) {
      const id = recordingIdRef.current;
      const startTime = recordingStartTimeRef.current;
      mediaRecorder.onstop = async () => {
        const durationMs = startTime ? Date.now() - startTime : 0;
        try {
          await api.post("/api/vods/recording-end", {
            streamId: params.id,
            recordingId: id,
            durationMs,
          });
          console.log("Recording ended successfully");
        } catch (err) {
          console.error("Failed to end recording:", err);
        }
      };
      mediaRecorder.stop();
      setMediaRecorder(null);
      recordingIdRef.current = null;
      recordingStartTimeRef.current = null;
      toast.success("Recording stopped", { position: "bottom-left" });
      setIsRecording(false);
    }
    else {
      startRecording();
    }
  };

  const makeChunkHandler =
    (recordingIdSource: () => string | null) => async (e: BlobEvent) => {
      if (e.data.size === 0) return;
      const index = chunkIndexRef.current++;
      const blob = e.data;
      const recordingId = recordingIdSource();
      if(!recordingId) {
        return;
      }

      const tryUpload = async (attempts = 0): Promise<void> => {
        const formData = new FormData();
        formData.append("chunk", blob);
        formData.append("streamId", params.id as string);
        formData.append("recordingId", recordingId);
        formData.append("chunkIndex", index.toString());
        try {
          await api.post("/api/vods/upload-chunk", formData, {
            headers: { "Content-Type": "multipart/form-data" },
          });
        } catch (error) {
          if (attempts < 3) {
            await new Promise((resolve) =>
              setTimeout(resolve, 1000 * (attempts + 1)),
            ); // Exponential backoff
            return tryUpload(attempts + 1);
          }
          console.error("Upload chunk failed:", error);
        }
      };
      tryUpload();
    };

  const startRecording = () => {
    // Use screen stream if screen sharing is active, otherwise use camera stream
    const recordStream =
      isScreenSharing && screenStream ? screenStream : stream;
    if (!recordStream) return;

    const recordingId = `${params.id}-${Date.now()}`;
    recordingIdRef.current = recordingId;
    recordingStartTimeRef.current = Date.now();

    const recorderOptions = getRecorderOptions();
    console.log(
      "🎥 Recording with:",
      recorderOptions.mimeType,
      "id:",
      recordingId,
    );

    const recorder = new MediaRecorder(recordStream, recorderOptions);
    chunkIndexRef.current = 0; // Reset chunk index for new recording
    recorder.ondataavailable = makeChunkHandler(() => recordingIdRef.current);
    recorder.onerror = () => toast.error("Recording error, please restart recording", { position: "bottom-left" });

    recorder.start(RECORDING_CONFIG.chunks.intervalMs);
    setMediaRecorder(recorder);
    setIsRecording(true);
  };

  const startScreenShare = async () => {
    if (!sendTransport || !isStreaming) {
      toast.error("Please start streaming first", { position: "bottom-left" });
      return;
    }

    try {
      const screenMediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });

      setScreenStream(screenMediaStream);
      screenStreamRef.current = screenMediaStream;

      // Switch recording to screen share only if recording is active
      if (isRecording && mediaRecorder) {
        mediaRecorder.stop();

        // Finalize the camera recording before starting screen recording
        if (recordingIdRef.current) {
          const durationMs = recordingStartTimeRef.current
            ? Date.now() - recordingStartTimeRef.current
            : 0;
          api
            .post("/api/vods/recording-end", {
              streamId: params.id,
              recordingId: recordingIdRef.current,
              durationMs,
            })
            .catch((err) =>
              console.error("recording-end (camera→screen) failed:", err),
            );
        }

        const screenRecordingId = `${params.id}-${Date.now()}`;
        recordingIdRef.current = screenRecordingId;
        recordingStartTimeRef.current = Date.now();

        const recorderOptions = getRecorderOptions();
        console.log(
          "🎥 Screen recording with:",
          recorderOptions.mimeType,
          "id:",
          screenRecordingId,
        );

        const screenRecorder = new MediaRecorder(
          screenMediaStream,
          recorderOptions,
        );

        chunkIndexRef.current = 0; // Reset chunk index for new recording
        screenRecorder.ondataavailable = makeChunkHandler(
          () => recordingIdRef.current,
        );
        screenRecorder.onerror = () => toast.error("Recording error, please restart recording", { position: "bottom-left" });
        screenRecorder.start(RECORDING_CONFIG.chunks.intervalMs);
        setMediaRecorder(screenRecorder);
      }

      // produce screen video
      const screenVideoTrack = screenMediaStream.getVideoTracks()[0];
      const screenVideoProducer = await sendTransport.produce({
        track: screenVideoTrack,
        appData: { isScreenShare: true },
      });
      console.log("Screen video producer created:", screenVideoProducer.id);

      // produce system audio if available
      let screenAudioProducer = null;
      if (screenMediaStream.getAudioTracks().length > 0) {
        const screenAudioTrack = screenMediaStream.getAudioTracks()[0];
        screenAudioProducer = await sendTransport.produce({
          track: screenAudioTrack,
          appData: { isScreenShare: true },
        });
        console.log("Screen audio producer created:", screenAudioProducer.id);
      }
      const producers = {
        video: screenVideoProducer,
        audio: screenAudioProducer,
      };
      setScreenProducers(producers);
      screenProducersRef.current = producers;
      setIsScreenSharing(true);

      screenVideoTrack.onended = () => {
        console.log("Screen share track ended (browser stop button)");
        // Use refs to avoid stale closure — state values may be null here
        const prods = screenProducersRef.current;
        const scStream = screenStreamRef.current;
        if (prods?.video) {
          socket?.emit("close-producer", {
            roomId: params.id,
            producerId: prods.video.id,
          });
          prods.video.close();
        }
        if (prods?.audio) {
          socket?.emit("close-producer", {
            roomId: params.id,
            producerId: prods.audio.id,
          });
          prods.audio.close();
        }
        scStream?.getTracks().forEach((t) => t.stop());
        screenProducersRef.current = null;
        screenStreamRef.current = null;
        setScreenProducers(null);
        setScreenStream(null);
        setIsScreenSharing(false);
        toast.success("Screen sharing stopped", { position: "bottom-left" });
      };
      toast.success("Screen sharing started", { position: "bottom-left" });
    } catch (error: any) {
      console.log("Screen share cancelled or failed:", error.name);
      if (error.name === "NotAllowedError") {
        toast.error("Screen sharing permission denied", {
          position: "bottom-left",
        });
      } else if (error.name === "NotFoundError") {
        toast.error("No screen available to share", {
          position: "bottom-left",
        });
      } else if (error.name !== "AbortError") {
        // AbortError means user cancelled, don't show error for that
        toast.error("Failed to start screen sharing", {
          position: "bottom-left",
        });
      }
    }
  };

  const stopScreenShare = () => {
    if (screenProducers) {
      if (screenProducers.video) {
        socket?.emit("close-producer", {
          roomId: params.id,
          producerId: screenProducers.video.id,
        });
        screenProducers.video.close();
      }
      if (screenProducers.audio) {
        socket?.emit("close-producer", {
          roomId: params.id,
          producerId: screenProducers.audio.id,
        });
        screenProducers.audio.close();
      }
      setScreenProducers(null);
      screenProducersRef.current = null;
    }

    if (screenStream) {
      screenStream.getTracks().forEach((track) => track.stop());
      setScreenStream(null);
      screenStreamRef.current = null;
    }

    // Switch recording back to camera only if recording is active
    if (isRecording && mediaRecorder && stream) {
      mediaRecorder.stop();

      const cameraRecordingId = `${params.id}-${Date.now()}`;
      recordingIdRef.current = cameraRecordingId;
      recordingStartTimeRef.current = Date.now();

      const recorderOptions = getRecorderOptions();

      const cameraRecorder = new MediaRecorder(stream, recorderOptions);
      chunkIndexRef.current = 0; // Reset chunk index for new recording
      cameraRecorder.ondataavailable = makeChunkHandler(
        () => recordingIdRef.current,
      );
      cameraRecorder.onerror = () => toast.error("Recording error, Please restart recording", { position: "bottom-left" });
      cameraRecorder.start(RECORDING_CONFIG.chunks.intervalMs);
      setMediaRecorder(cameraRecorder);
    }

    setIsScreenSharing(false);
    toast.success("Screen sharing stopped", { position: "bottom-left" });
  };

  useEffect(() => {
    if (
      permissions.camera &&
      socket &&
      !connectionTested &&
      connectionStatus === "connected"
    ) {
      initializeMediaSoup();
    }
  }, [permissions.camera, socket, connectionStatus]);

  const copyStreamLink = () => {
    const link = `${window.location.origin}/watch/${params.id}`;
    navigator.clipboard.writeText(link);
    toast.success("Stream link copied to clipboard", {
      position: "bottom-left",
    });
  };

  return (
    <div className="fixed inset-0 bg-background flex flex-col">
      {/* End Stream Confirmation Modal */}
      {showEndStreamModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-2xl p-8 max-w-sm w-full text-center border border-border shadow-card">
            <div className="w-14 h-14 bg-accent-red/15 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-7 h-7 text-accent-red"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-bold mb-1 text-text-primary">
              End Stream?
            </h2>
            <p className="text-text-tertiary text-sm mb-6">
              This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowEndStreamModal(false)}
                className="flex-1 bg-surface border border-border hover:bg-elevated hover:border-border-hover text-text-primary px-4 py-2.5 rounded-xl text-sm font-semibold transition"
              >
                Cancel
              </button>
              <button
                onClick={stopStream}
                disabled={isStopping}
                className="flex-1 btn-danger px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50"
              >
                {isStopping ? "Ending..." : "End Stream"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mobile Chat Drawer */}
      <div
        className={`fixed inset-0 z-40 lg:hidden transition-opacity duration-300 ${showMobileChat ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`}
      >
        <div
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
          onClick={() => setShowMobileChat(false)}
        />
        <div
          className={`absolute top-0 right-0 h-full w-80 bg-surface shadow-card transition-transform duration-300 flex flex-col border-l border-border ${showMobileChat ? "translate-x-0" : "translate-x-full"}`}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="text-sm font-semibold text-text-primary">
              Live Chat
            </span>
            <button
              onClick={() => setShowMobileChat(false)}
              className="text-text-tertiary hover:text-text-primary transition p-1"
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
              username={user?.username || "Streamer"}
              isStreamer={true}
            />
          </div>
        </div>
      </div>

      {/* Top Bar */}
      <div className="shrink-0 bg-surface/80 backdrop-blur-sm border-b border-border z-10">
        <div className="px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a
              href="/dashboard"
              className="flex items-center gap-1.5 text-text-tertiary hover:text-text-primary transition text-sm"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M15 19l-7-7 7-7"
                />
              </svg>
              <span className="hidden sm:inline">Dashboard</span>
            </a>
            <div className="w-px h-4 bg-border" />
            <span className="text-sm font-medium text-text-primary truncate max-w-40 sm:max-w-xs">
              {streamInfo?.title || "Stream Studio"}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isStreaming && (
              <ViewerStats
                viewerCount={viewerCount}
                duration={formatDuration(duration)}
                isLive={isStreaming}
              />
            )}
            <button
              onClick={() => setShowMobileChat(true)}
              className="lg:hidden flex items-center gap-1.5 bg-surface hover:bg-elevated text-text-secondary hover:text-text-primary px-3 py-1.5 rounded-lg text-xs font-medium transition border border-border"
            >
              <svg
                className="w-4 h-4"
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
              Chat
            </button>
          </div>
        </div>
      </div>

      {/* Main Content — OBS style: video+controls left, chat right */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left — Video + Controls */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Video — fills all remaining height */}
          <div className="flex-1 relative bg-black min-h-0">
            <video
              ref={videoRef}
              autoPlay
              muted
              className="w-full h-full object-cover flip"
            />

            {/* No camera placeholder */}
            {!permissions.camera && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-elevated">
                <div className="w-16 h-16 rounded-full bg-surface flex items-center justify-center border border-border">
                  <svg
                    className="w-8 h-8 text-text-muted"
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
                </div>
                <p className="text-text-muted text-sm">
                  Camera preview will appear here
                </p>
              </div>
            )}

            {/* LIVE badge */}
            {isStreaming && (
              <div className="absolute top-3 left-3 bg-accent-red text-white px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1.5 shadow-lg live-glow">
                <span className="w-1.5 h-1.5 bg-white rounded-full live-dot" />
                LIVE
              </div>
            )}

            {/* Media stats overlay (live only) */}
            {isStreaming && (
              <div className="absolute top-3 right-3">
                <MediaStatsOverlay
                  videoProducerRef={videoProducerRef}
                  audioProducerRef={audioProducerRef}
                />
              </div>
            )}

            {/* Connection status badge (pre-live) */}
            {!isStreaming && permissions.camera && (
              <div className="absolute top-3 right-3">
                <div
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium backdrop-blur-sm ${
                    connectionStatus === "connected"
                      ? "bg-primary/20 text-primary border border-primary/30"
                      : connectionStatus === "connecting" || isTestingConnection
                        ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                        : connectionStatus === "failed"
                          ? "bg-accent-red/20 text-accent-red border border-accent-red/30"
                          : "bg-black/50 text-text-muted border border-border"
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      connectionStatus === "connected"
                        ? "bg-primary"
                        : connectionStatus === "connecting" ||
                            isTestingConnection
                          ? "bg-yellow-400 animate-pulse"
                          : connectionStatus === "failed"
                            ? "bg-accent-red"
                            : "bg-text-muted"
                    }`}
                  />
                  {isTestingConnection
                    ? "Testing..."
                    : connectionStatus === "connected"
                      ? "Ready"
                      : connectionStatus === "failed"
                        ? "Failed"
                        : "Disconnected"}
                </div>
              </div>
            )}
          </div>

          {/* Controls bar — fixed height below video */}
          <div className="shrink-0 bg-surface border-t border-border">
            {!permissions.camera ? (
              /* Step 1: Enable camera */
              <div className="px-4 py-3 flex items-center gap-4">
                <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center shrink-0 border border-primary/20">
                  <svg
                    className="w-4 h-4 text-primary"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-text-primary font-medium text-sm">
                    Camera & Microphone required
                  </p>
                  <p className="text-text-muted text-xs">
                    Grant access to preview your stream
                  </p>
                </div>
                <button
                  onClick={requestPermissions}
                  className="shrink-0 btn-primary px-5 py-2 rounded-lg text-sm font-semibold"
                >
                  Enable
                </button>
              </div>
            ) : !isStreaming ? (
              /* Step 2: Device selection + go live */
              <div className="px-4 py-3 flex items-center gap-3 flex-wrap">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-widest shrink-0">
                  Devices
                </span>
                {availableDevices.cameras.length > 0 && (
                  <select
                    value={selectedDevices.cameraId}
                    onChange={(e) => changeCamera(e.target.value)}
                    className="flex-1 min-w-32 bg-elevated text-text-primary text-xs px-3 py-2 rounded-lg border border-border focus:outline-none focus:border-primary transition-colors"
                  >
                    {availableDevices.cameras.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Camera ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                )}
                {availableDevices.microphones.length > 0 && (
                  <select
                    value={selectedDevices.microphoneId}
                    onChange={(e) => changeMicrophone(e.target.value)}
                    className="flex-1 min-w-32 bg-elevated text-text-primary text-xs px-3 py-2 rounded-lg border border-border focus:outline-none focus:border-primary transition-colors"
                  >
                    {availableDevices.microphones.map((d) => (
                      <option key={d.deviceId} value={d.deviceId}>
                        {d.label || `Mic ${d.deviceId.slice(0, 6)}`}
                      </option>
                    ))}
                  </select>
                )}
                <div className="ml-auto flex items-center gap-3 shrink-0">
                  {connectionTested && connectionStatus === "connected" && (
                    <span className="text-xs text-primary hidden sm:inline">
                      Ready to go live
                    </span>
                  )}
                  {connectionStatus === "failed" && (
                    <span className="text-xs text-accent-red hidden sm:inline">
                      Connection failed
                    </span>
                  )}
                  <button
                    onClick={startStream}
                    disabled={
                      !connectionTested || connectionStatus !== "connected"
                    }
                    className="btn-primary disabled:opacity-50 disabled:bg-surface disabled:text-text-muted px-5 py-2 rounded-lg text-sm font-bold disabled:cursor-not-allowed"
                  >
                    {isStarting ? "Starting..." : "Go Live"}
                  </button>
                </div>
              </div>
            ) : (
              /* Step 3: Live controls */
              <BottomControlBar
                isMuted={isMuted}
                isCameraOff={isCameraOff}
                isScreenSharing={isScreenSharing}
                isStreaming={isStreaming}
                isRecording={isRecording}
                onToggleMute={toggleMute}
                onToggleCamera={toggleCamera}
                onToggleScreenShare={
                  isMobile
                    ? undefined
                    : isScreenSharing
                      ? stopScreenShare
                      : startScreenShare
                }
                onToggleRecording={toggleRecording}
                onEndStream={() => setShowEndStreamModal(true)}
                showScreenShare={!isMobile}
              />
            )}
          </div>
        </div>

        {/* Right — Chat + Connection (desktop only) */}
        <div className="hidden lg:flex w-72 xl:w-80 shrink-0 flex-col border-l border-border overflow-hidden bg-surface">
          {/* Chat fills all space */}
          <div className="flex-1 overflow-hidden">
            <ChatPanel
              socket={socket}
              streamId={params.id as string}
              username={user?.username || "Streamer"}
              isStreamer={true}
            />
          </div>

          {/* Connection panel — only shown pre-live */}
          {!isStreaming && (
            <div className="shrink-0 border-t border-border p-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-text-muted uppercase tracking-widest">
                  Connection
                </span>
                <div className="flex items-center gap-1.5">
                  <span
                    className={`w-2 h-2 rounded-full ${
                      connectionStatus === "connected"
                        ? "bg-primary"
                        : connectionStatus === "connecting" ||
                            isTestingConnection
                          ? "bg-yellow-500 animate-pulse"
                          : connectionStatus === "failed"
                            ? "bg-accent-red"
                            : "bg-text-muted"
                    }`}
                  />
                  <span className="text-xs text-text-tertiary">
                    {isTestingConnection
                      ? "Testing..."
                      : connectionStatus === "connected"
                        ? "Connected"
                        : connectionStatus === "failed"
                          ? "Failed"
                          : "Disconnected"}
                  </span>
                </div>
              </div>
              {connectionStatus === "failed" && (
                <p className="text-xs text-accent-red bg-accent-red/10 border border-accent-red/20 rounded-lg px-3 py-2 mb-2">
                  Connection failed. Check your network.
                </p>
              )}
              {connectionTested && connectionStatus === "connected" && (
                <p className="text-xs text-primary bg-primary/10 border border-primary/20 rounded-lg px-3 py-2 mb-2">
                  Ready to go live!
                </p>
              )}
              {permissions.camera &&
                !connectionTested &&
                connectionStatus !== "connecting" && (
                  <button
                    onClick={initializeMediaSoup}
                    disabled={isTestingConnection}
                    className="w-full bg-surface border border-border hover:bg-elevated hover:border-border-hover disabled:opacity-50 text-text-primary px-3 py-2 rounded-lg text-xs font-medium transition"
                  >
                    {isTestingConnection ? "Testing..." : "Test Connection"}
                  </button>
                )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default StreamsPage;
