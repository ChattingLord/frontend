"use client"

import { useEffect, useRef, useState } from "react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { Message } from "@/types/chat"
import { formatDistanceToNow } from "date-fns"
import { Download, File, Reply } from "lucide-react"

// Helper function to format file size
const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round(bytes / Math.pow(k, i) * 100) / 100 + " " + sizes[i];
};

// Helper function to download file
const downloadFile = (fileData: Message["fileData"]) => {
  if (!fileData || !fileData.data) {
    console.error("File data is missing or invalid");
    return;
  }

  try {
    // Decode base64 string
    const base64Data = fileData.data;
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    
    const byteArray = new Uint8Array(byteNumbers);
    const blob = new Blob([byteArray], { type: fileData.fileType || "application/octet-stream" });
    const url = URL.createObjectURL(blob);
    
    // Create download link
    const link = document.createElement("a");
    link.href = url;
    link.download = fileData.fileName || "download";
    link.style.display = "none";
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    setTimeout(() => {
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }, 100);
  } catch (error) {
    console.error("Error downloading file:", error);
    // Fallback: try to open the data URL directly
    try {
      const dataUrl = `data:${fileData.fileType};base64,${fileData.data}`;
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = fileData.fileName || "download";
      link.style.display = "none";
      document.body.appendChild(link);
      link.click();
      setTimeout(() => {
        document.body.removeChild(link);
      }, 100);
    } catch (fallbackError) {
      console.error("Fallback download also failed:", fallbackError);
    }
  }
};

interface MessageListProps {
  messages: Message[]
  currentUserId: string
  isTyping?: boolean
  typingUserName?: string
  onReply?: (message: Message) => void
}

export function MessageList({
  messages,
  currentUserId,
  isTyping,
  typingUserName,
  onReply,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [highlightedId, setHighlightedId] = useState<string | null>(null)
  const highlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, isTyping])

  useEffect(() => {
    return () => {
      if (highlightTimeoutRef.current) {
        clearTimeout(highlightTimeoutRef.current)
      }
    }
  }, [])

  const scrollToMessage = (messageId: string) => {
    const exists = messages.some((m) => m.id === messageId)
    if (!exists) return

    const el = document.getElementById(`message-${messageId}`)
    if (!el) return

    el.scrollIntoView({ behavior: "smooth", block: "center" })

    if (highlightTimeoutRef.current) {
      clearTimeout(highlightTimeoutRef.current)
    }
    setHighlightedId(messageId)
    highlightTimeoutRef.current = setTimeout(() => {
      setHighlightedId(null)
      highlightTimeoutRef.current = null
    }, 1400)
  }
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
            id={`message-${message.id}`}
            className={cn(
              "group flex gap-3 animate-slide-up",
              isSentByCurrentUser && "flex-row-reverse",
              highlightedId === message.id && "message-highlight",
            )}
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
                  "relative rounded-2xl px-4 py-2.5",
                  isSentByCurrentUser
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-muted text-foreground rounded-tl-sm",
                )}
              >
                {message.replyTo && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      scrollToMessage(message.replyTo!.id)
                    }}
                    className={cn(
                      "mb-2 w-full text-left rounded-lg border-l-2 px-2.5 py-1.5 text-xs cursor-pointer transition-opacity hover:opacity-90",
                      isSentByCurrentUser
                        ? "border-primary-foreground/50 bg-primary-foreground/10"
                        : "border-primary/60 bg-background/60",
                    )}
                    aria-label={`Jump to reply from ${message.replyTo.senderName || "message"}`}
                  >
                    <p
                      className={cn(
                        "font-medium truncate",
                        isSentByCurrentUser
                          ? "text-primary-foreground/90"
                          : "text-primary",
                      )}
                    >
                      {message.replyTo.senderName || "Unknown"}
                    </p>
                    <p
                      className={cn(
                        "truncate opacity-80",
                        isSentByCurrentUser
                          ? "text-primary-foreground"
                          : "text-muted-foreground",
                      )}
                    >
                      {message.replyTo.content}
                    </p>
                  </button>
                )}
                {message.fileData && message.fileData.data ? (
                  <div className="space-y-2">
                    {message.fileData.fileType && message.fileData.fileType.startsWith("image/") ? (
                      <div className="rounded-lg overflow-hidden max-w-full">
                        <img
                          src={`data:${message.fileData.fileType};base64,${message.fileData.data}`}
                          alt={message.fileData.fileName}
                          className="max-w-full max-h-96 object-contain cursor-pointer"
                          onClick={() => {
                            const img = new Image();
                            img.src = `data:${message.fileData!.fileType};base64,${message.fileData!.data}`;
                            const w = window.open("");
                            w?.document.write(img.outerHTML);
                          }}
                        />
                      </div>
                    ) : (
                      <div 
                        className={cn(
                          "flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors",
                          isSentByCurrentUser 
                            ? "bg-primary-foreground/10 hover:bg-primary-foreground/20" 
                            : "bg-background/50 hover:bg-background/70"
                        )}
                        onClick={() => downloadFile(message.fileData)}
                        title="Click to download"
                      >
                        <File className={cn(
                          "w-8 h-8 shrink-0",
                          isSentByCurrentUser ? "text-primary-foreground" : ""
                        )} />
                        <div className="flex-1 min-w-0">
                          <p className={cn(
                            "text-sm font-medium truncate",
                            isSentByCurrentUser ? "text-primary-foreground" : ""
                          )}>{message.fileData.fileName}</p>
                          <p className={cn(
                            "text-xs opacity-80",
                            isSentByCurrentUser ? "text-primary-foreground/80" : ""
                          )}>{formatFileSize(message.fileData.fileSize)}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className={cn(
                            "h-8 w-8 shrink-0",
                            isSentByCurrentUser ? "text-primary-foreground hover:bg-primary-foreground/20" : ""
                          )}
                          onClick={(e) => {
                            e.stopPropagation();
                            downloadFile(message.fileData);
                          }}
                          title="Download file"
                        >
                          <Download className="w-4 h-4" />
                        </Button>
                      </div>
                    )}
                    {message.content && message.content !== message.fileData.fileName && (
                      <p className="text-sm leading-relaxed break-words mt-2">{message.content}</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm leading-relaxed break-words">{message.content}</p>
                )}
              </div>
              <div
                className={cn(
                  "flex items-center gap-1 px-1",
                  isSentByCurrentUser && "flex-row-reverse",
                )}
              >
                <span className="text-xs text-muted-foreground">
                  {formatDistanceToNow(message.timestamp, { addSuffix: true })}
                </span>
                {onReply && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-xs text-muted-foreground opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                    onClick={() => onReply(message)}
                    aria-label="Reply to message"
                  >
                    <Reply className="w-3.5 h-3.5 mr-1" />
                    Reply
                  </Button>
                )}
              </div>
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
        <div className="flex flex-col gap-1 animate-slide-up">
          <div className="flex gap-3">
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
          {typingUserName && (
            <p className="text-xs text-muted-foreground px-1">
              {typingUserName}{" "}
              {typingUserName.includes(",") ? "are" : "is"} typing...
            </p>
          )}
        </div>
      )}

      <div ref={messagesEndRef} />
    </div>
  )
}
