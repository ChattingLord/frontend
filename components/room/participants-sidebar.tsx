"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Mic, MicOff, Video, VideoOff, Phone, PhoneOff } from "lucide-react"
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
  onMediaStateChange
}: ParticipantsSidebarProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [isAudioEnabled, setIsAudioEnabled] = useState(false)
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeer>>(new Map())
  const [isInitializing, setIsInitializing] = useState(true)

  const remotePeersRef = useRef<Map<string, RemotePeer>>(new Map())
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)

  // Ref for current media state to access in callbacks
  const mediaStateRef = useRef({ video: false, audio: false })

  useEffect(() => {
    mediaStateRef.current = { video: isVideoEnabled, audio: isAudioEnabled }
  }, [isVideoEnabled, isAudioEnabled])

  // Broadcast media state changes
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

  // Create peer connection for a remote user
  const createPeerConnection = useCallback(
    (remoteUserId: string): RTCPeerConnection => {
      console.log(`[WebRTC] createPeerConnection for ${remoteUserId}`)
      const socket = getSocket()
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          // console.log(`[WebRTC] Sending ICE candidate to ${remoteUserId}`)
          socket.emit("webrtc-ice-candidate", {
            roomId,
            fromUserId: userId,
            toUserId: remoteUserId,
            candidate: event.candidate,
          })
        }
      }

      pc.ontrack = (event) => {
        console.log(`[WebRTC] ontrack event from ${remoteUserId}:`, event.track.kind)
        const [stream] = event.streams
        if (!stream) {
          console.log(`[WebRTC] No stream in ontrack event`)
          return
        }

        setRemotePeers((prev) => {
          const updated = new Map(prev)
          const peer = updated.get(remoteUserId)
          if (peer) {
            // Immutable update
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
        console.log(`[WebRTC] Connection state for ${remoteUserId}: ${pc.connectionState}`)
        if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
          removePeer(remoteUserId)
        }
      }

      if (localStreamRef.current) {
        console.log(`[WebRTC] Adding ${localStreamRef.current.getTracks().length} local tracks to peer connection`)
        localStreamRef.current.getTracks().forEach((track) => {
          pc.addTrack(track, localStreamRef.current!)
        })
      } else {
        console.log(`[WebRTC] WARNING: No local stream when creating peer connection!`)
      }

      return pc
    },
    [roomId, userId]
  )

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
  }, [])

  const createOfferToPeer = useCallback(
    async (remoteUserId: string) => {
      const socket = getSocket()
      try {
        console.log(`[WebRTC] createOfferToPeer called for ${remoteUserId}`)
        let peer = remotePeersRef.current.get(remoteUserId)

        if (!peer) {
          console.log(`[WebRTC] Creating new peer connection for ${remoteUserId}`)
          const pc = createPeerConnection(remoteUserId)
          peer = {
            userId: remoteUserId,
            stream: null,
            peerConnection: pc,
            isVideoOn: false,
            isAudioOn: false,
          }
          remotePeersRef.current.set(remoteUserId, peer)
          setRemotePeers(new Map(remotePeersRef.current))
        }

        console.log(`[WebRTC] Creating offer for ${remoteUserId}`)
        const offer = await peer.peerConnection.createOffer()
        await peer.peerConnection.setLocalDescription(offer)

        console.log(`[WebRTC] Sending offer to ${remoteUserId}`)
        socket.emit("webrtc-offer", {
          roomId,
          fromUserId: userId,
          toUserId: remoteUserId,
          sdp: peer.peerConnection.localDescription,
        })
      } catch (error) {
        console.error(`[WebRTC] Error creating offer to ${remoteUserId}:`, error)
      }
    },
    [roomId, userId, createPeerConnection]
  )

  useEffect(() => {
    const socket = getSocket()

    const handleOffer = async (data: WebRTCOfferAnswerPayload) => {
      console.log(`[WebRTC] Received offer from ${data.fromUserId}`)
      if (data.roomId !== roomId || data.toUserId !== userId) return

      try {
        let peer = remotePeersRef.current.get(data.fromUserId)

        if (!peer) {
          console.log(`[WebRTC] Creating new peer connection for ${data.fromUserId}`)
          const pc = createPeerConnection(data.fromUserId)
          peer = {
            userId: data.fromUserId,
            stream: null,
            peerConnection: pc,
            isVideoOn: false,
            isAudioOn: false,
          }
          remotePeersRef.current.set(data.fromUserId, peer)
          setRemotePeers(new Map(remotePeersRef.current))
        }

        await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp))
        const answer = await peer.peerConnection.createAnswer()
        await peer.peerConnection.setLocalDescription(answer)

        const pending = pendingCandidatesRef.current.get(data.fromUserId) || []
        for (const candidate of pending) {
          try {
            await peer.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (err) {
            console.error("[WebRTC] Error adding queued ICE candidate:", err)
          }
        }
        pendingCandidatesRef.current.delete(data.fromUserId)

        console.log(`[WebRTC] Sending answer to ${data.fromUserId}`)
        socket.emit("webrtc-answer", {
          roomId,
          fromUserId: userId,
          toUserId: data.fromUserId,
          sdp: peer.peerConnection.localDescription,
        })

        // Broadcast our state so the caller knows our status
        const { video, audio } = mediaStateRef.current
        socket.emit("media-state-change", {
          roomId,
          userId,
          isVideoOn: video,
          isAudioOn: audio,
        })

      } catch (error) {
        console.error("[WebRTC] Error handling WebRTC offer:", error)
      }
    }

    const handleAnswer = async (data: WebRTCOfferAnswerPayload) => {
      console.log(`[WebRTC] Received answer from ${data.fromUserId}`)
      if (data.roomId !== roomId || data.toUserId !== userId) return

      try {
        const peer = remotePeersRef.current.get(data.fromUserId)
        if (!peer) return

        if (peer.peerConnection.signalingState !== "have-local-offer") {
          // Can happen in glare situations or bad state
          return
        }

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

      setRemotePeers((prev) => {
        const updated = new Map(prev)
        const peer = updated.get(data.userId)
        if (peer) {
          // Immutable update
          updated.set(data.userId, {
            ...peer,
            isVideoOn: data.isVideoOn,
            isAudioOn: data.isAudioOn
          })
        }
        return updated
      })

      const peer = remotePeersRef.current.get(data.userId)
      if (peer) {
        peer.isVideoOn = data.isVideoOn
        peer.isAudioOn = data.isAudioOn
      }
    }

    // When another user joins the call, send them an offer
    const handleUserJoinedCall = (data: { userId: string; roomId: string }) => {
      if (data.roomId !== roomId || data.userId === userId) return

      if (localStreamRef.current) {
        console.log(`[WebRTC] User ${data.userId} joined call, sending offer`)
        createOfferToPeer(data.userId)

        // Broadcast our state so the new user knows our status
        const { video, audio } = mediaStateRef.current
        socket.emit("media-state-change", {
          roomId,
          userId,
          isVideoOn: video,
          isAudioOn: audio,
        })
      }
    }

    // Cleanup peer on leave
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

    return () => {
      socket.off("webrtc-offer", handleOffer)
      socket.off("webrtc-answer", handleAnswer)
      socket.off("webrtc-ice-candidate", handleIceCandidate)
      socket.off("user-media-state-changed", handleMediaStateChanged)
      socket.off("user-joined-call", handleUserJoinedCall)
      socket.off("user-left-call", handleUserLeftCall)

      remotePeersRef.current.forEach((peer) => {
        peer.peerConnection.close()
        if (peer.stream) {
          peer.stream.getTracks().forEach((track) => track.stop())
        }
      })
      remotePeersRef.current.clear()
      pendingCandidatesRef.current.clear()
    }
  }, [roomId, userId, createPeerConnection, removePeer])

  // Auto-join call on mount
  useEffect(() => {
    const initCall = async () => {
      try {
        console.log(`[WebRTC] Auto-starting call for ${userId}`)
        // Low resolution for sidebar
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 320 }, height: { ideal: 240 } },
          audio: true,
        })

        localStreamRef.current = stream
        setLocalStream(stream)

        // Default OFF
        stream.getVideoTracks().forEach(track => track.enabled = false)
        stream.getAudioTracks().forEach(track => track.enabled = false)

        setIsVideoEnabled(false)
        setIsAudioEnabled(false)
        setIsInitializing(false)

        const socket = getSocket()
        socket.emit("join-call", { roomId, userId })
        socket.emit("media-state-change", {
          roomId,
          userId,
          isVideoOn: false,
          isAudioOn: false,
        })

      } catch (error) {
        console.error("Error starting WebRTC call:", error)
        setIsInitializing(false)
      }
    }

    initCall()

    return () => {
      // Cleanup local
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach(track => track.stop())
      }
      const socket = getSocket()
      socket.emit("leave-call", { roomId, userId })
    }
  }, [roomId, userId])

  const toggleVideo = () => {
    if (!localStream) return
    const newState = !isVideoEnabled
    localStream.getVideoTracks().forEach((track) => {
      track.enabled = newState
    })
    setIsVideoEnabled(newState)
    broadcastMediaState(newState, isAudioEnabled)
  }

  const toggleAudio = () => {
    if (!localStream) return
    const newState = !isAudioEnabled
    localStream.getAudioTracks().forEach((track) => {
      track.enabled = newState
    })
    setIsAudioEnabled(newState)
    broadcastMediaState(isVideoEnabled, newState)
  }

  // Ensure local video element has the stream when available
  useEffect(() => {
    if (localVideoRef.current && localStream) {
      localVideoRef.current.srcObject = localStream
    }
  }, [localStream])

  return (
    <div className="flex flex-col h-full ">
      {/* Participants List */}
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

          // Determine video/audio state
          // For local user, we use strict state
          // For remote user, we prioritize the peer state over the participant list state if available
          const showVideo = isCurrentUser
            ? isVideoEnabled
            : (remotePeer ? remotePeer.isVideoOn : participant.isVideoOn)

          const hasAudio = isCurrentUser
            ? isAudioEnabled
            : (remotePeer ? remotePeer.isAudioOn : participant.isAudioOn)

          return (
            <div
              key={participant.id}
              className={`rounded-lg overflow-hidden transition-all bg-card border ${isCurrentUser ? "ring-1 ring-primary" : ""
                }`}
            >
              {/* Video/Avatar Area */}
              <div className="relative aspect-video bg-muted/50">
                {isCurrentUser ? (
                  <>
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className={`w-full h-full object-cover ${!showVideo ? 'hidden' : ''}`}
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

                {/* Name Badge */}
                <div className="absolute bottom-1 left-1 bg-black/60 backdrop-blur-sm px-1.5 py-0.5 rounded text-[10px] text-white flex items-center gap-1 max-w-[80%] truncate">
                  <span>{isCurrentUser ? "You" : participant.name}</span>
                </div>

                {/* Media Status Icons */}
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

      {/* Call Controls */}
      <div className="border-t bg-card/30 p-2">
        <div className="flex justify-center gap-2">
          <Button
            onClick={toggleVideo}
            size="sm"
            variant="outline"
            className={`h-8 w-8 p-0 ${isVideoEnabled
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
            size="sm"
            variant="outline"
            className={`h-8 w-8 p-0 ${isAudioEnabled
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
      </div>
    </div>
  )
}

// Remote video component sorted out to avoid re-renders of the main list breaking video reference
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
      className={`w-full h-full object-cover ${!showVideo ? 'hidden' : ''}`}
    />
  )
}
