'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import getSocket from '@/lib/socket'
import { Video, VideoOff, Mic, MicOff, PhoneOff, Phone } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface VideoCallProps {
  roomId: string
  userId: string
  onMediaStateChange?: (videoOn: boolean, audioOn: boolean) => void
}

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

// STUN/TURN configuration
const ICE_SERVERS: RTCIceServer[] = [
  {
    urls: process.env.NEXT_PUBLIC_STUN_URL || 'stun:stun.l.google.com:19302',
  },
]

if (process.env.NEXT_PUBLIC_TURN_URL) {
  ICE_SERVERS.push({
    urls: process.env.NEXT_PUBLIC_TURN_URL,
    username: process.env.NEXT_PUBLIC_TURN_USERNAME,
    credential: process.env.NEXT_PUBLIC_TURN_PASSWORD,
  })
}

export default function VideoCall({ roomId, userId, onMediaStateChange }: VideoCallProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [isAudioEnabled, setIsAudioEnabled] = useState(false)
  const [isInCall, setIsInCall] = useState(false)
  const [remotePeers, setRemotePeers] = useState<Map<string, RemotePeer>>(new Map())
  
  const remotePeersRef = useRef<Map<string, RemotePeer>>(new Map())
  const pendingCandidatesRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map())
  const localStreamRef = useRef<MediaStream | null>(null)

  // Broadcast media state changes to other participants
  const broadcastMediaState = useCallback((videoOn: boolean, audioOn: boolean) => {
    const socket = getSocket()
    socket.emit('media-state-change', {
      roomId,
      userId,
      isVideoOn: videoOn,
      isAudioOn: audioOn,
    })
    onMediaStateChange?.(videoOn, audioOn)
  }, [roomId, userId, onMediaStateChange])

  // Create peer connection for a remote user
  const createPeerConnection = useCallback((remoteUserId: string): RTCPeerConnection => {
    console.log(`Creating peer connection for ${remoteUserId}`)
    const socket = getSocket()
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS })

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        const payload: WebRTCIcePayload = {
          roomId,
          fromUserId: userId,
          toUserId: remoteUserId,
          candidate: event.candidate,
        }
        socket.emit('webrtc-ice-candidate', payload)
      }
    }

    pc.ontrack = (event) => {
      console.log(`Received track from ${remoteUserId}:`, event.track.kind)
      const [stream] = event.streams
      if (!stream) return
      
      setRemotePeers((prev) => {
        const updated = new Map(prev)
        const peer = updated.get(remoteUserId)
        if (peer) {
          peer.stream = stream
          updated.set(remoteUserId, peer)
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
      console.log(`Peer connection state with ${remoteUserId}: ${pc.connectionState}`)
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        console.log(`Removing peer ${remoteUserId} due to connection state`)
        removePeer(remoteUserId)
      }
    }

    // Add local stream tracks if available
    if (localStreamRef.current) {
      console.log(`Adding local tracks to peer connection for ${remoteUserId}`)
      localStreamRef.current.getTracks().forEach((track) => {
        pc.addTrack(track, localStreamRef.current!)
      })
    }

    return pc
  }, [roomId, userId])

  // Remove a peer connection
  const removePeer = useCallback((remoteUserId: string) => {
    console.log(`Removing peer: ${remoteUserId}`)
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

  // Create an offer to a specific peer
  const createOfferToPeer = useCallback(async (remoteUserId: string) => {
    console.log(`Creating offer to ${remoteUserId}`)
    const socket = getSocket()
    
    try {
      let peer = remotePeersRef.current.get(remoteUserId)
      
      if (!peer) {
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

      const offer = await peer.peerConnection.createOffer()
      await peer.peerConnection.setLocalDescription(offer)

      const payload: WebRTCOfferAnswerPayload = {
        roomId,
        fromUserId: userId,
        toUserId: remoteUserId,
        sdp: peer.peerConnection.localDescription,
      }
      socket.emit('webrtc-offer', payload)
      console.log(`Offer sent to ${remoteUserId}`)
    } catch (error) {
      console.error(`Error creating offer to ${remoteUserId}:`, error)
    }
  }, [roomId, userId, createPeerConnection])

  useEffect(() => {
    const socket = getSocket()
    let isMounted = true

    const handleOffer = async (data: WebRTCOfferAnswerPayload) => {
      // Only process if this offer is for us
      if (data.roomId !== roomId || data.toUserId !== userId) return
      
      console.log(`Received offer from ${data.fromUserId}`)
      
      try {
        let peer = remotePeersRef.current.get(data.fromUserId)
        
        if (!peer) {
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

        // Process pending ICE candidates
        const pending = pendingCandidatesRef.current.get(data.fromUserId) || []
        for (const candidate of pending) {
          try {
            await peer.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (err) {
            console.error('Error adding queued ICE candidate:', err)
          }
        }
        pendingCandidatesRef.current.delete(data.fromUserId)

        const payload: WebRTCOfferAnswerPayload = {
          roomId,
          fromUserId: userId,
          toUserId: data.fromUserId,
          sdp: peer.peerConnection.localDescription,
        }
        socket.emit('webrtc-answer', payload)
        console.log(`Answer sent to ${data.fromUserId}`)
      } catch (error) {
        console.error('Error handling WebRTC offer:', error)
      }
    }

    const handleAnswer = async (data: WebRTCOfferAnswerPayload) => {
      // Only process if this answer is for us
      if (data.roomId !== roomId || data.toUserId !== userId) return
      
      console.log(`Received answer from ${data.fromUserId}`)
      
      try {
        const peer = remotePeersRef.current.get(data.fromUserId)
        if (!peer) {
          console.warn(`No peer connection found for ${data.fromUserId}`)
          return
        }

        await peer.peerConnection.setRemoteDescription(new RTCSessionDescription(data.sdp))

        // Process pending ICE candidates
        const pending = pendingCandidatesRef.current.get(data.fromUserId) || []
        for (const candidate of pending) {
          try {
            await peer.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
          } catch (err) {
            console.error('Error adding queued ICE candidate:', err)
          }
        }
        pendingCandidatesRef.current.delete(data.fromUserId)
      } catch (error) {
        console.error('Error handling WebRTC answer:', error)
      }
    }

    const handleIceCandidate = async (data: WebRTCIcePayload) => {
      // Only process if this candidate is for us
      if (data.roomId !== roomId || data.toUserId !== userId) return
      
      console.log(`Received ICE candidate from ${data.fromUserId}`)
      
      try {
        const peer = remotePeersRef.current.get(data.fromUserId)
        if (!peer) {
          console.warn(`No peer connection found for ICE candidate from ${data.fromUserId}`)
          return
        }

        const candidate = data.candidate as RTCIceCandidateInit

        if (!peer.peerConnection.remoteDescription) {
          // Queue the candidate
          const pending = pendingCandidatesRef.current.get(data.fromUserId) || []
          pending.push(candidate)
          pendingCandidatesRef.current.set(data.fromUserId, pending)
          console.log(`Queued ICE candidate from ${data.fromUserId}`)
          return
        }

        await peer.peerConnection.addIceCandidate(new RTCIceCandidate(candidate))
        console.log(`Added ICE candidate from ${data.fromUserId}`)
      } catch (error) {
        console.error('Error adding received ICE candidate:', error)
      }
    }

    const handleMediaStateChanged = (data: MediaStatePayload) => {
      if (data.userId === userId) return
      
      console.log(`Media state changed for ${data.userId}: video=${data.isVideoOn}, audio=${data.isAudioOn}`)
      
      setRemotePeers((prev) => {
        const updated = new Map(prev)
        const peer = updated.get(data.userId)
        if (peer) {
          peer.isVideoOn = data.isVideoOn
          peer.isAudioOn = data.isAudioOn
          updated.set(data.userId, peer)
        }
        return updated
      })

      const peer = remotePeersRef.current.get(data.userId)
      if (peer) {
        peer.isVideoOn = data.isVideoOn
        peer.isAudioOn = data.isAudioOn
      }
    }

    // Listen for when other users join the call
    const handleUserJoinedCall = (data: { userId: string; roomId: string }) => {
      if (data.roomId !== roomId || data.userId === userId) return
      
      console.log(`User ${data.userId} joined the call, creating offer`)
      
      // If we're in a call, create an offer to the new user
      if (isInCall && localStreamRef.current) {
        createOfferToPeer(data.userId)
      }
    }

    socket.on('webrtc-offer', handleOffer)
    socket.on('webrtc-answer', handleAnswer)
    socket.on('webrtc-ice-candidate', handleIceCandidate)
    socket.on('user-media-state-changed', handleMediaStateChanged)
    socket.on('user-joined-call', handleUserJoinedCall)

    return () => {
      isMounted = false
      socket.off('webrtc-offer', handleOffer)
      socket.off('webrtc-answer', handleAnswer)
      socket.off('webrtc-ice-candidate', handleIceCandidate)
      socket.off('user-media-state-changed', handleMediaStateChanged)
      socket.off('user-joined-call', handleUserJoinedCall)

      // Clean up all peer connections
      remotePeersRef.current.forEach((peer) => {
        peer.peerConnection.close()
        if (peer.stream) {
          peer.stream.getTracks().forEach((track) => track.stop())
        }
      })
      remotePeersRef.current.clear()
    }
  }, [roomId, userId, isInCall, createPeerConnection, removePeer, createOfferToPeer])

  const startCall = async () => {
    const socket = getSocket()
    try {
      console.log('Starting call...')
      // Get user media with both video and audio
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })

      // Disable tracks by default
      stream.getVideoTracks().forEach((track) => {
        track.enabled = false
      })
      stream.getAudioTracks().forEach((track) => {
        track.enabled = false
      })

      setLocalStream(stream)
      localStreamRef.current = stream
      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }

      setIsInCall(true)
      setIsVideoEnabled(false)
      setIsAudioEnabled(false)

      // Broadcast that we joined the call
      socket.emit('join-call', { roomId, userId })
      
      // Broadcast initial media state (both OFF)
      broadcastMediaState(false, false)

      console.log('Call started, notified room')
    } catch (error) {
      console.error('Error starting WebRTC call:', error)
    }
  }

  const endCall = () => {
    console.log('Ending call...')
    const socket = getSocket()
    
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
      setLocalStream(null)
      localStreamRef.current = null
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null
      }
    }

    // Close all peer connections
    remotePeersRef.current.forEach((peer) => {
      peer.peerConnection.close()
      if (peer.stream) {
        peer.stream.getTracks().forEach((track) => track.stop())
      }
    })
    remotePeersRef.current.clear()
    setRemotePeers(new Map())

    setIsInCall(false)
    setIsVideoEnabled(false)
    setIsAudioEnabled(false)

    // Notify that we left the call
    socket.emit('leave-call', { roomId, userId })
    broadcastMediaState(false, false)
  }

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

  // Calculate grid layout based on number of participants
  const totalParticipants = isInCall ? 1 + remotePeers.size : 0
  const getGridClass = () => {
    if (totalParticipants === 0 || totalParticipants === 1) return 'grid-cols-1'
    if (totalParticipants === 2) return 'grid-cols-1 md:grid-cols-2'
    if (totalParticipants <= 4) return 'grid-cols-2'
    if (totalParticipants <= 6) return 'grid-cols-2 md:grid-cols-3'
    return 'grid-cols-2 md:grid-cols-3 lg:grid-cols-4'
  }

  return (
    <div className="flex flex-col h-full bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 rounded-lg p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white">Video Call</h2>
        <div className="text-sm text-gray-400">
          {totalParticipants} {totalParticipants === 1 ? 'participant' : 'participants'}
        </div>
      </div>

      {/* Video Grid */}
      {isInCall ? (
        <div className={`flex-1 grid ${getGridClass()} gap-3 mb-4 overflow-y-auto`}>
          {/* Local Video */}
          <div className="relative bg-gray-800 rounded-lg overflow-hidden border-2 border-indigo-500/50 aspect-video">
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full object-cover"
            />
            {!isVideoEnabled && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-700">
                <div className="text-center">
                  <div className="w-16 h-16 rounded-full bg-indigo-500 flex items-center justify-center mx-auto mb-2">
                    <span className="text-2xl font-bold text-white">
                      {userId.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <p className="text-sm text-gray-300">You</p>
                </div>
              </div>
            )}
            <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm px-2 py-1 rounded text-xs text-white">
              You
            </div>
            <div className="absolute bottom-2 right-2 flex gap-1">
              <div className={`p-1 rounded ${isVideoEnabled ? 'bg-green-500/80' : 'bg-red-500/80'}`}>
                {isVideoEnabled ? (
                  <Video className="w-3 h-3 text-white" />
                ) : (
                  <VideoOff className="w-3 h-3 text-white" />
                )}
              </div>
              <div className={`p-1 rounded ${isAudioEnabled ? 'bg-green-500/80' : 'bg-red-500/80'}`}>
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
      ) : (
        <div className="flex-1 flex items-center justify-center bg-gray-800/50 rounded-lg mb-4">
          <div className="text-center text-gray-400">
            <Phone className="w-16 h-16 mx-auto mb-4 opacity-50" />
            <p className="text-lg">Not in call</p>
          </div>
        </div>
      )}

      {/* Controls */}
      <div className="flex justify-center gap-3 flex-wrap">
        {!isInCall ? (
          <Button
            onClick={startCall}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors flex items-center gap-2"
          >
            <Phone className="w-4 h-4" />
            Join Call
          </Button>
        ) : (
          <>
            <Button
              onClick={toggleVideo}
              variant="outline"
              className={`px-4 py-2 rounded-lg transition-colors ${
                isVideoEnabled
                  ? 'bg-gray-700 hover:bg-gray-600 text-white border-gray-600'
                  : 'bg-red-600 hover:bg-red-700 text-white border-red-600'
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
              className={`px-4 py-2 rounded-lg transition-colors ${
                isAudioEnabled
                  ? 'bg-gray-700 hover:bg-gray-600 text-white border-gray-600'
                  : 'bg-red-600 hover:bg-red-700 text-white border-red-600'
              }`}
            >
              {isAudioEnabled ? (
                <Mic className="w-4 h-4" />
              ) : (
                <MicOff className="w-4 h-4" />
              )}
            </Button>
            <Button
              onClick={endCall}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors flex items-center gap-2"
            >
              <PhoneOff className="w-4 h-4" />
              Leave
            </Button>
          </>
        )}
      </div>

      {!isInCall && (
        <p className="text-sm text-gray-400 text-center mt-4">
          Join the call to collaborate with others in real-time
        </p>
      )}
    </div>
  )
}

// Remote video card component
function RemoteVideoCard({ peer }: { peer: RemotePeer }) {
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    if (videoRef.current && peer.stream) {
      videoRef.current.srcObject = peer.stream
    }
  }, [peer.stream])

  const displayName = peer.userId
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (l) => l.toUpperCase())

  return (
    <div className="relative bg-gray-800 rounded-lg overflow-hidden border border-gray-700 aspect-video">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        className="w-full h-full object-cover"
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
        <div className={`p-1 rounded ${peer.isVideoOn ? 'bg-green-500/80' : 'bg-red-500/80'}`}>
          {peer.isVideoOn ? (
            <Video className="w-3 h-3 text-white" />
          ) : (
            <VideoOff className="w-3 h-3 text-white" />
          )}
        </div>
        <div className={`p-1 rounded ${peer.isAudioOn ? 'bg-green-500/80' : 'bg-red-500/80'}`}>
          {peer.isAudioOn ? (
            <Mic className="w-3 h-3 text-white" />
          ) : (
            <MicOff className="w-3 h-3 text-white" />
          )}
        </div>
      </div>
    </div>
  )
}
