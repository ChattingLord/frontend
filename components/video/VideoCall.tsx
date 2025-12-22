"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import getSocket from "@/lib/socket";
import { Video, VideoOff, Mic, MicOff, PhoneOff, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VideoCallProps {
  roomId: string;
  userId: string;
  onMediaStateChange?: (videoOn: boolean, audioOn: boolean) => void;
}

interface RemotePeer {
  userId: string;
  stream: MediaStream | null;
  peerConnection: RTCPeerConnection;
  isVideoOn: boolean;
  isAudioOn: boolean;
}

interface WebRTCOfferAnswerPayload {
  roomId: string;
  fromUserId: string;
  toUserId: string;
  sdp: any;
}

interface WebRTCIcePayload {
  roomId: string;
  fromUserId: string;
  toUserId: string;
  candidate: any;
}

interface MediaStatePayload {
  userId: string;
  isVideoOn: boolean;
  isAudioOn: boolean;
}

// STUN/TURN configuration
const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: process.env.NEXT_PUBLIC_STUN_URL || "stun:stun.l.google.com:19302",
  },
];

if (process.env.NEXT_PUBLIC_TURN_URL) {
  ICE_SERVERS.push({
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_PASSWORD,
  });
}

export default function VideoCall({
  roomId,
  userId,
  onMediaStateChange,
}: VideoCallProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(false);
  const [isAudioEnabled, setIsAudioEnabled] = useState(false);
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeer>>(
    new Map()
  );
  const [isInitializing, setIsInitializing] = useState(true);

  const remotePeersRef = useRef<Map<string, RemotePeer>>(new Map());
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(
    new Map()
  );
  const localStreamRef = useRef<MediaStream | null>(null);

  // Broadcast media state changes to other participants
  const broadcastMediaState = useCallback(
    (videoOn: boolean, audioOn: boolean) => {
      const socket = getSocket();
      socket.emit("media-state-change", {
        roomId,
        userId,
        isVideoOn: videoOn,
        isAudioOn: audioOn,
      });
      onMediaStateChange?.(videoOn, audioOn);
    },
    [roomId, userId, onMediaStateChange]
  );

  // Create peer connection for a remote user
  const createPeerConnection = useCallback(
    (remoteUserId: string): RTCPeerConnection => {
      console.log(`Creating peer connection for ${remoteUserId}`);
      const socket = getSocket();
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          const payload: WebRTCIcePayload = {
            roomId,
            fromUserId: userId,
            toUserId: remoteUserId,
            candidate: event.candidate,
          };
          socket.emit("webrtc-ice-candidate", payload);
        }
      };

      pc.ontrack = (event) => {
        console.log(`Received track from ${remoteUserId}:`, event.track.kind);
        const [stream] = event.streams;
        if (!stream) return;

        setRemotePeers((prev) => {
          const updated = new Map(prev);
          const peer = updated.get(remoteUserId);
          if (peer) {
            // Create new object for immutability
            updated.set(remoteUserId, { ...peer, stream });
          }
          return updated;
        });

        const existingPeer = remotePeersRef.current.get(remoteUserId);
        if (existingPeer) {
          existingPeer.stream = stream;
          remotePeersRef.current.set(remoteUserId, existingPeer);
        }
      };

      pc.onconnectionstatechange = () => {
        console.log(
          `Peer connection state with ${remoteUserId}: ${pc.connectionState}`
        );
        if (
          pc.connectionState === "disconnected" ||
          pc.connectionState === "failed"
        ) {
          console.log(`Removing peer ${remoteUserId} due to connection state`);
          removePeer(remoteUserId);
        }
      };

      // Add local stream tracks if available
      if (localStreamRef.current) {
        console.log(
          `Adding local tracks to peer connection for ${remoteUserId}`
        );
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!);
        });
      }

      return pc;
    },
    [roomId, userId]
  );

  // Remove a peer connection
  const removePeer = useCallback((remoteUserId: string) => {
    console.log(`Removing peer: ${remoteUserId}`);
    const peer = remotePeersRef.current.get(remoteUserId);
    if (peer) {
      peer.peerConnection.close();
      if (peer.stream) {
        peer.stream.getTracks().forEach((track) => track.stop());
      }
      remotePeersRef.current.delete(remoteUserId);
      setRemotePeers((prev) => {
        const updated = new Map(prev);
        updated.delete(remoteUserId);
        return updated;
      });
    }
    pendingCandidatesRef.current.delete(remoteUserId);
  }, []);

  // Create an offer to a specific peer
  const createOfferToPeer = useCallback(
    async (remoteUserId: string) => {
      console.log(`Creating offer to ${remoteUserId}`);
      const socket = getSocket();

      try {
        let peer = remotePeersRef.current.get(remoteUserId);

        if (!peer) {
          const pc = createPeerConnection(remoteUserId);
          peer = {
            userId: remoteUserId,
            stream: null,
            peerConnection: pc,
            isVideoOn: false,
            isAudioOn: false,
          };
          remotePeersRef.current.set(remoteUserId, peer);
          setRemotePeers(new Map(remotePeersRef.current));
        }

        const offer = await peer.peerConnection.createOffer();
        await peer.peerConnection.setLocalDescription(offer);

        const payload: WebRTCOfferAnswerPayload = {
          roomId,
          fromUserId: userId,
          toUserId: remoteUserId,
          sdp: peer.peerConnection.localDescription,
        };
        socket.emit("webrtc-offer", payload);
        console.log(`Offer sent to ${remoteUserId}`);
      } catch (error) {
        console.error(`Error creating offer to ${remoteUserId}:`, error);
      }
    },
    [roomId, userId, createPeerConnection]
  );

  // Using Refs for current media state to access inside callbacks without dependency cycles
  const mediaStateRef = useRef({ video: false, audio: false });

  useEffect(() => {
    mediaStateRef.current = { video: isVideoEnabled, audio: isAudioEnabled };
  }, [isVideoEnabled, isAudioEnabled]);


  useEffect(() => {
    const socket = getSocket();
    let isMounted = true;

    const handleOffer = async (data: WebRTCOfferAnswerPayload) => {
      if (data.roomId !== roomId || data.toUserId !== userId) return;

      console.log(`Received offer from ${data.fromUserId}`);

      try {
        let peer = remotePeersRef.current.get(data.fromUserId);

        if (!peer) {
          const pc = createPeerConnection(data.fromUserId);
          peer = {
            userId: data.fromUserId,
            stream: null,
            peerConnection: pc,
            isVideoOn: false,
            isAudioOn: false,
          };
          remotePeersRef.current.set(data.fromUserId, peer);
          setRemotePeers(new Map(remotePeersRef.current));
        }

        await peer.peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.sdp)
        );

        const answer = await peer.peerConnection.createAnswer();
        await peer.peerConnection.setLocalDescription(answer);

        // Process pending ICE candidates
        const pending = pendingCandidatesRef.current.get(data.fromUserId) || [];
        for (const candidate of pending) {
          try {
            await peer.peerConnection.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          } catch (err) {
            console.error("Error adding queued ICE candidate:", err);
          }
        }
        pendingCandidatesRef.current.delete(data.fromUserId);

        const payload: WebRTCOfferAnswerPayload = {
          roomId,
          fromUserId: userId,
          toUserId: data.fromUserId,
          sdp: peer.peerConnection.localDescription,
        };
        socket.emit("webrtc-answer", payload);
        console.log(`Answer sent to ${data.fromUserId}`);

        // Broadcast our state to ensure sync
        const { video, audio } = mediaStateRef.current;
        socket.emit("media-state-change", {
          roomId,
          userId,
          isVideoOn: video,
          isAudioOn: audio,
        });

      } catch (error) {
        console.error("Error handling WebRTC offer:", error);
      }
    };

    const handleAnswer = async (data: WebRTCOfferAnswerPayload) => {
      if (data.roomId !== roomId || data.toUserId !== userId) return;

      console.log(`Received answer from ${data.fromUserId}`);

      try {
        const peer = remotePeersRef.current.get(data.fromUserId);
        if (!peer) {
          console.warn(`No peer connection found for ${data.fromUserId}`);
          return;
        }

        await peer.peerConnection.setRemoteDescription(
          new RTCSessionDescription(data.sdp)
        );

        const pending = pendingCandidatesRef.current.get(data.fromUserId) || [];
        for (const candidate of pending) {
          try {
            await peer.peerConnection.addIceCandidate(
              new RTCIceCandidate(candidate)
            );
          } catch (err) {
            console.error("Error adding queued ICE candidate:", err);
          }
        }
        pendingCandidatesRef.current.delete(data.fromUserId);
      } catch (error) {
        console.error("Error handling WebRTC answer:", error);
      }
    };

    const handleIceCandidate = async (data: WebRTCIcePayload) => {
      if (data.roomId !== roomId || data.toUserId !== userId) return;

      try {
        const peer = remotePeersRef.current.get(data.fromUserId);
        if (!peer) {
          const pending = pendingCandidatesRef.current.get(data.fromUserId) || [];
          pending.push(data.candidate);
          pendingCandidatesRef.current.set(data.fromUserId, pending);
          return;
        }

        const candidate = data.candidate as RTCIceCandidateInit;

        if (!peer.peerConnection.remoteDescription) {
          const pending = pendingCandidatesRef.current.get(data.fromUserId) || [];
          pending.push(candidate);
          pendingCandidatesRef.current.set(data.fromUserId, pending);
          return;
        }

        await peer.peerConnection.addIceCandidate(
          new RTCIceCandidate(candidate)
        );
      } catch (error) {
        console.error("Error adding received ICE candidate:", error);
      }
    };

    const handleMediaStateChanged = (data: MediaStatePayload) => {
      if (data.userId === userId) return;

      console.log(
        `Media state changed for ${data.userId}: video=${data.isVideoOn}, audio=${data.isAudioOn}`
      );

      setRemotePeers((prev) => {
        const updated = new Map(prev);
        const peer = updated.get(data.userId);
        if (peer) {
          // IMMUTABLE UPDATE
          updated.set(data.userId, {
            ...peer,
            isVideoOn: data.isVideoOn,
            isAudioOn: data.isAudioOn
          });
        }
        return updated;
      });

      const peer = remotePeersRef.current.get(data.userId);
      if (peer) {
        peer.isVideoOn = data.isVideoOn;
        peer.isAudioOn = data.isAudioOn;
      }
    };

    const handleUserJoinedCall = (data: { userId: string; roomId: string }) => {
      if (data.roomId !== roomId || data.userId === userId) return;

      console.log(`User ${data.userId} joined, creating offer`);

      if (localStreamRef.current) {
        // If we are already connected, don't recreate?
        // Actually, if a user re-joins, their socket ID changed, but userId is same.
        // We probably should close old connection and start new.
        // The createOfferToPeer handles existing peer logic (it reuses or creates new if missing).
        // Since the remote user refreshed, they have a new socket/state, so we should probably start fresh.
        // But for now, relying on createOfferToPeer to just work (it will renegotiate).

        createOfferToPeer(data.userId);

        // Broadcast our state so the new user knows our status
        const { video, audio } = mediaStateRef.current;
        socket.emit("media-state-change", {
          roomId,
          userId,
          isVideoOn: video,
          isAudioOn: audio,
        });
      }
    };

    // Also listen for call-users list which we get after we join
    const handleCallUsers = (data: { roomId: string; users: string[] }) => {
      if (data.roomId !== roomId) return;
      console.log(`Received call users list: ${data.users.join(', ')}`);
      // We typically don't initiate offers here because we wait for user-joined-call on the OTHER side?
      // No. In "Polite peer", usually the joiner offers?
      // But in this implementation:
      // Joiner (Dev) emits join-call.
      // Server emits user-joined-call to Others.
      // Others (Dev2) emit Offer to Joiner.
      // So Joiner just waits.
      // UNLESS there is a race condition where joiner needs to offer?
      // The logs show Dev2 offered to Dev. This direction works.
    };

    socket.on("webrtc-offer", handleOffer);
    socket.on("webrtc-answer", handleAnswer);
    socket.on("webrtc-ice-candidate", handleIceCandidate);
    socket.on("user-media-state-changed", handleMediaStateChanged);
    socket.on("user-joined-call", handleUserJoinedCall);
    socket.on("call-users", handleCallUsers);

    return () => {
      isMounted = false;
      socket.off("webrtc-offer", handleOffer);
      socket.off("webrtc-answer", handleAnswer);
      socket.off("webrtc-ice-candidate", handleIceCandidate);
      socket.off("user-media-state-changed", handleMediaStateChanged);
      socket.off("user-joined-call", handleUserJoinedCall);
      socket.off("call-users", handleCallUsers);

      // Clean up all peer connections
      remotePeersRef.current.forEach((peer) => {
        peer.peerConnection.close();
        if (peer.stream) {
          peer.stream.getTracks().forEach((track) => track.stop());
        }
      });
      remotePeersRef.current.clear();
      pendingCandidatesRef.current.clear();
    };
  }, [
    roomId,
    userId,
    createPeerConnection,
    removePeer,
    createOfferToPeer,
  ]);

  // Auto-join call on mount
  useEffect(() => {
    const initCall = async () => {
      try {
        console.log("Auto-initializing call...");
        // Request permissions
        // Optimization: Use constraints that prefer resolution/frameRate suitable for multiparty
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 } },
          audio: true,
        });

        setLocalStream(stream);
        localStreamRef.current = stream;

        if (localVideoRef.current) {
          localVideoRef.current.srcObject = stream;
        }

        // Start with Video/Audio OFF by default as per requirement "its their choice"
        // Tracks are enabled=false (muted)
        stream.getVideoTracks().forEach(track => track.enabled = false);
        stream.getAudioTracks().forEach(track => track.enabled = false);

        setIsVideoEnabled(false);
        setIsAudioEnabled(false);
        setIsInitializing(false);

        // Join signaling
        const socket = getSocket();
        socket.emit("join-call", { roomId, userId });
        // Broadcast initial state
        socket.emit("media-state-change", {
          roomId,
          userId,
          isVideoOn: false,
          isAudioOn: false,
        });

      } catch (error) {
        console.error("Failed to get media stream:", error);
        setIsInitializing(false);
        // Fallback?
      }
    };

    initCall();

    return () => {
      // Cleanup local stream
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop());
      }
      const socket = getSocket();
      socket.emit("leave-call", { roomId, userId });
    }
  }, [roomId, userId]);


  const toggleVideo = () => {
    if (!localStream) return;
    const newState = !isVideoEnabled;
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = newState;
    });
    setIsVideoEnabled(newState);
    broadcastMediaState(newState, isAudioEnabled);
  };

  const toggleAudio = () => {
    if (!localStream) return;
    const newState = !isAudioEnabled;
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = newState;
    });
    setIsAudioEnabled(newState);
    broadcastMediaState(isVideoEnabled, newState);
  };

  // Calculate grid layout based on number of participants
  const totalParticipants = 1 + remotePeers.size;
  const getGridClass = () => {
    if (totalParticipants === 0 || totalParticipants === 1)
      return "grid-cols-1";
    if (totalParticipants === 2) return "grid-cols-1 md:grid-cols-2";
    if (totalParticipants <= 4) return "grid-cols-2";
    if (totalParticipants <= 6) return "grid-cols-2 md:grid-cols-3";
    return "grid-cols-2 lg:grid-cols-3 xl:grid-cols-4";
  };

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Video Call</h2>
        <div className="text-sm text-gray-400">
          {totalParticipants}{" "}
          {totalParticipants === 1 ? "participant" : "participants"}
        </div>
      </div>

      {isInitializing ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-4">
            <div className="w-8 h-8 border-4 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin"></div>
            <p className="text-gray-400">Connecting to call...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Video Grid */}
          <div
            className={`flex-1 grid ${getGridClass()} gap-3 mb-4 overflow-y-auto`}
          >
            {/* Local Video */}
            <div className="relative bg-gray-800 rounded-lg overflow-hidden border-2 border-indigo-500/50 aspect-video">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${!isVideoEnabled ? "hidden" : ""
                  }`}
              />
              {!isVideoEnabled && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
                  <div className="text-center">
                    <div className="w-16 h-16 rounded-full bg-indigo-500 flex items-center justify-center mx-auto mb-2">
                      <span className="text-2xl font-bold text-white">
                        {userId.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <p className="text-sm text-gray-300">You (Video Off)</p>
                  </div>
                </div>
              )}
              <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs text-white">
                You
              </div>
              <div className="absolute bottom-2 right-2 flex gap-1">
                <div
                  className={`p-1 rounded ${isVideoEnabled ? "bg-green-500/80" : "bg-red-500/80"
                    }`}
                >
                  {isVideoEnabled ? (
                    <Video className="w-3 h-3 text-white" />
                  ) : (
                    <VideoOff className="w-3 h-3 text-white" />
                  )}
                </div>
                <div
                  className={`p-1 rounded ${isAudioEnabled ? "bg-green-500/80" : "bg-red-500/80"
                    }`}
                >
                  {isAudioEnabled ? (
                    <Mic className="w-3 h-3 text-white" />
                  ) : (
                    <MicOff className="w-3 h-3 text-white" />
                  )}
                </div>
              </div>
            </div>

            {/* Remote Videos */}
            {Array.from(remotePeers.values()).map((peer) => (
              <RemoteVideoCard key={peer.userId} peer={peer} />
            ))}
          </div>

          {/* Controls */}
          <div className="flex justify-center gap-3 flex-wrap bg-gray-900/50 p-3 rounded-lg backdrop-blur-sm">
            <Button
              onClick={toggleVideo}
              variant="outline"
              className={`px-4 py-2 rounded-lg transition-colors ${isVideoEnabled
                  ? "bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
                  : "bg-red-600 hover:bg-red-700 text-white border-red-600"
                }`}
            >
              {isVideoEnabled ? (
                <Video className="w-4 h-4" />
              ) : (
                <VideoOff className="w-4 h-4" />
              )}
            </Button>
            <Button
              onClick={toggleAudio}
              variant="outline"
              className={`px-4 py-2 rounded-lg transition-colors ${isAudioEnabled
                  ? "bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
                  : "bg-red-600 hover:bg-red-700 text-white border-red-600"
                }`}
            >
              {isAudioEnabled ? (
                <Mic className="w-4 h-4" />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

// Remote video card component
function RemoteVideoCard({ peer }: { peer: RemotePeer }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream;
    }
  }, [peer.stream]);

  const displayName = peer.userId
    .replace(/-/g, " ")
    .replace(/\b\w/g, (l) => l.toUpperCase());

  return (
    <div className="relative bg-gray-800 rounded-lg overflow-hidden border border-gray-700 aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className={`w-full h-full object-cover ${!peer.isVideoOn ? 'hidden' : ''}`}
      />
      {!peer.isVideoOn && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
          <div className="text-center">
            <div className="w-16 h-16 rounded-full bg-gray-600 flex items-center justify-center mx-auto mb-2">
              <span className="text-2xl font-bold text-white">
                {peer.userId.charAt(0).toUpperCase()}
              </span>
            </div>
            <p className="text-sm text-gray-300">{displayName}</p>
          </div>
        </div>
      )}
      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs text-white">
        {displayName}
      </div>
      <div className="absolute bottom-2 right-2 flex gap-1">
        <div
          className={`p-1 rounded ${peer.isVideoOn ? "bg-green-500/80" : "bg-red-500/80"
            }`}
        >
          {peer.isVideoOn ? (
            <Video className="w-3 h-3 text-white" />
          ) : (
            <VideoOff className="w-3 h-3 text-white" />
          )}
        </div>
        <div
          className={`p-1 rounded ${peer.isAudioOn ? "bg-green-500/80" : "bg-red-500/80"
            }`}
        >
          {peer.isAudioOn ? (
            <Mic className="w-3 h-3 text-white" />
          ) : (
            <MicOff className="w-3 h-3 text-white" />
          )}
        </div>
      </div>
    </div>
  );
}
