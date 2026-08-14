import type { Participant } from "../api/rooms";

interface ParticipantListProps {
  participants: Participant[];
}

export function ParticipantList({ participants }: ParticipantListProps) {
  return (
    <section className="participants-panel">
      <div className="sidebar-title">PARTICIPANTS</div>

      {participants.length === 0 ? (
        <p className="participants-empty">Join the room to see collaborators.</p>
      ) : (
        <ul className="participant-list">
          {participants.map((participant) => (
            <li key={participant.id} className="participant-item">
              <span className="participant-dot" />
              {participant.displayName}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
