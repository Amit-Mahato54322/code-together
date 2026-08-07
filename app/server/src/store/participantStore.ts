import type { Participant } from "../domain/participant.js";
export class ParticipantStore{

    // ## separate store to store participants and their information ##
    // ## gives independent ownership of participant data ##
    //key -> participant ID
    //value -> participant object

    private readonly participants = new Map<string, Participant>();

    // save a enw participant or replace an existing participant with the same ID.
    save(participant: Participant):void{
        this.participants.set(participant.id, participant);
    }

    //return participant if it exists.
    // if no participant has this ID, Map.get() returns undefined. 

    get(participantId:string): Participant | undefined{
        return this.participants.get(participantId);
    }

    // check if a participant currently exists in the store.
    has(participantId: string):boolean{
        return this.participants.has(participantId);
    }

    //remove a participant from a memory
    delete(participantId: string): boolean{
        return this.participants.delete(participantId);
    }

    // getter to return participantStore.sizxe 
    get size(): number{
        return this.participants.size;
    }
}