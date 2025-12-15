export interface Message {
  id: string
  type: "user" | "system"
  content: string
  senderId?: string
  senderName?: string
  senderColor?: string
  timestamp: Date
  isSent?: boolean
}

export interface Participant {
  id: string
  name: string
  color: string
  isOnline: boolean
  isVideoOn: boolean
  isAudioOn: boolean
}
