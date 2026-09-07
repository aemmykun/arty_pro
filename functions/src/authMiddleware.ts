import * as admin from "firebase-admin";
import { Request, Response, NextFunction } from "express";

export type UserRole = "HK" | "SV" | "MGR" | "ADMIN";

export interface AuthenticatedRequest extends Request {
  user?: admin.auth.DecodedIdToken & {
    tenant_id?: string;
    role?: UserRole;
  };
}

export const checkAuth = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "No bearer token provided."
    });
  }

  const idToken = authHeader.split("Bearer ")[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);

    if (!decodedToken.tenant_id || !decodedToken.role) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Missing required tenant_id or role custom claim."
      });
    }

    req.user = decodedToken as AuthenticatedRequest["user"];
    return next();
  } catch {
    return res.status(401).json({
      error: "UNAUTHORIZED",
      message: "Invalid or expired token."
    });
  }
};

export const requireRole = (allowedRoles: UserRole[]) => {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    const role = req.user?.role;

    if (!role || !allowedRoles.includes(role)) {
      return res.status(403).json({
        error: "FORBIDDEN",
        message: "Insufficient role permission."
      });
    }

    return next();
  };
};
