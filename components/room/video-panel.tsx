"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Mic, MicOff, Video, VideoOff, MonitorUp, PhoneOff } from "lucide-react"
import type { Participant } from "@/types/chat"

interface VideoPanelProps {
  participants: Participant[]
}

export function VideoPanel({ participants }: VideoPanelProps) {
  const [isMuted, setIsMuted] = useState(false)
  const [isVideoOn, setIsVideoOn] = useState(false)
  const [isScreenSharing, setIsScreenSharing] = useState(false)

  return (
    <div className="h-full flex flex-col">
      {/* Video grid */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="grid grid-cols-1 gap-4">
          {participants.map((participant) => {
            const initials = participant.name
              .split(" ")
              .map((n) => n[0])
              .join("")
              .toUpperCase()
              .slice(0, 2)

            return (
              <div key={participant.id} className="relative aspect-video bg-secondary rounded-lg overflow-hidden">
                {/* Video placeholder */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <Avatar className="w-16 h-16">
                    <AvatarFallback className="text-lg font-medium" style={{ backgroundColor: participant.color }}>
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                </div>

                {/* Participant info */}
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <div className="bg-black/60 backdrop-blur-sm rounded-md px-2 py-1">
                    <span className="text-xs text-white font-medium">{participant.name}</span>
                  </div>
                  {!participant.isAudioOn && (
                    <div className="bg-black/60 backdrop-blur-sm rounded-md p-1.5">
                      <MicOff className="w-3 h-3 text-white" />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Video controls */}
      <div className="border-t bg-card/50 backdrop-blur-sm p-4">
        <div className="flex items-center justify-center gap-2">
          <Button
            variant={isMuted ? "destructive" : "outline"}
            size="icon"
            onClick={() => setIsMuted(!isMuted)}
            aria-label={isMuted ? "Unmute" : "Mute"}
          >
            {isMuted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>

          <Button
            variant={isVideoOn ? "outline" : "destructive"}
            size="icon"
            onClick={() => setIsVideoOn(!isVideoOn)}
            aria-label={isVideoOn ? "Turn off video" : "Turn on video"}
          >
            {isVideoOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
          </Button>

          <Button
            variant={isScreenSharing ? "default" : "outline"}
            size="icon"
            onClick={() => setIsScreenSharing(!isScreenSharing)}
            aria-label={isScreenSharing ? "Stop sharing" : "Share screen"}
          >
            <MonitorUp className="w-4 h-4" />
          </Button>

          <Button variant="destructive" size="icon" aria-label="Leave call">
            <PhoneOff className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
