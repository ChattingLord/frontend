import { io, Socket } from 'socket.io-client'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'

let socket: Socket | null = null

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity, // Retry indefinitely
      reconnectionDelay: 1000, // Start with 1s delay
      reconnectionDelayMax: 5000, // Grow up to 5s
      randomizationFactor: 0.5,
      timeout: 20000,
    })
  }
  return socket
}

export const disconnectSocket = (): void => {
  if (socket) {
    socket.disconnect()
    socket = null
  }
}

export default getSocket

