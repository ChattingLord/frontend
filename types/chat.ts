export interface Message {
  id: string
  type: "user" | "system"
  content: string
  senderId?: string
  senderName?: string
  senderColor?: string
  timestamp: Date
  isSent?: boolean
  fileData?: {
    fileName: string
    fileType: string
    fileSize: number
    data: string // base64 encoded file data
  }
}

export interface Participant {
  id: string
  name: string
  color: string
  isOnline: boolean
  isVideoOn: boolean
  isAudioOn: boolean
}
