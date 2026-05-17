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

export type CollaborationPresenceEvent = Readonly<{
  type: "presence";
  participants: readonly PresenceParticipant[];
}>;

export type CollaborationHubEvent =
  | CollaborationCursorEvent
  | CollaborationDocumentEvent
  | CollaborationPresenceEvent;

export type CollaborationHub = Readonly<{
  join: (input: Readonly<{
    shareId: string;
    clientId: string;
    displayName: string;
    color: string;
  }>) => Readonly<{
    participants: readonly PresenceParticipant[];
    subscribe: (listener: (event: CollaborationHubEvent) => void) => () => void;
    leave: () => void;
  }>;
  publishCursor: (input: Omit<CollaborationCursorEvent, "type"> & Readonly<{ shareId: string }>) => void;
  publishDocument: (input: Omit<CollaborationDocumentEvent, "type"> & Readonly<{ shareId: string }>) => void;
}>;

type RoomState = {
  participants: Map<string, PresenceParticipant>;
  listeners: Set<(event: CollaborationHubEvent) => void>;
};

export const createCollaborationHub = (): CollaborationHub => {
  const rooms = new Map<string, RoomState>();

  const getOrCreateRoom = (shareId: string): RoomState => {
    const existing = rooms.get(shareId);
    if (existing) return existing;
    const created: RoomState = {
      participants: new Map<string, PresenceParticipant>(),
      listeners: new Set<(event: CollaborationHubEvent) => void>()
    };
    rooms.set(shareId, created);
    return created;
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
      const now = new Date().toISOString();
      room.participants.set(clientId, {
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
        subscribe,
        leave
      };
    },
    publishCursor: ({ shareId, clientId, displayName, color, x, y, visible, at }) => {
      const room = getOrCreateRoom(shareId);
      const current = room.participants.get(clientId);
      room.participants.set(clientId, {
        clientId,
        displayName,
        color,
        joinedAt: current?.joinedAt ?? at,
        lastSeenAt: at
      });
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
    }
  };
};
