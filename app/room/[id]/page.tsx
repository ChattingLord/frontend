'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import { getSocket, disconnectSocket } from '@/lib/socket'
import { useChatStore } from '@/lib/store'
import ChatBox from '@/components/chat/ChatBox'
import VideoCall from '@/components/video/VideoCall'

export default function RoomPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const roomId = params.id as string
  const userId = searchParams.get('userId') || 'anonymous'

  const {
    setCurrentRoom,
    setConnected,
    clearRoom,
    isConnected,
  } = useChatStore()

  const [showVideo, setShowVideo] = useState(false)

  useEffect(() => {
    if (!roomId || !userId) {
      router.push('/')
      return
    }

    const socket = getSocket()

    socket.on('connect', () => {
      setConnected(true)
      setCurrentRoom(roomId, userId)
      socket.emit('join-room', { roomId, userId })
    })

    socket.on('disconnect', () => {
      setConnected(false)
    })

    socket.on('room-joined', (data) => {
      console.log('Room joined:', data)
    })

    socket.on('error', (error) => {
      console.error('Socket error:', error)
    })

    return () => {
      socket.emit('leave-room', { roomId, userId })
      disconnectSocket()
      clearRoom()
    }
  }, [roomId, userId, router, setCurrentRoom, setConnected, clearRoom])

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Room: {roomId}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {isConnected ? 'Connected' : 'Connecting...'}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setShowVideo(!showVideo)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
              >
                {showVideo ? 'Hide Video' : 'Show Video'}
              </button>
              <button
                onClick={() => router.push('/')}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-700 dark:text-white rounded-lg transition-colors"
              >
                Leave Room
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className={showVideo ? 'lg:col-span-1' : 'lg:col-span-2'}>
              <ChatBox roomId={roomId} userId={userId} />
            </div>
            {showVideo && (
              <div className="lg:col-span-1">
                <VideoCall roomId={roomId} userId={userId} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

