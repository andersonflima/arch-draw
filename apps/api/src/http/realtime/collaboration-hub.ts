type PresenceParticipant = Readonly<{
  clientId: string;
  displayName: string;
  color: string;
  joinedAt: string;
  lastSeenAt: string;
}>;

export type CollaborationCursorEvent = Readonly<{
  type: "cursor";
  clientId: string;
  displayName: string;
  color: string;
  x: number;
  y: number;
  visible: boolean;
  at: string;
}>;

export type CollaborationDocumentEvent = Readonly<{
  type: "document";
  clientId: string;
  updatedAt: string;
}>;

export type CollaborationViewEvent = Readonly<{
  type: "view";
  clientId: string;
  zoom: number;
  panX: number;
  panY: number;
  maximizedNodeId: string | null;
  at: string;
}>;

export type CollaborationPresenceEvent = Readonly<{
  type: "presence";
  participants: readonly PresenceParticipant[];
}>;

export type CollaborationHubEvent =
  | CollaborationCursorEvent
  | CollaborationDocumentEvent
  | CollaborationViewEvent
  | CollaborationPresenceEvent;

export type CollaborationHub = Readonly<{
  join: (input: Readonly<{
    shareId: string;
    clientId: string;
    displayName: string;
    color: string;
  }>) => Readonly<{
    participants: readonly PresenceParticipant[];
    currentView: CollaborationViewEvent | null;
    subscribe: (listener: (event: CollaborationHubEvent) => void) => () => void;
    leave: () => void;
  }>;
  publishCursor: (input: Omit<CollaborationCursorEvent, "type"> & Readonly<{ shareId: string }>) => void;
  publishDocument: (input: Omit<CollaborationDocumentEvent, "type"> & Readonly<{ shareId: string }>) => void;
  publishView: (input: Omit<CollaborationViewEvent, "type"> & Readonly<{ shareId: string }>) => void;
}>;

type RoomState = {
  participants: Map<string, PresenceParticipant>;
  listeners: Set<(event: CollaborationHubEvent) => void>;
  currentView: CollaborationViewEvent | null;
};

// Presence is bounded so that callers who only POST cursor/view updates (and never
// open an SSE stream that would eventually call leave()) cannot grow a room's
// participant map without limit. Stale participants are evicted by idle TTL and
// each room is hard-capped.
const MAX_PARTICIPANTS_PER_ROOM = 200;
const PRESENCE_TTL_MS = 60_000;

export const createCollaborationHub = (): CollaborationHub => {
  const rooms = new Map<string, RoomState>();

  const getOrCreateRoom = (shareId: string): RoomState => {
    const existing = rooms.get(shareId);
    if (existing) return existing;
    const created: RoomState = {
      participants: new Map<string, PresenceParticipant>(),
      listeners: new Set<(event: CollaborationHubEvent) => void>(),
      currentView: null
    };
    rooms.set(shareId, created);
    return created;
  };

  const prunePresence = (room: RoomState): void => {
    const nowMs = Date.now();
    for (const [id, participant] of room.participants) {
      const lastSeen = Date.parse(participant.lastSeenAt);
      if (Number.isFinite(lastSeen) && nowMs - lastSeen > PRESENCE_TTL_MS) {
        room.participants.delete(id);
      }
    }
  };

  const dropRoomIfEmpty = (shareId: string, room: RoomState): void => {
    if (room.participants.size === 0 && room.listeners.size === 0) {
      rooms.delete(shareId);
    }
  };

  // Returns false when a new participant cannot be admitted because the room is at
  // capacity; existing participants are always allowed to refresh their presence.
  const admitParticipant = (room: RoomState, participant: PresenceParticipant): boolean => {
    if (!room.participants.has(participant.clientId) && room.participants.size >= MAX_PARTICIPANTS_PER_ROOM) {
      return false;
    }
    room.participants.set(participant.clientId, participant);
    return true;
  };

  const emit = (shareId: string, event: CollaborationHubEvent): void => {
    const room = rooms.get(shareId);
    if (!room) return;
    for (const listener of room.listeners) {
      listener(event);
    }
  };

  const emitPresence = (shareId: string): void => {
    const room = rooms.get(shareId);
    if (!room) return;
    emit(shareId, {
      type: "presence",
      participants: [...room.participants.values()]
    });
  };

  return {
    join: ({ shareId, clientId, displayName, color }) => {
      const room = getOrCreateRoom(shareId);
      prunePresence(room);
      const now = new Date().toISOString();
      admitParticipant(room, {
        clientId,
        displayName,
        color,
        joinedAt: room.participants.get(clientId)?.joinedAt ?? now,
        lastSeenAt: now
      });
      emitPresence(shareId);

      const subscribe = (listener: (event: CollaborationHubEvent) => void): (() => void) => {
        room.listeners.add(listener);
        return () => {
          room.listeners.delete(listener);
        };
      };

      const leave = (): void => {
        room.participants.delete(clientId);
        emitPresence(shareId);
        if (room.participants.size === 0 && room.listeners.size === 0) {
          rooms.delete(shareId);
        }
      };

      return {
        participants: [...room.participants.values()],
        currentView: room.currentView,
        subscribe,
        leave
      };
    },
    publishCursor: ({ shareId, clientId, displayName, color, x, y, visible, at }) => {
      const room = getOrCreateRoom(shareId);
      prunePresence(room);
      const current = room.participants.get(clientId);
      const admitted = admitParticipant(room, {
        clientId,
        displayName,
        color,
        joinedAt: current?.joinedAt ?? at,
        lastSeenAt: at
      });
      // Drop the update entirely when the room is full so a flood of distinct
      // clientIds can neither grow the map nor amplify presence broadcasts.
      if (!admitted) {
        dropRoomIfEmpty(shareId, room);
        return;
      }
      emit(shareId, {
        type: "cursor",
        clientId,
        displayName,
        color,
        x,
        y,
        visible,
        at
      });
    },
    publishDocument: ({ shareId, clientId, updatedAt }) => {
      emit(shareId, {
        type: "document",
        clientId,
        updatedAt
      });
    },
    publishView: ({ shareId, clientId, zoom, panX, panY, maximizedNodeId, at }) => {
      const room = getOrCreateRoom(shareId);
      prunePresence(room);
      const event: CollaborationViewEvent = {
        type: "view",
        clientId,
        zoom,
        panX,
        panY,
        maximizedNodeId,
        at
      };
      room.currentView = event;
      emit(shareId, event);
    }
  };
};
