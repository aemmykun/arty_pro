export type Role = "HK" | "SV" | "MGR" | "ADMIN";

export type RoomStatus =
  | "READY"
  | "DIRTY"
  | "IN_PROGRESS"
  | "CLEAN"
  | "INSPECTION_REQUIRED"
  | "INSPECTED"
  | "DND"
  | "MAINTENANCE"
  | "OUT_OF_ORDER";

export type ServiceType =
  | "DEPARTURE"
  | "ARRIVAL"
  | "STAYOVER"
  | "HOLDOVER"
  | "LINEN_CHANGE"
  | "TURNDOWN"
  | "MAINTENANCE";

export type TaskType = "CLEAN" | "INSPECT" | "RESTOCK" | "MAINTENANCE" | "REWORK";

export type TaskStatus = "PENDING" | "IN_PROGRESS" | "DONE" | "CANCELLED";

export type InspectionResult = "PASS" | "FAIL";

export interface Scope {
  tenantId: string;
  propertyId: string;
}

export interface Actor extends Scope {
  userId: string;
  role: Role;
}

export interface Room extends Scope {
  roomId: string;
  roomNumber: string;
  status: RoomStatus;
  assignedStaffId?: string;
  currentStayRef?: string;
  lastCleanedAt?: string;
  updatedAt: string;
}

export interface Task extends Scope {
  taskId: string;
  roomId: string;
  serviceType: ServiceType;
  taskType: TaskType;
  status: TaskStatus;
  priority: "LOW" | "NORMAL" | "URGENT";
  createdBy: string;
  createdAt: string;
  assignedTo?: string;
  startedAt?: string;
  completedAt?: string;
  inspectionRequired: boolean;
  sourceEventId?: string;
  notes?: string;
}

export interface Inspection extends Scope {
  inspectionId: string;
  roomId: string;
  taskId: string;
  inspectorId: string;
  result: InspectionResult;
  inspectedAt: string;
  findings: string[];
  reworkTaskId?: string;
}

export interface CheckoutEvent extends Scope {
  eventId: string;
  roomId: string;
  stayRef: string;
  occurredAt: string;
}

export interface DomainState {
  rooms: Room[];
  tasks: Task[];
  inspections: Inspection[];
  processedEventIds: string[];
}

export class DomainError extends Error {
  constructor(
    public readonly code:
      | "SCOPE_DENIED"
      | "ROLE_DENIED"
      | "NOT_FOUND"
      | "INVALID_STATE"
      | "TASK_NOT_ASSIGNED"
      | "DUPLICATE_EVENT",
    message: string,
  ) {
    super(message);
    this.name = "DomainError";
  }
}
