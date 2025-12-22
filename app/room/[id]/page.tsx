"use client";

import type React from "react";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RoomHeader } from "@/components/room/room-header";
import { MessageList } from "@/components/room/message-list";
import { ParticipantsSidebar } from "@/components/room/participants-sidebar";
import { Send, Paperclip, Smile, ChevronRight } from "lucide-react";
import type { Message, Participant } from "@/types/chat";
import { getSocket, disconnectSocket } from "@/lib/socket";
import { getUserColor } from "@/lib/user-colors";
import { useToast } from "@/hooks/use-toast";
// Emoji picker
import data from "@emoji-mart/data";
import Picker from "@emoji-mart/react";

export default function RoomPage() {
  const params = useParams();
  const router = useRouter();
  const roomId = params.id as string;
  const { toast } = useToast();
  const [userName, setUserName] = useState("");
  const [userId, setUserId] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [typingUsers, setTypingUsers] = useState<Set<string>>(new Set());
  const [isConnected, setIsConnected] = useState(false);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const messageInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  const handleToggleEmojiPicker = () => {
    if (!isConnected) return;
    setShowEmojiPicker((prev) => !prev);
  };

  const handleAttachClick = () => {
    if (!isConnected) return;
    if (fileInputRef.current) {
      fileInputRef.current.click();
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Check file size (limit to 10MB for base64 encoding)
    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      toast({
        title: "File too large",
        description: "Please select a file smaller than 10MB.",
        variant: "destructive",
      });
      event.target.value = "";
      return;
    }

    // Convert file to base64
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Data = e.target?.result as string;
      
      // Extract base64 string (remove data:type;base64, prefix)
      const base64String = base64Data.split(',')[1] || base64Data;

      const fileData = {
        fileName: file.name,
        fileType: file.type,
        fileSize: file.size,
        data: base64String,
      };

      // Send file message via Socket.IO (we rely on the server's new-message event
      // to add the message to the UI, so we don't push a local copy here to avoid duplicates)
      const socket = getSocket();
      if (socket && socket.connected) {
        socket.emit("send-message", {
          roomId,
          userId,
          message: file.name, // Use filename as message text
          type: "file",
          fileData,
        });
      }
    };

    reader.onerror = () => {
      toast({
        title: "Error reading file",
        description: "Could not read the selected file. Please try again.",
        variant: "destructive",
      });
    };

    reader.readAsDataURL(file);
    event.target.value = "";
  };

  // Close emoji picker on outside click or Escape
  useEffect(() => {
    if (!showEmojiPicker) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(event.target as Node)
      ) {
        setShowEmojiPicker(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setShowEmojiPicker(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [showEmojiPicker]);

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
        // Update participants list - everyone starts with video and audio OFF
        const participantList: Participant[] = data.users.map((uid) => ({
          id: uid,
          name: uid.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          color: getUserColor(uid),
          isOnline: true,
          isVideoOn: false,
          isAudioOn: false,
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
        // Everyone starts with video and audio OFF
        const participantList: Participant[] = data.users.map((uid) => ({
          id: uid,
          name: uid.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          color: getUserColor(uid),
          isOnline: true,
          isVideoOn: false,
          isAudioOn: false,
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
        // Preserve existing media states when someone leaves
        setParticipants((prevParticipants) => {
          const participantMap = new Map(
            prevParticipants.map((p) => [p.id, p])
          );
          
          return data.users.map((uid) => {
            const existing = participantMap.get(uid);
            return {
          id: uid,
          name: uid.replace(/-/g, " ").replace(/\b\w/g, (l) => l.toUpperCase()),
          color: getUserColor(uid),
          isOnline: true,
              isVideoOn: existing?.isVideoOn ?? false,
              isAudioOn: existing?.isAudioOn ?? false,
            };
          });
        });

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
        fileData?: {
          fileName: string;
          fileType: string;
          fileSize: number;
          data: string;
        };
        timestamp: string;
      }) => {
        if (data.roomId !== roomId) return;
        
        // Debug: Log file data if present
        if (data.fileData) {
          console.log("Received file message:", {
            fileName: data.fileData.fileName,
            fileType: data.fileData.fileType,
            fileSize: data.fileData.fileSize,
            dataLength: data.fileData.data?.length || 0,
          });
        }
        
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
          fileData: data.fileData,
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

    // Media state changes
    socket.on("user-media-state-changed", (data: { userId: string; isVideoOn: boolean; isAudioOn: boolean }) => {
      setParticipants((prev) => {
        return prev.map((participant) => {
          if (participant.id === data.userId) {
            return {
              ...participant,
              isVideoOn: data.isVideoOn,
              isAudioOn: data.isAudioOn,
            };
          }
          return participant;
        });
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
      socket.off("user-media-state-changed");
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
          isConnected={isConnected}
        />

        <div className="flex-1 flex overflow-hidden">
          {/* Chat panel */}
          <div className="flex-1 flex flex-col">
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
                  {/* Emoji picker */}
                  {showEmojiPicker && (
                    <div
                      ref={emojiPickerRef}
                      className="absolute right-2 bottom-12 z-20"
                    >
                      <Picker
                        data={data}
                        theme="dark"
                        onEmojiSelect={(emoji: any) => {
                          setMessage((prev) => prev + (emoji.native || ""));
                          if (messageInputRef.current) {
                            messageInputRef.current.focus();
                          }
                        }}
                      />
                    </div>
                  )}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Add emoji"
                      disabled={!isConnected}
                      onClick={handleToggleEmojiPicker}
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
                      onClick={handleAttachClick}
                    >
                      <Paperclip className="w-4 h-4" />
                    </Button>
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    onChange={handleFileChange}
                    accept="image/*,application/pdf,.doc,.docx,.txt"
                  />
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
        </div>
      </div>

      {/* Participants sidebar - mobile */}
      {showSidebar && (
        <div className="absolute inset-y-0 right-0 w-80 bg-card border-l shadow-lg z-50 md:hidden flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="font-semibold">Participants ({participants.length})</h2>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowSidebar(false)}
            >
              <ChevronRight className="w-5 h-5" />
            </Button>
          </div>
          <ParticipantsSidebar 
            participants={participants}
            roomId={roomId}
            userId={userId}
            onMediaStateChange={(videoOn, audioOn) => {
              setParticipants((prev) =>
                prev.map((p) =>
                  p.id === userId ? { ...p, isVideoOn: videoOn, isAudioOn: audioOn } : p
                )
              );
            }}
          />
        </div>
      )}

      {/* Participants sidebar - desktop */}
      <div className="hidden md:flex md:flex-col w-80 border-l bg-card/30">
        <div className="p-4 border-b">
          <h2 className="font-semibold">Participants ({participants.length})</h2>
        </div>
        <ParticipantsSidebar 
          participants={participants}
          roomId={roomId}
          userId={userId}
          onMediaStateChange={(videoOn, audioOn) => {
            setParticipants((prev) =>
              prev.map((p) =>
                p.id === userId ? { ...p, isVideoOn: videoOn, isAudioOn: audioOn } : p
              )
            );
          }}
        />
      </div>
    </div>
  );
}
