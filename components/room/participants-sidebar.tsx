"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Mic, MicOff, Video, VideoOff } from "lucide-react"
import type { Participant } from "@/types/chat"
import getSocket from "@/lib/socket"

interface RemotePeer {
  userId: string
  stream: MediaStream | null
  peerConnection: RTCPeerConnection
  isVideoOn: boolean
  isAudioOn: boolean
}

interface WebRTCOfferAnswerPayload {
  roomId: string
  fromUserId: string
  toUserId: string
  sdp: any
}

interface WebRTCIcePayload {
  roomId: string
  fromUserId: string
  toUserId: string
  candidate: any
}

interface MediaStatePayload {
  userId: string
  isVideoOn: boolean
  isAudioOn: boolean
}

interface ParticipantsSidebarProps {
  participants: Participant[]
  roomId: string
  userId: string
  isJoined?: boolean
  onMediaStateChange?: (videoOn: boolean, audioOn: boolean) => void
}

// STUN/TURN configuration
const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: process.env.NEXT_PUBLIC_STUN_URL || "stun:stun.l.google.com:19302",
  },
]

if (process.env.NEXT_PUBLIC_TURN_URL) {
  ICE_SERVERS.push({
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_PASSWORD,
  })
}

export function ParticipantsSidebar({
  participants,
  roomId,
  userId,
  isJoined = true,
  onMediaStateChange,
}: ParticipantsSidebarProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [isAudioEnabled, setIsAudioEnabled] = useState(false)
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeer>>(new Map())
  const [isInitializing, setIsInitializing] = useState(true)

  const remotePeersRef = useRef<Map<string, RemotePeer>>(new Map())
  const mediaStatesRef = useRef<Map<string, { isVideoOn: boolean; isAudioOn: boolean }>>(new Map())
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const makingOfferRef = useRef<Map<string, boolean>>(new Map())
  const pendingRenegotiateRef = useRef<Set<string>>(new Set())
  const localStreamRef = useRef<MediaStream | null>(null)
  const mediaStateRef = useRef({ video: false, audio: false })
  const participantsRef = useRef(participants)

  useEffect(() => {
    participantsRef.current = participants
  }, [participants])

  useEffect(() => {
    mediaStateRef.current = { video: isVideoEnabled, audio: isAudioEnabled }
  }, [isVideoEnabled, isAudioEnabled])

  const broadcastMediaState = useCallback(
    (videoOn: boolean, audioOn: boolean) => {
      const socket = getSocket()
      socket.emit("media-state-change", {
        roomId,
        userId,
        isVideoOn: videoOn,
        isAudioOn: audioOn,
      })
      onMediaStateChange?.(videoOn, audioOn)
    },
    [roomId, userId, onMediaStateChange]
  )

  const createPeerConnection = useCallback(
    (remoteUserId: string): RTCPeerConnection => {
      const socket = getSocket()
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          socket.emit("webrtc-ice-candidate", {
            roomId,
            fromUserId: userId,
            toUserId: remoteUserId,
            candidate: event.candidate,
          })
        }
      }

      pc.ontrack = (event) => {
        let [stream] = event.streams
        if (!stream) {
          // Some browsers fire ontrack without event.streams populated.
          // Build a stable MediaStream per remote peer from incoming tracks.
          const existing = remotePeersRef.current.get(remoteUserId)?.stream
          stream = existing ?? new MediaStream()
          stream.addTrack(event.track)
        }
        if (!stream) return

        setRemotePeers((prev) => {
          const updated = new Map(prev)
          const peer = updated.get(remoteUserId)
          if (peer) {
            updated.set(remoteUserId, { ...peer, stream })
          }
          return updated
        })

        const existingPeer = remotePeersRef.current.get(remoteUserId)
        if (existingPeer) {
          existingPeer.stream = stream
          remotePeersRef.current.set(remoteUserId, existingPeer)
        }
      }

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          removePeer(remoteUserId)
        }
      }

      return pc
    },
    [roomId, userId]
  )

  const attachLocalTracks = useCallback((pc: RTCPeerConnection) => {
    const stream = localStreamRef.current

    const kindOf = (t: RTCRtpTransceiver) =>
      t.receiver.track?.kind || t.sender.track?.kind

    const bindTrack = (kind: "video" | "audio", track: MediaStreamTrack | null) => {
      const transceiver = pc.getTransceivers().find((t) => !t.stopped && kindOf(t) === kind)
      if (!transceiver) return false
      if (track) {
        void transceiver.sender.replaceTrack(track)
        transceiver.direction = "sendrecv"
      }
      return true
    }

    // Answerer: transceivers already exist from the remote offer.
    if (pc.signalingState === "have-remote-offer" || pc.remoteDescription) {
      if (stream) {
        stream.getTracks().forEach((track) => {
          bindTrack(track.kind as "video" | "audio", track)
        })
      }
      return
    }

    // Offerer: put camera/mic on the connection so the new joiner receives them.
    if (stream) {
      stream.getTracks().forEach((track) => {
        if (!bindTrack(track.kind as "video" | "audio", track)) {
          pc.addTrack(track, stream)
        }
      })
      return
    }

    if (pc.getTransceivers().length === 0) {
      pc.addTransceiver("video", { direction: "recvonly" })
      pc.addTransceiver("audio", { direction: "recvonly" })
    }
  }, [])

  const removePeer = useCallback((remoteUserId: string) => {
    const peer = remotePeersRef.current.get(remoteUserId)
    if (peer) {
      peer.peerConnection.close()
      if (peer.stream) {
        peer.stream.getTracks().forEach((track) => track.stop())
      }
      remotePeersRef.current.delete(remoteUserId)
      setRemotePeers((prev) => {
        const updated = new Map(prev)
        updated.delete(remoteUserId)
        return updated
      })
    }
    pendingCandidatesRef.current.delete(remoteUserId)
    makingOfferRef.current.delete(remoteUserId)
    pendingRenegotiateRef.current.delete(remoteUserId)
  }, [])

  const ensurePeer = useCallback(
    (remoteUserId: string): RemotePeer => {
      let peer = remotePeersRef.current.get(remoteUserId)
      if (peer) return peer

      const savedState = mediaStatesRef.current.get(remoteUserId)
      const participant = participantsRef.current.find((p) => p.id === remoteUserId)
      peer = {
        userId: remoteUserId,
        stream: null,
        peerConnection: createPeerConnection(remoteUserId),
        isVideoOn: savedState?.isVideoOn ?? participant?.isVideoOn ?? false,
        isAudioOn: savedState?.isAudioOn ?? participant?.isAudioOn ?? false,
      }
      remotePeersRef.current.set(remoteUserId, peer)
      setRemotePeers(new Map(remotePeersRef.current))
      return peer
    },
    [createPeerConnection]
  )

  const createOfferToPeer = useCallback(
    async (remoteUserId: string) => {
      const socket = getSocket()
      try {
        const peer = ensurePeer(remoteUserId)
        const pc = peer.peerConnection

        // Only one offer in flight. Queue another pass once signaling is stable
        // so we never apply a stale answer (that causes the SSL-role error).
        if (makingOfferRef.current.get(remoteUserId) || pc.signalingState !== "stable") {
          pendingRenegotiateRef.current.add(remoteUserId)
          return
        }

        makingOfferRef.current.set(remoteUserId, true)
        try {
          attachLocalTracks(pc)
          const offer = await pc.createOffer()
          if (pc.signalingState !== "stable") {
            pendingRenegotiateRef.current.add(remoteUserId)
            return
          }
          await pc.setLocalDescription(offer)
          socket.emit("webrtc-offer", {
            roomId,
            fromUserId: userId,
            toUserId: remoteUserId,
            sdp: pc.localDescription,
          })
        } finally {
          makingOfferRef.current.set(remoteUserId, false)
        }
      } catch (error) {
        console.error(`[WebRTC] Error creating offer to ${remoteUserId}:`, error)
        makingOfferRef.current.set(remoteUserId, false)
      }
    },
    [roomId, userId, ensurePeer, attachLocalTracks]
  )

  useEffect(() => {
    const socket = getSocket()

    const handleCallUsers = (data: { roomId: string; users: string[] }) => {
      if (data.roomId !== roomId) return
      // The joiner waits. People already in the call send offers (they hold
      // the live camera tracks), same idea as Meet: publishers push to the new viewer.
    }

    const handleOffer = async (data: WebRTCOfferAnswerPayload) => {
      if (data.roomId !== roomId || data.toUserId !== userId) return

      try {
        const peer = ensurePeer(data.fromUserId)
        const pc = peer.peerConnection

        // Perfect negotiation: the lexicographically smaller userId yields
        // (polite) so both sides offering at once cannot flip DTLS roles.
        const polite = userId < data.fromUserId
        const offerCollision =
          makingOfferRef.current.get(data.fromUserId) === true || pc.signalingState !== "stable"

        if (offerCollision) {
          if (!polite) {
            pendingRenegotiateRef.current.add(data.fromUserId)
            return
          }
          pendingRenegotiateRef.current.add(data.fromUserId)
          try {
            await pc.setLocalDescription({ type: "rollback" })
          } catch {
            return
          }
        }

        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp))
        // Bind existing camera/mic to the transceivers created by the remote
        // offer. Adding transceivers before setRemoteDescription puts tracks
        // on extra m-lines, so the joiner never receives media.
        attachLocalTracks(pc)
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)

        const pending = pendingCandidatesRef.current.get(data.fromUserId) || []
        for (const candidate of pending) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (err) {
            console.error("[WebRTC] Error adding queued ICE candidate:", err)
          }
        }
        pendingCandidatesRef.current.delete(data.fromUserId)

        socket.emit("webrtc-answer", {
          roomId,
          fromUserId: userId,
          toUserId: data.fromUserId,
          sdp: pc.localDescription,
        })

        const { video, audio } = mediaStateRef.current
        socket.emit("media-state-change", { roomId, userId, isVideoOn: video, isAudioOn: audio })

        if (pendingRenegotiateRef.current.has(data.fromUserId)) {
          pendingRenegotiateRef.current.delete(data.fromUserId)
          void createOfferToPeer(data.fromUserId)
        }
      } catch (error) {
        console.error("[WebRTC] Error handling WebRTC offer:", error)
      }
    }

    const handleAnswer = async (data: WebRTCOfferAnswerPayload) => {
      if (data.roomId !== roomId || data.toUserId !== userId) return

      try {
        const peer = remotePeersRef.current.get(data.fromUserId)
        if (!peer) return

        if (peer.peerConnection.signalingState !== "have-local-offer") return

        await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp))

        const pending = pendingCandidatesRef.current.get(data.fromUserId) || []
        for (const candidate of pending) {
          try {
            await peer.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (err) {
            console.error("[WebRTC] Error adding queued ICE candidate:", err)
          }
        }
        pendingCandidatesRef.current.delete(data.fromUserId)

        if (pendingRenegotiateRef.current.has(data.fromUserId)) {
          pendingRenegotiateRef.current.delete(data.fromUserId)
          void createOfferToPeer(data.fromUserId)
        }
      } catch (error) {
        console.error("[WebRTC] Error handling WebRTC answer:", error)
      }
    }

    const handleIceCandidate = async (data: WebRTCIcePayload) => {
      if (data.roomId !== roomId || data.toUserId !== userId) return

      try {
        const peer = remotePeersRef.current.get(data.fromUserId)
        if (!peer) {
          const pending = pendingCandidatesRef.current.get(data.fromUserId) || []
          pending.push(data.candidate)
          pendingCandidatesRef.current.set(data.fromUserId, pending)
          return
        }

        const candidate = data.candidate as RTCIceCandidateInit

        if (!peer.peerConnection.remoteDescription) {
          const pending = pendingCandidatesRef.current.get(data.fromUserId) || []
          pending.push(candidate)
          pendingCandidatesRef.current.set(data.fromUserId, pending)
          return
        }

        await peer.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
      } catch (error) {
        console.error("Error adding received ICE candidate:", error)
      }
    }

    const handleMediaStateChanged = (data: MediaStatePayload) => {
      if (data.userId === userId) return

      mediaStatesRef.current.set(data.userId, {
        isVideoOn: data.isVideoOn,
        isAudioOn: data.isAudioOn,
      })

      setRemotePeers((prev) => {
        const updated = new Map(prev)
        const peer = updated.get(data.userId)
        if (peer) {
          updated.set(data.userId, { ...peer, isVideoOn: data.isVideoOn, isAudioOn: data.isAudioOn })
        }
        return updated
      })

      const peer = remotePeersRef.current.get(data.userId)
      if (peer) {
        peer.isVideoOn = data.isVideoOn
        peer.isAudioOn = data.isAudioOn
      }
    }

    const handleUserJoinedCall = (data: { userId: string; roomId: string }) => {
      if (data.roomId !== roomId || data.userId === userId) return

      void createOfferToPeer(data.userId)
      const { video, audio } = mediaStateRef.current
      socket.emit("media-state-change", { roomId, userId, isVideoOn: video, isAudioOn: audio })
    }

    const handleUserLeftCall = (data: { userId: string; roomId: string }) => {
      if (data.roomId !== roomId || data.userId === userId) return
      removePeer(data.userId)
    }

    socket.on("webrtc-offer", handleOffer)
    socket.on("webrtc-answer", handleAnswer)
    socket.on("webrtc-ice-candidate", handleIceCandidate)
    socket.on("user-media-state-changed", handleMediaStateChanged)
    socket.on("user-joined-call", handleUserJoinedCall)
    socket.on("user-left-call", handleUserLeftCall)
    socket.on("call-users", handleCallUsers)

    return () => {
      socket.off("webrtc-offer", handleOffer)
      socket.off("webrtc-answer", handleAnswer)
      socket.off("webrtc-ice-candidate", handleIceCandidate)
      socket.off("user-media-state-changed", handleMediaStateChanged)
      socket.off("user-joined-call", handleUserJoinedCall)
      socket.off("user-left-call", handleUserLeftCall)
      socket.off("call-users", handleCallUsers)

      remotePeersRef.current.forEach((peer) => {
        peer.peerConnection.close()
        if (peer.stream) {
          peer.stream.getTracks().forEach((track) => track.stop())
        }
      })
      remotePeersRef.current.clear()
      pendingCandidatesRef.current.clear()
    }
  }, [roomId, userId, createOfferToPeer, ensurePeer, removePeer, attachLocalTracks])

  useEffect(() => {
    const initCall = async () => {
      try {
        localStreamRef.current = null
        setLocalStream(null)
        setIsVideoEnabled(false)
        setIsAudioEnabled(false)
        setIsInitializing(false)

        const socket = getSocket()
        socket.emit("join-call", { roomId, userId })
        socket.emit("media-state-change", { roomId, userId, isVideoOn: false, isAudioOn: false })
      } catch (error) {
        console.error("Error starting WebRTC call:", error)
        setIsInitializing(false)
      }
    }

    if (isJoined) {
      initCall()
    }

    return () => {
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((track) => track.stop())
      }
      const socket = getSocket()
      socket.emit("leave-call", { roomId, userId })
    }
  }, [roomId, userId, isJoined])

  const startLocalStream = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 } },
        audio: true,
      })

      localStreamRef.current = stream
      setLocalStream(stream)

      remotePeersRef.current.forEach((peer, remoteUserId) => {
        stream.getTracks().forEach((track) => {
          // Always use replaceTrack so we never add a new m-line and break
          // the established m-line order from the first offer/answer.
          const transceiver = peer.peerConnection
            .getTransceivers()
            .find((t) => !t.stopped && (t.receiver.track?.kind === track.kind || t.sender.track?.kind === track.kind))
          if (transceiver) {
            void transceiver.sender.replaceTrack(track)
            transceiver.direction = "sendrecv"
          }
          // No addTrack fallback — transceivers were pre-created in createPeerConnection.
        })
        createOfferToPeer(remoteUserId)
      })

      return stream
    } catch (error) {
      console.error("Error starting stream:", error)
      return null
    }
  }

  const toggleVideo = async () => {
    if (!localStream) {
      const stream = await startLocalStream()
      if (stream) {
        stream.getAudioTracks().forEach((track) => {
          track.enabled = isAudioEnabled
        })
        setIsVideoEnabled(true)
        broadcastMediaState(true, isAudioEnabled)
      }
      return
    }

    const newState = !isVideoEnabled
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = newState
    })
    setIsVideoEnabled(newState)
    broadcastMediaState(newState, isAudioEnabled)
  }

  const toggleAudio = async () => {
    if (!localStream) {
      const stream = await startLocalStream()
      if (stream) {
        stream.getVideoTracks().forEach((track) => {
          track.enabled = isVideoEnabled
        })
        setIsAudioEnabled(true)
        broadcastMediaState(isVideoEnabled, true)
      }
      return
    }

    const newState = !isAudioEnabled
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = newState
    })
    setIsAudioEnabled(newState)
    broadcastMediaState(isVideoEnabled, newState)
  }

  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {isInitializing && (
          <div className="text-center text-xs text-muted-foreground py-2">
            Connecting to audio/video...
          </div>
        )}
        {participants.map((participant) => {
          const isCurrentUser = participant.id === userId
          const remotePeer = remotePeers.get(participant.id)
          const initials = participant.name
            .split(" ")
            .map((n) => n[0])
            .join("")
            .toUpperCase()
            .slice(0, 2)

          const remoteHasLiveVideo = !!remotePeer?.stream
            ?.getVideoTracks()
            .some((t) => t.readyState === "live")

          const showVideo = isCurrentUser
            ? isVideoEnabled
            : remoteHasLiveVideo || (remotePeer ? remotePeer.isVideoOn : participant.isVideoOn)

          const hasAudio = isCurrentUser
            ? isAudioEnabled
            : remotePeer ? remotePeer.isAudioOn : participant.isAudioOn

          return (
            <div
              key={participant.id}
              className={`rounded-lg overflow-hidden transition-all bg-card border ${
                isCurrentUser ? "ring-1 ring-primary" : ""
              }`}
            >
              <div className="relative aspect-video bg-muted/50">
                {isCurrentUser ? (
                  <>
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${!showVideo ? "hidden" : ""}`}
                      style={{ transform: "scaleX(-1)" }}
                    />
                    {!showVideo && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Avatar className="w-12 h-12">
                          <AvatarFallback
                            className="text-lg font-medium text-white"
                            style={{ backgroundColor: participant.color }}
                          >
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    )}
                  </>
                ) : remotePeer?.stream ? (
                  <>
                    <RemoteVideo stream={remotePeer.stream} showVideo={showVideo} />
                    {!showVideo && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <Avatar className="w-12 h-12">
                          <AvatarFallback
                            className="text-lg font-medium text-white"
                            style={{ backgroundColor: participant.color }}
                          >
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Avatar className="w-12 h-12">
                      <AvatarFallback
                        className="text-lg font-medium text-white"
                        style={{ backgroundColor: participant.color }}
                      >
                        {initials}
                      </AvatarFallback>
                    </Avatar>
                  </div>
                )}

                <div className="absolute bottom-1 left-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] text-white flex items-center gap-1 max-w-[80%] truncate">
                  <span>{isCurrentUser ? "You" : participant.name}</span>
                </div>

                <div className="absolute bottom-1 right-1 flex gap-1">
                  <div className={`p-0.5 rounded ${showVideo ? "bg-green-500/80" : "bg-red-500/80"}`}>
                    {showVideo ? (
                      <Video className="w-2.5 h-2.5 text-white" />
                    ) : (
                      <VideoOff className="w-2.5 h-2.5 text-white" />
                    )}
                  </div>
                  <div className={`p-0.5 rounded ${hasAudio ? "bg-green-500/80" : "bg-red-500/80"}`}>
                    {hasAudio ? (
                      <Mic className="w-2.5 h-2.5 text-white" />
                    ) : (
                      <MicOff className="w-2.5 h-2.5 text-white" />
                    )}
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="border-t bg-card/30 p-2">
        <div className="flex justify-center gap-2">
          <Button
            onClick={toggleVideo}
            size="sm"
            variant="outline"
            className={`h-8 w-8 p-0 ${
              isVideoEnabled
                ? "bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
                : "bg-red-600 hover:bg-red-700 text-white border-red-600"
            }`}
          >
            {isVideoEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </Button>
          <Button
            onClick={toggleAudio}
            size="sm"
            variant="outline"
            className={`h-8 w-8 p-0 ${
              isAudioEnabled
                ? "bg-gray-700 hover:bg-gray-600 text-white border-gray-600"
                : "bg-red-600 hover:bg-red-700 text-white border-red-600"
            }`}
          >
            {isAudioEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
          </Button>
        </div>
      </div>
    </div>
  )
}

// Isolated to prevent re-renders from losing the video srcObject reference
function RemoteVideo({ stream, showVideo }: { stream: MediaStream; showVideo: boolean }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  return (
    <video
      ref={videoRef}
      autoPlay
      playsInline
      className={`w-full h-full object-cover ${!showVideo ? "hidden" : ""}`}
    />
  )
}
