import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import express, { Response } from "express";
import cors from "cors";
import { z } from "zod";
import { checkAuth, requireRole, AuthenticatedRequest } from "./authMiddleware";
import { getAdapter } from "./pmsAdapter";

admin.initializeApp();
const db = admin.firestore();

const app = express();
app.use(cors({ origin: true }));
app.use(express.json());

const validStatuses = ["DIRTY", "IN_PROGRESS", "CLEAN", "INSPECTED"] as const;

const updateStatusSchema = z.object({
  status: z.enum(validStatuses),
  roomNumber: z.string().min(1).max(20)
});

const assignTaskSchema = z.object({
  taskId: z.string().min(1).max(128),
  userId: z.string().min(1).max(128)
});

const requireUser = (req: AuthenticatedRequest) => {
  if (!req.user?.uid || !req.user?.tenant_id || !req.user?.role) {
    throw new Error("Authenticated user context missing.");
  }
  return {
    uid: req.user.uid,
    tenantId: req.user.tenant_id,
    role: req.user.role
  };
};

const roleCanSeeAllTasks = (role: string) => ["SV", "MGR", "ADMIN"].includes(role);

app.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "artyapp-pro-api" });
});

// Housekeeper: Get My Tasks
app.get("/my-tasks", checkAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { uid, tenantId } = requireUser(req);

    const snapshot = await db
      .collection("tasks")
      .where("tenant_id", "==", tenantId)
      .where("assigned_to", "==", uid)
      .orderBy("created_at", "desc")
      .get();

    const tasks = snapshot.docs.map((doc) => ({
      id: doc.id,
      ...doc.data()
    }));

    return res.status(200).json(tasks);
  } catch (error) {
    console.error("GET /my-tasks failed", error);
    return res.status(500).json({ error: "INTERNAL_ERROR" });
  }
});

// Supervisor / Manager: Get Tenant Tasks
app.get(
  "/manager/tasks",
  checkAuth,
  requireRole(["SV", "MGR", "ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { tenantId, role } = requireUser(req);

      if (!roleCanSeeAllTasks(role)) {
        return res.status(403).json({ error: "FORBIDDEN" });
      }

      const snapshot = await db
        .collection("tasks")
        .where("tenant_id", "==", tenantId)
        .orderBy("created_at", "desc")
        .limit(200)
        .get();

      const tasks = snapshot.docs.map((doc) => ({
        id: doc.id,
        ...doc.data()
      }));

      return res.status(200).json(tasks);
    } catch (error) {
      console.error("GET /manager/tasks failed", error);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

// Housekeeper: Update Status
app.patch(
  "/tasks/:taskId/status",
  checkAuth,
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = updateStatusSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        details: parsed.error.flatten()
      });
    }

    const { taskId } = req.params;
    const { status, roomNumber } = parsed.data;

    try {
      const { uid, tenantId, role } = requireUser(req);
      const taskRef = db.collection("tasks").doc(taskId);
      const taskDoc = await taskRef.get();

      if (!taskDoc.exists) {
        return res.status(404).json({ error: "TASK_NOT_FOUND" });
      }

      const task = taskDoc.data();

      if (task?.tenant_id !== tenantId) {
        return res.status(403).json({ error: "TENANT_SCOPE_DENIED" });
      }

      const isAssignedUser = task?.assigned_to === uid;
      const isSupervisorOrManager = ["SV", "MGR", "ADMIN"].includes(role);

      if (!isAssignedUser && !isSupervisorOrManager) {
        return res.status(403).json({ error: "TASK_ACCESS_DENIED" });
      }

      await taskRef.update({
        status,
        roomNumber,
        updated_at: admin.firestore.FieldValue.serverTimestamp(),
        updated_by: uid
      });

      if (status === "CLEAN") {
        const settingsDoc = await db.collection("hotel_settings").doc(tenantId).get();
        const config = settingsDoc.data();

        if (config?.pms_adapter && config?.pms_key) {
          const adapter = getAdapter(config.pms_adapter);
          await adapter.updateRoomStatus(config.pms_key, roomNumber, status);
        }
      }

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("PATCH /tasks/:taskId/status failed", error);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

// Manager: Assign Task
app.patch(
  "/manager/assign",
  checkAuth,
  requireRole(["SV", "MGR", "ADMIN"]),
  async (req: AuthenticatedRequest, res: Response) => {
    const parsed = assignTaskSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: "BAD_REQUEST",
        details: parsed.error.flatten()
      });
    }

    const { taskId, userId } = parsed.data;

    try {
      const { uid, tenantId } = requireUser(req);
      const taskRef = db.collection("tasks").doc(taskId);
      const taskDoc = await taskRef.get();

      if (!taskDoc.exists) {
        return res.status(404).json({ error: "TASK_NOT_FOUND" });
      }

      const task = taskDoc.data();

      if (task?.tenant_id !== tenantId) {
        return res.status(403).json({ error: "TENANT_SCOPE_DENIED" });
      }

      const assigneeDoc = await db.collection("users").doc(userId).get();
      const assignee = assigneeDoc.data();

      if (!assigneeDoc.exists || assignee?.tenant_id !== tenantId) {
        return res.status(400).json({
          error: "INVALID_ASSIGNEE",
          message: "Assignee does not exist in the same tenant."
        });
      }

      await taskRef.update({
        assigned_to: userId,
        assigned_by: uid,
        updated_at: admin.firestore.FieldValue.serverTimestamp()
      });

      return res.status(200).json({ success: true });
    } catch (error) {
      console.error("PATCH /manager/assign failed", error);
      return res.status(500).json({ error: "INTERNAL_ERROR" });
    }
  }
);

export const api = functions.https.onRequest(app);
