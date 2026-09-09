import {
  Actor,
  CheckoutEvent,
  DomainError,
  DomainState,
  Inspection,
  InspectionResult,
  Room,
  Scope,
  Task,
} from "./domain.js";

export interface IdFactory {
  next(prefix: "task" | "inspection"): string;
}

export interface Clock {
  now(): string;
}

const sameScope = (a: Scope, b: Scope): boolean =>
  a.tenantId === b.tenantId && a.propertyId === b.propertyId;

const requireScope = (actor: Actor, resource: Scope): void => {
  if (!sameScope(actor, resource)) {
    throw new DomainError("SCOPE_DENIED", "Actor is outside the resource tenant/property scope.");
  }
};

const requireSupervisor = (actor: Actor): void => {
  if (!["SV", "MGR", "ADMIN"].includes(actor.role)) {
    throw new DomainError("ROLE_DENIED", "Supervisor or higher authority required.");
  }
};

const findRoom = (state: DomainState, scope: Scope, roomId: string): Room => {
  const room = state.rooms.find((r) => r.roomId === roomId && sameScope(r, scope));
  if (!room) throw new DomainError("NOT_FOUND", "Room not found in scope.");
  return room;
};

const findTask = (state: DomainState, scope: Scope, taskId: string): Task => {
  const task = state.tasks.find((t) => t.taskId === taskId && sameScope(t, scope));
  if (!task) throw new DomainError("NOT_FOUND", "Task not found in scope.");
  return task;
};

export class HousekeepingEngine {
  constructor(
    private readonly ids: IdFactory,
    private readonly clock: Clock,
  ) {}

  checkout(state: DomainState, actor: Actor, event: CheckoutEvent): DomainState {
    requireScope(actor, event);
    if (!["SV", "MGR", "ADMIN"].includes(actor.role)) {
      throw new DomainError("ROLE_DENIED", "Checkout requires supervisor or higher authority.");
    }
    if (state.processedEventIds.includes(event.eventId)) {
      throw new DomainError("DUPLICATE_EVENT", "Checkout event has already been processed.");
    }

    const room = findRoom(state, event, event.roomId);
    if (room.currentStayRef && room.currentStayRef !== event.stayRef) {
      throw new DomainError("INVALID_STATE", "Checkout stay reference does not match the room state.");
    }

    const now = this.clock.now();
    const cleanTask: Task = {
      tenantId: room.tenantId,
      propertyId: room.propertyId,
      taskId: this.ids.next("task"),
      roomId: room.roomId,
      serviceType: "DEPARTURE",
      taskType: "CLEAN",
      status: "PENDING",
      priority: "NORMAL",
      createdBy: actor.userId,
      createdAt: now,
      inspectionRequired: true,
      sourceEventId: event.eventId,
      notes: "Departure clean",
    };

    return {
      ...state,
      rooms: state.rooms.map((r) =>
        r.roomId === room.roomId && sameScope(r, room)
          ? {
              ...r,
              status: "DIRTY",
              currentStayRef: undefined,
              assignedStaffId: undefined,
              updatedAt: now,
            }
          : r,
      ),
      tasks: [...state.tasks, cleanTask],
      processedEventIds: [...state.processedEventIds, event.eventId],
    };
  }

  assignTask(state: DomainState, actor: Actor, taskId: string, assigneeUserId: string): DomainState {
    requireSupervisor(actor);
    const task = findTask(state, actor, taskId);
    requireScope(actor, task);
    if (task.status === "DONE" || task.status === "CANCELLED") {
      throw new DomainError("INVALID_STATE", "Closed task cannot be assigned.");
    }

    return {
      ...state,
      tasks: state.tasks.map((t) =>
        t.taskId === task.taskId
          ? { ...t, assignedTo: assigneeUserId }
          : t,
      ),
    };
  }

  startTask(state: DomainState, actor: Actor, taskId: string): DomainState {
    const task = findTask(state, actor, taskId);
    requireScope(actor, task);

    const privileged = ["SV", "MGR", "ADMIN"].includes(actor.role);
    if (task.assignedTo !== actor.userId && !privileged) {
      throw new DomainError("TASK_NOT_ASSIGNED", "Only assigned staff or privileged roles may start this task.");
    }
    if (task.status !== "PENDING") {
      throw new DomainError("INVALID_STATE", "Only pending tasks may be started.");
    }

    const now = this.clock.now();
    const room = findRoom(state, task, task.roomId);

    return {
      ...state,
      tasks: state.tasks.map((t) =>
        t.taskId === task.taskId ? { ...t, status: "IN_PROGRESS", startedAt: now } : t,
      ),
      rooms: state.rooms.map((r) =>
        r.roomId === room.roomId && sameScope(r, room)
          ? { ...r, status: task.taskType === "CLEAN" ? "IN_PROGRESS" : r.status, updatedAt: now }
          : r,
      ),
    };
  }

  completeTask(state: DomainState, actor: Actor, taskId: string): DomainState {
    const task = findTask(state, actor, taskId);
    requireScope(actor, task);

    const privileged = ["SV", "MGR", "ADMIN"].includes(actor.role);
    if (task.assignedTo !== actor.userId && !privileged) {
      throw new DomainError("TASK_NOT_ASSIGNED", "Only assigned staff or privileged roles may complete this task.");
    }
    if (task.status !== "IN_PROGRESS") {
      throw new DomainError("INVALID_STATE", "Only in-progress tasks may be completed.");
    }

    const now = this.clock.now();
    const room = findRoom(state, task, task.roomId);

    const nextRoomStatus =
      task.taskType === "CLEAN"
        ? task.inspectionRequired
          ? "INSPECTION_REQUIRED"
          : "CLEAN"
        : room.status;

    return {
      ...state,
      tasks: state.tasks.map((t) =>
        t.taskId === task.taskId ? { ...t, status: "DONE", completedAt: now } : t,
      ),
      rooms: state.rooms.map((r) =>
        r.roomId === room.roomId && sameScope(r, room)
          ? {
              ...r,
              status: nextRoomStatus,
              lastCleanedAt: task.taskType === "CLEAN" ? now : r.lastCleanedAt,
              updatedAt: now,
            }
          : r,
      ),
    };
  }

  inspect(
    state: DomainState,
    actor: Actor,
    taskId: string,
    result: InspectionResult,
    findings: string[] = [],
  ): DomainState {
    requireSupervisor(actor);
    const task = findTask(state, actor, taskId);
    requireScope(actor, task);

    if (task.taskType !== "CLEAN" || task.status !== "DONE" || !task.inspectionRequired) {
      throw new DomainError("INVALID_STATE", "Task is not eligible for inspection.");
    }

    const room = findRoom(state, task, task.roomId);
    if (room.status !== "INSPECTION_REQUIRED") {
      throw new DomainError("INVALID_STATE", "Room is not waiting for inspection.");
    }

    const now = this.clock.now();
    const inspectionId = this.ids.next("inspection");
    let reworkTask: Task | undefined;

    if (result === "FAIL") {
      reworkTask = {
        tenantId: task.tenantId,
        propertyId: task.propertyId,
        taskId: this.ids.next("task"),
        roomId: task.roomId,
        serviceType: task.serviceType,
        taskType: "REWORK",
        status: "PENDING",
        priority: "URGENT",
        createdBy: actor.userId,
        createdAt: now,
        inspectionRequired: true,
        notes: findings.join("; ") || "Inspection failed",
      };
    }

    const inspection: Inspection = {
      tenantId: task.tenantId,
      propertyId: task.propertyId,
      inspectionId,
      roomId: task.roomId,
      taskId: task.taskId,
      inspectorId: actor.userId,
      result,
      inspectedAt: now,
      findings,
      ...(reworkTask ? { reworkTaskId: reworkTask.taskId } : {}),
    };

    return {
      ...state,
      rooms: state.rooms.map((r) =>
        r.roomId === room.roomId && sameScope(r, room)
          ? { ...r, status: result === "PASS" ? "INSPECTED" : "DIRTY", updatedAt: now }
          : r,
      ),
      tasks: reworkTask ? [...state.tasks, reworkTask] : state.tasks,
      inspections: [...state.inspections, inspection],
    };
  }
}
