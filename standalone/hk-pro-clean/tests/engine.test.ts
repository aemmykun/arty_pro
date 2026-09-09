import assert from "node:assert/strict";
import test from "node:test";
import {
  Actor,
  DomainError,
  DomainState,
  HousekeepingEngine,
  IdFactory,
} from "../src/index.js";

class TestIds implements IdFactory {
  private n = 0;
  next(prefix: "task" | "inspection"): string {
    this.n += 1;
    return `${prefix}-${this.n}`;
  }
}

const engine = new HousekeepingEngine(new TestIds(), { now: () => "2026-09-10T00:00:00.000Z" });

const manager: Actor = {
  tenantId: "tenant-a",
  propertyId: "property-1",
  userId: "mgr-1",
  role: "MGR",
};

const hk: Actor = {
  tenantId: "tenant-a",
  propertyId: "property-1",
  userId: "hk-1",
  role: "HK",
};

const initial = (): DomainState => ({
  rooms: [{
    tenantId: "tenant-a",
    propertyId: "property-1",
    roomId: "room-101",
    roomNumber: "101",
    status: "READY",
    currentStayRef: "stay-1",
    updatedAt: "2026-09-09T00:00:00.000Z",
  }],
  tasks: [],
  inspections: [],
  processedEventIds: [],
});

test("checkout creates one departure clean task and marks room dirty", () => {
  const state = engine.checkout(initial(), manager, {
    tenantId: "tenant-a",
    propertyId: "property-1",
    eventId: "checkout-1",
    roomId: "room-101",
    stayRef: "stay-1",
    occurredAt: "2026-09-10T00:00:00.000Z",
  });

  assert.equal(state.rooms[0]?.status, "DIRTY");
  assert.equal(state.tasks.length, 1);
  assert.equal(state.tasks[0]?.serviceType, "DEPARTURE");
  assert.equal(state.tasks[0]?.inspectionRequired, true);
});

test("housekeeper cannot start another user's task", () => {
  const state = engine.assignTask(
    engine.checkout(initial(), manager, {
      tenantId: "tenant-a",
      propertyId: "property-1",
      eventId: "checkout-2",
      roomId: "room-101",
      stayRef: "stay-1",
      occurredAt: "2026-09-10T00:00:00.000Z",
    }),
    manager,
    "task-2",
    "hk-other",
  );

  assert.throws(
    () => engine.startTask(state, hk, "task-2"),
    (error: unknown) => error instanceof DomainError && error.code === "TASK_NOT_ASSIGNED",
  );
});

test("clean task completion requires inspection and failed inspection creates rework", () => {
  let state = engine.checkout(initial(), manager, {
    tenantId: "tenant-a",
    propertyId: "property-1",
    eventId: "checkout-3",
    roomId: "room-101",
    stayRef: "stay-1",
    occurredAt: "2026-09-10T00:00:00.000Z",
  });

  const taskId = state.tasks[0]!.taskId;
  state = engine.assignTask(state, manager, taskId, hk.userId);
  state = engine.startTask(state, hk, taskId);
  state = engine.completeTask(state, hk, taskId);

  assert.equal(state.rooms[0]?.status, "INSPECTION_REQUIRED");

  state = engine.inspect(state, manager, taskId, "FAIL", ["Bathroom mirror"]);

  assert.equal(state.rooms[0]?.status, "DIRTY");
  assert.equal(state.inspections.at(-1)?.result, "FAIL");
  assert.equal(state.tasks.at(-1)?.taskType, "REWORK");
});
