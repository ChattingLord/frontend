"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Users, MoreVertical, Copy, Share2, Video, VideoOff, LogOut, Menu } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { getSocket, disconnectSocket } from "@/lib/socket"

interface RoomHeaderProps {
  roomId: string
  participantCount: number
  onToggleSidebar: () => void
  onToggleVideo: () => void
  showVideo: boolean
  isConnected?: boolean
}

export function RoomHeader({ roomId, participantCount, onToggleSidebar, onToggleVideo, showVideo, isConnected = true }: RoomHeaderProps) {
  const router = useRouter()
  const { toast } = useToast()
  const [showLeaveDialog, setShowLeaveDialog] = useState(false)
  const [copied, setCopied] = useState(false)

  const copyRoomId = async () => {
    await navigator.clipboard.writeText(roomId)
    setCopied(true)
    toast({
      title: "Copied!",
      description: "Room ID copied to clipboard.",
    })
    setTimeout(() => setCopied(false), 2000)
  }

  const shareRoom = async () => {
    const shareData = {
      title: "Join my ChattingLord room",
      text: `Join my ephemeral chat room: ${roomId}`,
      url: window.location.href,
    }

    if (navigator.share) {
      try {
        await navigator.share(shareData)
      } catch (err) {
        copyRoomId()
      }
    } else {
      copyRoomId()
    }
  }

  const handleLeaveRoom = () => {
    // Emit leave-room event before navigating
    const socket = getSocket()
    const userName = sessionStorage.getItem("userName")
    if (socket && socket.connected && userName && roomId) {
      const userId = userName.toLowerCase().replace(/\s+/g, "-")
      socket.emit("leave-room", { roomId, userId })
      disconnectSocket()
    }
    sessionStorage.removeItem("userName")
    router.push("/")
  }

  return (
    <>
      <header className="border-b bg-card/50 backdrop-blur-sm">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={onToggleSidebar} className="md:hidden">
              <Menu className="w-5 h-5" />
            </Button>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-semibold text-lg">Room {roomId}</h1>
                <div className="flex items-center gap-1">
                  <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'}`} />
                  <span className="text-xs text-muted-foreground">{isConnected ? 'Connected' : 'Connecting...'}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="secondary" className="text-xs">
                  <Users className="w-3 h-3 mr-1" />
                  {participantCount}
                </Badge>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant={showVideo ? "default" : "outline"}
              size="icon"
              onClick={onToggleVideo}
              className="hidden md:flex"
            >
              {showVideo ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon">
                  <MoreVertical className="w-4 h-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem onClick={copyRoomId}>
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Room ID
                </DropdownMenuItem>
                <DropdownMenuItem onClick={shareRoom}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Share Room
                </DropdownMenuItem>
                <DropdownMenuItem onClick={onToggleVideo} className="md:hidden">
                  {showVideo ? (
                    <>
                      <VideoOff className="w-4 h-4 mr-2" />
                      Hide Video
                    </>
                  ) : (
                    <>
                      <Video className="w-4 h-4 mr-2" />
                      Show Video
                    </>
                  )}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => setShowLeaveDialog(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Leave Room
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <Dialog open={showLeaveDialog} onOpenChange={setShowLeaveDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Leave Room?</DialogTitle>
            <DialogDescription>
              Are you sure you want to leave this room? This room will be deleted if all participants leave.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLeaveDialog(false)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleLeaveRoom}>
              Leave Room
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
