import assert from "node:assert/strict";
import { test } from "node:test";

import { mapRoomRow } from "../dist/repositories/postgresRoomMapper.js";
import { PostgresRoomRepository } from "../dist/repositories/postgresRoomRepository.js";
import { RoomService } from "../dist/services/roomService.js";
import { ParticipantStore } from "../dist/store/participantStore.js";
import { RoomStore } from "../dist/store/roomStore.js";

const ROOM_ID = "00000000-0000-4000-8000-000000000001";

test("mapRoomRow maps timestamps and narrows language", () => {
  const createdAt = new Date("2026-08-18T12:00:00.000Z");
  const updatedAt = new Date("2026-08-18T12:05:00.000Z");
  const room = mapRoomRow({
    id: ROOM_ID,
    code: "print(\"Hello, 世界\")",
    language: "python",
    revision: 4,
    created_at: createdAt,
    updated_at: updatedAt,
  });

  assert.equal(room.editorState.language, "python");
  assert.equal(room.editorState.revision, 4);
  assert.equal(room.createdAt, createdAt.getTime());
  assert.equal(room.updatedAt, updatedAt.getTime());
  assert.deepEqual(room.participantIds, []);

  assert.throws(
    () => mapRoomRow({
      id: ROOM_ID,
      code: "",
      language: "ruby",
      revision: 0,
      created_at: createdAt,
      updated_at: updatedAt,
    }),
    /Unsupported room language/,
  );
});

test("RoomService keeps participant membership ephemeral and rejects stale edits", async () => {
  const repository = new RoomStore();
  const participantStore = new ParticipantStore();
  const service = new RoomService(repository, participantStore);
  const specialCode = [
    "query = \"select * from users where id = '1';\"",
    "print(\"Hello, 世界\")",
    "path = \"C:\\\\temp\"",
  ].join("\n");

  const room = await service.createRoom("python", specialCode);
  const participant = await service.joinRoom(room.id, "Ada");

  assert.ok(participant);
  assert.equal(service.getParticipants(room.id).length, 1);
  assert.equal((await repository.findById(room.id))?.participantIds.length, 0);

  const updated = await service.updateCode(room.id, `${specialCode}\nprint(1)`, 0);
  assert.equal(updated?.editorState.revision, 1);

  const stale = await service.updateCode(room.id, "stale", 0);
  assert.equal(stale, null);

  const canonical = await service.getRoom(room.id);
  assert.equal(canonical?.editorState.code, `${specialCode}\nprint(1)`);
  assert.equal(canonical?.editorState.revision, 1);
});

test("PostgresRoomRepository uses parameters and atomic revision matching", async () => {
  const calls = [];
  let storedRow = null;
  const fakePool = {
    async query(sql, parameters) {
      calls.push({ sql, parameters });

      if (sql.includes("insert into public.rooms")) {
        storedRow = {
          id: parameters[0],
          code: parameters[1],
          language: parameters[2],
          revision: parameters[3],
          created_at: parameters[4],
          updated_at: parameters[5],
        };
        return { rows: [storedRow] };
      }

      if (sql.includes("update public.rooms")) {
        if (!storedRow || storedRow.revision !== parameters[4]) {
          return { rows: [] };
        }

        storedRow = {
          ...storedRow,
          code: parameters[0],
          language: parameters[1],
          revision: parameters[2],
          updated_at: new Date(storedRow.updated_at.getTime() + 1_000),
        };
        return { rows: [storedRow] };
      }

      if (sql.includes("from public.rooms")) {
        return {
          rows: storedRow?.id === parameters[0] ? [storedRow] : [],
        };
      }

      throw new Error("Unexpected SQL in fake pool");
    },
  };
  const repository = new PostgresRoomRepository(fakePool);
  const code = "query = \"select * from users where id = '1';\"";
  const createdAt = Date.now();

  await repository.create({
    id: ROOM_ID,
    editorState: {
      code,
      language: "python",
      revision: 0,
    },
    participantIds: [],
    createdAt,
    updatedAt: createdAt,
  });

  assert.match(calls[0].sql, /values \(\$1, \$2, \$3, \$4, \$5, \$6\)/);
  assert.equal(calls[0].sql.includes(code), false);
  assert.equal(calls[0].parameters[1], code);

  const updated = await repository.updateEditorState(
    ROOM_ID,
    {
      code: `${code}\nprint(\"persisted\")`,
      language: "python",
      revision: 1,
    },
    0,
  );

  assert.equal(updated?.editorState.revision, 1);
  assert.match(calls[1].sql, /and revision = \$5/);

  const stale = await repository.updateEditorState(
    ROOM_ID,
    {
      code: "stale",
      language: "python",
      revision: 1,
    },
    0,
  );

  assert.equal(stale, null);
  assert.equal((await repository.findById(ROOM_ID))?.editorState.code, `${code}\nprint(\"persisted\")`);
});
