"use client"

import { useEffect, useRef } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import type { Message } from "@/types/chat"
import { formatDistanceToNow } from "date-fns"

interface MessageListProps {
  messages: Message[]
  currentUserId: string
  isTyping?: boolean
  typingUserName?: string
}

export function MessageList({ messages, currentUserId, isTyping, typingUserName }: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  return (
    <div className="flex-1 overflow-y-auto p-4 space-y-4">
      {messages.map((message) => {
        if (message.type === "system") {
          return (
            <div key={message.id} className="flex justify-center">
              <div className="bg-muted px-3 py-1.5 rounded-full text-xs text-muted-foreground">{message.content}</div>
            </div>
          )
        }

        const isSentByCurrentUser = message.senderId === currentUserId
        const initials = message.senderName
          ?.split(" ")
          .map((n) => n[0])
          .join("")
          .toUpperCase()
          .slice(0, 2)

        return (
          <div
            key={message.id}
            className={cn("flex gap-3 animate-slide-up", isSentByCurrentUser && "flex-row-reverse")}
          >
            {!isSentByCurrentUser && (
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarFallback className="text-xs font-medium" style={{ backgroundColor: message.senderColor }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
            )}

            <div className={cn("flex flex-col gap-1 max-w-[70%]", isSentByCurrentUser && "items-end")}>
              {!isSentByCurrentUser && (
                <span className="text-xs font-medium text-muted-foreground px-1">{message.senderName}</span>
              )}
              <div
                className={cn(
                  "rounded-2xl px-4 py-2.5",
                  isSentByCurrentUser
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm",
                )}
              >
                <p className="text-sm leading-relaxed break-words">{message.content}</p>
              </div>
              <span className="text-xs text-muted-foreground px-1">
                {formatDistanceToNow(message.timestamp, { addSuffix: true })}
              </span>
            </div>

            {isSentByCurrentUser && (
              <Avatar className="w-8 h-8 shrink-0">
                <AvatarFallback className="text-xs font-medium" style={{ backgroundColor: message.senderColor }}>
                  {initials}
                </AvatarFallback>
              </Avatar>
            )}
          </div>
        )
      })}

      {isTyping && (
        <div className="flex gap-3 animate-slide-up">
          <div className="flex items-center gap-1 bg-muted rounded-2xl px-4 py-3 rounded-tl-sm">
            <div
              className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-pulse-dot"
              style={{ animationDelay: "0ms" }}
            />
            <div
              className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-pulse-dot"
              style={{ animationDelay: "200ms" }}
            />
            <div
              className="w-2 h-2 rounded-full bg-muted-foreground/60 animate-pulse-dot"
              style={{ animationDelay: "400ms" }}
            />
          </div>
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}
