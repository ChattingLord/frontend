'use client'

import { useEffect, useRef, useState } from 'react'
import { getSocket } from '@/lib/socket'
import { useChatStore, Message } from '@/lib/store'

interface ChatBoxProps {
  roomId: string
  userId: string
}

export default function ChatBox({ roomId, userId }: ChatBoxProps) {
  const [inputMessage, setInputMessage] = useState('')
  const [isTyping, setIsTyping] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  const { messages, users, userCount, addMessage, setUsers, setUserCount, setUserTyping } =
    useChatStore()

  useEffect(() => {
    const socket = getSocket()

    const handleNewMessage = (message: Message) => {
      addMessage(message)
    }

    const handleUserJoined = (data: {
      userId: string
      roomId: string
      userCount: number
      users: string[]
    }) => {
      setUsers(data.users)
      setUserCount(data.userCount)
      if (data.userId !== userId) {
        addMessage({
          roomId: data.roomId,
          userId: 'system',
          message: `${data.userId} joined the room`,
          type: 'system',
          timestamp: new Date().toISOString(),
        })
      }
    }

    const handleUserLeft = (data: {
      userId: string
      roomId: string
      userCount: number
      users: string[]
    }) => {
      setUsers(data.users)
      setUserCount(data.userCount)
      if (data.userId !== userId) {
        addMessage({
          roomId: data.roomId,
          userId: 'system',
          message: `${data.userId} left the room`,
          type: 'system',
          timestamp: new Date().toISOString(),
        })
      }
    }

    const handleUserTyping = (data: { userId: string; isTyping: boolean }) => {
      if (data.userId !== userId) {
        setUserTyping(data.userId, data.isTyping)
      }
    }

    socket.on('new-message', handleNewMessage)
    socket.on('user-joined', handleUserJoined)
    socket.on('user-left', handleUserLeft)
    socket.on('user-typing', handleUserTyping)

    return () => {
      socket.off('new-message', handleNewMessage)
      socket.off('user-joined', handleUserJoined)
      socket.off('user-left', handleUserLeft)
      socket.off('user-typing', handleUserTyping)
    }
  }, [roomId, userId, addMessage, setUsers, setUserCount, setUserTyping])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault()
    if (inputMessage.trim()) {
      const socket = getSocket()
      socket.emit('send-message', {
        roomId,
        userId,
        message: inputMessage.trim(),
        type: 'text',
      })
      setInputMessage('')
      setIsTyping(false)
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current)
      }
      socket.emit('typing-stop', { roomId, userId })
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInputMessage(e.target.value)

    if (!isTyping && e.target.value.trim()) {
      setIsTyping(true)
      const socket = getSocket()
      socket.emit('typing-start', { roomId, userId })
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current)
    }

    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false)
      const socket = getSocket()
      socket.emit('typing-stop', { roomId, userId })
    }, 1000)
  }

  const typingUsers = users.filter((u) => u.isTyping && u.userId !== userId)

  return (
    <div className="flex flex-col h-[600px] bg-gray-50 dark:bg-gray-900 rounded-lg">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Chat ({userCount} {userCount === 1 ? 'user' : 'users'})
        </h2>
        {typingUsers.length > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {typingUsers.map((u) => u.userId).join(', ')} {typingUsers.length === 1 ? 'is' : 'are'} typing...
          </p>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`flex ${
              msg.userId === userId ? 'justify-end' : 'justify-start'
            }`}
          >
            <div
              className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
                msg.type === 'system'
                  ? 'bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-center mx-auto'
                  : msg.userId === userId
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700'
              }`}
            >
              {msg.type !== 'system' && (
                <p className="text-xs font-semibold mb-1 opacity-75">
                  {msg.userId}
                </p>
              )}
              <p className="text-sm">{msg.message}</p>
              <p className="text-xs opacity-75 mt-1">
                {new Date(msg.timestamp).toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSendMessage} className="p-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex gap-2">
          <input
            type="text"
            value={inputMessage}
            onChange={handleInputChange}
            placeholder="Type a message..."
            className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent dark:bg-gray-700 dark:text-white"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  )
}

