import type { Participant } from "../domain/participant.js";

interface StoredParticipant {
  participant: Participant;
  roomId: string;
}

/**
 * Owns temporary participant identity and room membership for this process.
 * This state intentionally disappears when the backend restarts.
 */
export class ParticipantStore {
  private readonly participants = new Map<string, StoredParticipant>();

  save(roomId: string, participant: Participant): void {
    this.participants.set(participant.id, {
      participant,
      roomId,
    });
  }

  get(participantId: string): Participant | undefined {
    return this.participants.get(participantId)?.participant;
  }

  getByRoomId(roomId: string): Participant[] {
    return [...this.participants.values()]
      .filter((storedParticipant) => storedParticipant.roomId === roomId)
      .map((storedParticipant) => storedParticipant.participant);
  }

  belongsToRoom(participantId: string, roomId: string): boolean {
    return this.participants.get(participantId)?.roomId === roomId;
  }

  delete(participantId: string): boolean {
    return this.participants.delete(participantId);
  }
}
