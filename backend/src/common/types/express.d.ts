import { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      tenant?: {
        id: string;
        slug: string;
        timezone: string;
        currency: string;
      };
      auth?: {
        userId: string;
        tenantId: string;
        role: Role;
        email: string;
        name: string;
      };
    }
  }
}

export {};

