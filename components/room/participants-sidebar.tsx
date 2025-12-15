"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Mic, MicOff, Video, VideoOff } from "lucide-react"
import type { Participant } from "@/types/chat"

interface ParticipantsSidebarProps {
  participants: Participant[]
}

export function ParticipantsSidebar({ participants }: ParticipantsSidebarProps) {
  return (
    <div className="p-4 space-y-2">
      {participants.map((participant) => {
        const initials = participant.name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)

        return (
          <div
            key={participant.id}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-accent/50 transition-colors"
          >
            <div className="relative">
              <Avatar className="w-10 h-10">
                <AvatarFallback className="text-sm font-medium" style={{ backgroundColor: participant.color }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
              {participant.isOnline && (
                <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-background rounded-full" />
              )}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{participant.name}</p>
              <div className="flex items-center gap-2 mt-0.5">
                <div className="flex items-center gap-1">
                  {participant.isAudioOn ? (
                    <Mic className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <MicOff className="w-3 h-3 text-destructive" />
                  )}
                  {participant.isVideoOn ? (
                    <Video className="w-3 h-3 text-muted-foreground" />
                  ) : (
                    <VideoOff className="w-3 h-3 text-muted-foreground" />
                  )}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
