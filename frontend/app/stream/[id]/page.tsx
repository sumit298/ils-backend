"use client"
import React, { useState, useRef, useEffect } from "react";
import { useParams } from "next/navigation";

const StreamsPage = () => {
    const params = useParams();
    const videoRef = useRef<HTMLVideoElement>(null);
    const [stream, setStream] = useState<MediaStream | null>(null);
    const [permissions, setPermissions] = useState({
        camera: false,
        microphone: false
    });
    const [isStreaming, setIsStreaming] = useState(false);

    const requestPermissions = async () => {
        try {
            const mediaStream = await navigator.mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            
            setStream(mediaStream);
            setPermissions({ camera: true, microphone: true });
            
            if (videoRef.current) {
                videoRef.current.srcObject = mediaStream;
            }
        } catch (error) {
            console.error('Permission denied:', error);
            // Handle specific permission errors
        }
    };

    const startStream = () => {
        if (stream) {
            setIsStreaming(true);
            // Connect to MediaSoup/WebRTC here
        }
    };

    const stopStream = () => {
        setIsStreaming(false);
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            setStream(null);
        }
    };

    return (
        <div className="min-h-screen bg-background p-4">
            <div className="max-w-6xl mx-auto">
                {/* Video Preview */}
                <div className="aspect-video bg-black rounded-lg mb-4">
                    <video 
                        ref={videoRef} 
                        autoPlay 
                        muted 
                        className="w-full h-full object-cover rounded-lg"
                    />
                </div>

                {/* Controls */}
                <div className="flex gap-4 mb-4">
                    {!permissions.camera ? (
                        <button 
                            onClick={requestPermissions}
                            className="bg-blue-600 text-white px-4 py-2 rounded"
                        >
                            Enable Camera & Mic
                        </button>
                    ) : (
                        <>
                            <button 
                                onClick={startStream}
                                disabled={isStreaming}
                                className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
                            >
                                {isStreaming ? 'Streaming...' : 'Start Stream'}
                            </button>
                            <button 
                                onClick={stopStream}
                                className="bg-red-600 text-white px-4 py-2 rounded"
                            >
                                Stop Stream
                            </button>
                        </>
                    )}
                </div>

                {/* Stream Info */}
                <div className="bg-card p-4 rounded-lg">
                    <h1 className="text-xl font-bold">Stream ID: {params.id}</h1>
                    <p>Status: {isStreaming ? '🔴 Live' : '⚫ Offline'}</p>
                </div>
            </div>
        </div>
    );
};

export default StreamsPage;
