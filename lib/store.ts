import { create } from 'zustand'

export interface Message {
  roomId: string
  userId: string
  message: string
  type: 'text' | 'file' | 'system'
  timestamp: string
}

export interface User {
  userId: string
  isTyping?: boolean
}

interface ChatState {
  currentRoomId: string | null
  currentUserId: string | null
  messages: Message[]
  users: User[]
  userCount: number
  isConnected: boolean
  
  setCurrentRoom: (roomId: string, userId: string) => void
  addMessage: (message: Message) => void
  setUsers: (users: string[]) => void
  setUserCount: (count: number) => void
  setUserTyping: (userId: string, isTyping: boolean) => void
  setConnected: (connected: boolean) => void
  clearRoom: () => void
}

export const useChatStore = create<ChatState>((set) => ({
  currentRoomId: null,
  currentUserId: null,
  messages: [],
  users: [],
  userCount: 0,
  isConnected: false,

  setCurrentRoom: (roomId: string, userId: string) =>
    set({ currentRoomId: roomId, currentUserId: userId, messages: [], users: [] }),

  addMessage: (message: Message) =>
    set((state) => ({ messages: [...state.messages, message] })),

  setUsers: (users: string[]) =>
    set({ users: users.map((id) => ({ userId: id })) }),

  setUserCount: (count: number) => set({ userCount: count }),

  setUserTyping: (userId: string, isTyping: boolean) =>
    set((state) => ({
      users: state.users.map((user) =>
        user.userId === userId ? { ...user, isTyping } : user
      ),
    })),

  setConnected: (connected: boolean) => set({ isConnected: connected }),

  clearRoom: () =>
    set({
      currentRoomId: null,
      currentUserId: null,
      messages: [],
      users: [],
      userCount: 0,
    }),
}))

