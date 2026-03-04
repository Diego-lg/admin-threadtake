import { UserRole, UserStatus } from "@prisma/client";

export type UserColumn = {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  maxSavedDesigns: number | null;
  effectiveLimit: number;
};
