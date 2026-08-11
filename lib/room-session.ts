const STORAGE_KEY = "chattinglord_room_session";

export type RoomSession = {
  /** Opaque value used in the URL — not the real room code */
  slug: string;
  /** Actual room id used for Socket.IO join / messaging */
  roomId: string;
};

function randomSlug(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16),
  ).join("");
}

/** Create a private browsing session and persist it for this tab. */
export function createRoomSession(roomId: string): RoomSession {
  const session: RoomSession = {
    slug: randomSlug(),
    roomId: roomId.trim().toUpperCase(),
  };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  return session;
}

/** Resolve the real room id for an opaque URL slug, or null if invalid. */
export function getRoomSession(slug: string): RoomSession | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as RoomSession;
    if (!session?.slug || !session?.roomId) return null;
    if (session.slug !== slug) return null;
    return session;
  } catch {
    return null;
  }
}

export function clearRoomSession(): void {
  sessionStorage.removeItem(STORAGE_KEY);
}
