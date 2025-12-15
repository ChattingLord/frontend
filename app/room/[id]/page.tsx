"use client";

import type React from "react";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoomHeader } from "@/components/room/room-header";
import { MessageList } from "@/components/room/message-list";
import { VideoPanel } from "@/components/room/video-panel";
import { ParticipantsSidebar } from "@/components/room/participants-sidebar";
import { Send, Paperclip, Smile, ChevronRight } from "lucide-react";
import type { Message, Participant } from "@/types/chat";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { getUserColor } from "@/lib/user-colors";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const [showVideo, setShowVideo] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Get user name from sessionStorage
    const name = sessionStorage.getItem("userName");
    if (!name) {
      router.push("/");
      return;
    }
    setUserName(name);
    // Use name as userId for now (can be improved with unique ID generation)
    const currentUserId = name.toLowerCase().replace(/\s+/g, "-");
    setUserId(currentUserId);

    const socket = getSocket();

    // Connection handlers
    socket.on("connect", () => {
      setIsConnected(true);
      // Join the room
      socket.emit("join-room", { roomId, userId: currentUserId });
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    // Room joined confirmation
    socket.on(
      "room-joined",
      (data: {
        roomId: string;
        userId: string;
        userCount: number;
        users: string[];
      }) => {
        // Update participants list
        const participantList: Participant[] = data.users.map((uid) => ({
          id: uid,
          name: uid.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          color: getUserColor(uid),
          isOnline: true,
          isVideoOn: false,
          isAudioOn: true,
        }));
        setParticipants(participantList);

        // Add system message
        setMessages((prev) => [
          ...prev,
          {
            id: `system-${Date.now()}`,
            type: "system",
            content: `${name} joined the room`,
            timestamp: new Date(),
          },
        ]);
      }
    );

    // User joined event
    socket.on(
      "user-joined",
      (data: {
        userId: string;
        roomId: string;
        userCount: number;
        users: string[];
      }) => {
        const participantList: Participant[] = data.users.map((uid) => ({
          id: uid,
          name: uid.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          color: getUserColor(uid),
          isOnline: true,
          isVideoOn: false,
          isAudioOn: true,
        }));
        setParticipants(participantList);

        if (data.userId !== currentUserId) {
          setMessages((prev) => [
            ...prev,
            {
              id: `system-${Date.now()}`,
              type: "system",
              content: `${data.userId
                .replace(/-/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase())} joined the room`,
              timestamp: new Date(),
            },
          ]);
        }
      }
    );

    // User left event
    socket.on(
      "user-left",
      (data: {
        userId: string;
        roomId: string;
        userCount: number;
        users: string[];
      }) => {
        const participantList: Participant[] = data.users.map((uid) => ({
          id: uid,
          name: uid.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          color: getUserColor(uid),
          isOnline: true,
          isVideoOn: false,
          isAudioOn: true,
        }));
        setParticipants(participantList);

        if (data.userId !== currentUserId) {
          setMessages((prev) => [
            ...prev,
            {
              id: `system-${Date.now()}`,
              type: "system",
              content: `${data.userId
                .replace(/-/g, " ")
                .replace(/\b\w/g, (l) => l.toUpperCase())} left the room`,
              timestamp: new Date(),
            },
          ]);
        }
      }
    );

    // New message event
    socket.on(
      "new-message",
      (data: {
        roomId: string;
        userId: string;
        message: string;
        type: string;
        timestamp: string;
      }) => {
        const senderName = data.userId
          .replace(/-/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());
        const newMessage: Message = {
          id: `msg-${Date.now()}-${Math.random()}`,
          type: "user",
          content: data.message,
          senderId: data.userId,
          senderName: senderName,
          senderColor: getUserColor(data.userId),
          timestamp: new Date(data.timestamp),
          isSent: data.userId === currentUserId,
        };
        setMessages((prev) => [...prev, newMessage]);
      }
    );

    // Typing indicator
    socket.on("user-typing", (data: { userId: string; isTyping: boolean }) => {
      setTypingUsers((prev) => {
        const newSet = new Set(prev);
        if (data.isTyping) {
          newSet.add(data.userId);
        } else {
          newSet.delete(data.userId);
        }
        return newSet;
      });
    });

    // Error handling
    socket.on("error", (error: { message: string }) => {
      console.error("Socket error:", error);
    });

    // Focus input
    messageInputRef.current?.focus();

    // Cleanup on unmount
    return () => {
      socket.emit("leave-room", { roomId, userId: currentUserId });
      socket.off("connect");
      socket.off("disconnect");
      socket.off("room-joined");
      socket.off("user-joined");
      socket.off("user-left");
      socket.off("new-message");
      socket.off("user-typing");
      socket.off("error");
      disconnectSocket();
    };
  }, [router, roomId]);

  const sendMessage = () => {
    if (!message.trim() || !isConnected) return;

    const socket = getSocket();
    socket.emit("send-message", {
      roomId,
      userId,
      message: message.trim(),
      type: "text",
    });

    setMessage("");
    // Clear typing indicator
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    socket.emit("typing-stop", { roomId, userId });
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setMessage(e.target.value);

    const socket = getSocket();
    if (!socket.connected) return;

    // Send typing start
    if (e.target.value.trim() && !typingUsers.has(userId)) {
      socket.emit("typing-start", { roomId, userId });
    }

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set timeout to stop typing indicator
    typingTimeoutRef.current = setTimeout(() => {
      socket.emit("typing-stop", { roomId, userId });
    }, 1000);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Get typing user names
  const typingUserNames = Array.from(typingUsers)
    .filter((uid) => uid !== userId)
    .map((uid) =>
      uid.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase())
    )
    .join(", ");

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Main chat area */}
      <div className="flex-1 flex flex-col">
        <RoomHeader
          roomId={roomId}
          participantCount={participants.length}
          onToggleSidebar={() => setShowSidebar(!showSidebar)}
          onToggleVideo={() => setShowVideo(!showVideo)}
          showVideo={showVideo}
          isConnected={isConnected}
        />

        <div className="flex-1 flex overflow-hidden">
          {/* Chat panel */}
          <div
            className={`flex-1 flex flex-col ${showVideo ? "border-r" : ""}`}
          >
            <MessageList
              messages={messages}
              currentUserId={userId}
              isTyping={typingUsers.size > 0}
              typingUserName={typingUserNames}
            />

            {/* Message input */}
            <div className="border-t bg-card/50 backdrop-blur-sm p-4">
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <Input
                    ref={messageInputRef}
                    value={message}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyPress}
                    placeholder={
                      isConnected ? "Type a message..." : "Connecting..."
                    }
                    className="pr-20 min-h-[44px] resize-none"
                    autoComplete="off"
                    disabled={!isConnected}
                  />
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Add emoji"
                      disabled={!isConnected}
                    >
                      <Smile className="w-4 h-4" />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Attach file"
                      disabled={!isConnected}
                    >
                      <Paperclip className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <Button
                  onClick={sendMessage}
                  disabled={!message.trim() || !isConnected}
                  size="icon"
                  className="h-11 w-11 shrink-0"
                  aria-label="Send message"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </div>
              {message.length > 0 && (
                <div className="text-xs text-muted-foreground mt-2 text-right">
                  {message.length} characters
                </div>
              )}
            </div>
          </div>

          {/* Video panel */}
          {showVideo && (
            <div className="w-full md:w-96 lg:w-[28rem] bg-muted/30">
              <VideoPanel participants={participants} />
            </div>
          )}
        </div>
      </div>

      {/* Participants sidebar - mobile */}
      {showSidebar && (
        <div className="absolute inset-y-0 right-0 w-80 bg-card border-l shadow-lg z-50 md:hidden">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">Participants</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSidebar(false)}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          <ParticipantsSidebar participants={participants} />
        </div>
      )}

      {/* Participants sidebar - desktop */}
      <div className="hidden md:block w-72 border-l bg-card/30">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Participants</h2>
        </div>
        <ParticipantsSidebar participants={participants} />
      </div>
    </div>
  );
}
