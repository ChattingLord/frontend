'use client'

import { useEffect, useRef, useState } from 'react'

interface VideoCallProps {
  roomId: string
  userId: string
}

export default function VideoCall({ roomId, userId }: VideoCallProps) {
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const [isVideoEnabled, setIsVideoEnabled] = useState(false)
  const [isAudioEnabled, setIsAudioEnabled] = useState(false)
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)

  useEffect(() => {
    // WebRTC setup would go here
    // For now, this is a placeholder component
    return () => {
      if (localStream) {
        localStream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [localStream])

  const startMedia = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      })
      setLocalStream(stream)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream
      }
      setIsVideoEnabled(true)
      setIsAudioEnabled(true)
    } catch (error) {
      console.error('Error accessing media devices:', error)
    }
  }

  const stopMedia = () => {
    if (localStream) {
      localStream.getTracks().forEach((track) => track.stop())
      setLocalStream(null)
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null
      }
      setIsVideoEnabled(false)
      setIsAudioEnabled(false)
    }
  }

  const toggleVideo = () => {
    if (localStream) {
      localStream.getVideoTracks().forEach((track) => {
        track.enabled = !isVideoEnabled
      })
      setIsVideoEnabled(!isVideoEnabled)
    }
  }

  const toggleAudio = () => {
    if (localStream) {
      localStream.getAudioTracks().forEach((track) => {
        track.enabled = !isAudioEnabled
      })
      setIsAudioEnabled(!isAudioEnabled)
    }
  }

  return (
    <div className="flex flex-col h-[600px] bg-gray-900 rounded-lg p-4">
      <h2 className="text-lg font-semibold text-white mb-4">Video Call</h2>
      
      <div className="flex-1 relative bg-gray-800 rounded-lg overflow-hidden mb-4">
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="w-full h-full object-cover"
        />
        <div className="absolute bottom-4 left-4 w-32 h-24 bg-gray-700 rounded-lg overflow-hidden border-2 border-white">
          <video
            ref={localVideoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
        </div>
      </div>

      <div className="flex justify-center gap-4">
        {!localStream ? (
          <button
            onClick={startMedia}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            Start Video Call
          </button>
        ) : (
          <>
            <button
              onClick={toggleVideo}
              className={`px-4 py-2 rounded-lg transition-colors ${
                isVideoEnabled
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {isVideoEnabled ? 'Video On' : 'Video Off'}
            </button>
            <button
              onClick={toggleAudio}
              className={`px-4 py-2 rounded-lg transition-colors ${
                isAudioEnabled
                  ? 'bg-gray-700 hover:bg-gray-600 text-white'
                  : 'bg-red-600 hover:bg-red-700 text-white'
              }`}
            >
              {isAudioEnabled ? 'Audio On' : 'Audio Off'}
            </button>
            <button
              onClick={stopMedia}
              className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
            >
              End Call
            </button>
          </>
        )}
      </div>

      <p className="text-sm text-gray-400 text-center mt-4">
        WebRTC peer-to-peer video (full implementation coming soon)
      </p>
    </div>
  )
}

