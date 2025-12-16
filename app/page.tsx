"use client";

import { useEffect, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ThemeToggle } from "@/components/theme-toggle";
import { Shield, Trash2, Lock, Sparkles, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

function HomePageContent() {
  const [name, setName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [copied, setCopied] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  // Prefill room ID when coming from a shared link like /?roomId=SECRET
  useEffect(() => {
    const sharedRoomId = searchParams.get("roomId");
    if (sharedRoomId) {
      setRoomId(sharedRoomId.toUpperCase());
    }
  }, [searchParams]);

  const generateRoomId = () => {
    const id = Math.random().toString(36).substring(2, 10).toUpperCase();
    setRoomId(id);
  };

  const handleJoinRoom = () => {
    if (!name.trim()) {
      toast({
        title: "Name required",
        description: "Please enter your name to join the room.",
        variant: "destructive",
      });
      return;
    }

    if (!roomId.trim()) {
      toast({
        title: "Room ID required",
        description: "Please enter or generate a room ID.",
        variant: "destructive",
      });
      return;
    }

    // Store user data in sessionStorage
    sessionStorage.setItem("userName", name);
    router.push(`/room/${roomId}`);
  };

  const copyRoomId = async () => {
    if (roomId) {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      toast({
        title: "Copied!",
        description: "Room ID copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-br from-background via-background to-primary/5 overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(120,119,198,0.1),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(120,119,198,0.08),transparent_50%)]" />

      {/* Theme toggle */}
      <div className="absolute top-6 right-6 z-10">
        <ThemeToggle />
      </div>

      <div className="relative z-10 flex flex-col items-center justify-center min-h-screen px-4 py-12">
        {/* Logo and Hero */}
        <div className="text-center mb-12 space-y-4 animate-slide-up">
          <div className="inline-flex items-center gap-2 mb-2">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Sparkles className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-balance">
              ChattingLord
            </h1>
          </div>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto text-balance">
            Privacy-first ephemeral chat. Create temporary rooms for real-time
            collaboration.
            <span className="block mt-2 text-sm">
              No permanent storage. Auto-delete when empty.
            </span>
          </p>
        </div>

        {/* Privacy badges */}
        <div className="flex flex-wrap items-center justify-center gap-3 mb-10">
          <Badge
            variant="secondary"
            className="flex items-center gap-1.5 px-3 py-1.5"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>End-to-end encrypted</span>
          </Badge>
          <Badge
            variant="secondary"
            className="flex items-center gap-1.5 px-3 py-1.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Auto-delete</span>
          </Badge>
          <Badge
            variant="secondary"
            className="flex items-center gap-1.5 px-3 py-1.5"
          >
            <Shield className="w-3.5 h-3.5" />
            <span>No data stored</span>
          </Badge>
        </div>

        {/* Join/Create Form */}
        <div className="w-full max-w-md">
          <div className="bg-card/80 backdrop-blur-sm border border-border rounded-2xl shadow-lg p-6 md:p-8 space-y-6">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium">
                Your Name
              </Label>
              <Input
                id="name"
                placeholder="Enter your name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                className="h-11"
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="roomId" className="text-sm font-medium">
                Room ID
              </Label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Input
                    id="roomId"
                    placeholder="Enter or generate room ID"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value.toUpperCase())}
                    onKeyDown={(e) => e.key === "Enter" && handleJoinRoom()}
                    className="h-11 pr-10"
                    autoComplete="off"
                  />
                  {roomId && (
                    <button
                      onClick={copyRoomId}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                      aria-label="Copy room ID"
                    >
                      {copied ? (
                        <Check className="w-4 h-4 text-primary" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </button>
                  )}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={generateRoomId}
                  className="h-11 px-4 bg-transparent"
                >
                  Generate
                </Button>
              </div>
            </div>

            <Button
              onClick={handleJoinRoom}
              className="w-full h-11 text-base font-medium"
              size="lg"
            >
              Join Room
            </Button>
          </div>

          {/* Additional info */}
          <div className="mt-6 text-center text-sm text-muted-foreground">
            <p>Create a room and share the ID with others to start chatting</p>
          </div>
        </div>

        {/* Feature highlights */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl w-full px-4">
          <div className="text-center space-y-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Shield className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-semibold">Privacy First</h3>
            <p className="text-sm text-muted-foreground">
              Your data never touches our servers. Everything is encrypted.
            </p>
          </div>
          <div className="text-center space-y-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Trash2 className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-semibold">Truly Ephemeral</h3>
            <p className="text-sm text-muted-foreground">
              Rooms automatically delete when everyone leaves. No trace.
            </p>
          </div>
          <div className="text-center space-y-2">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <h3 className="font-semibold">Real-time</h3>
            <p className="text-sm text-muted-foreground">
              Instant messaging, file sharing, and video calls. Lightning fast.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading...</p>
          </div>
        </div>
      }
    >
      <HomePageContent />
    </Suspense>
  );
}
