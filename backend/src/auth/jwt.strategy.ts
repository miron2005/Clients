import { Injectable } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { Role } from "@prisma/client";

type AccessPayload = {
  sub: string;
  tenantId: string;
  role: Role;
  email: string;
  name: string;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_ACCESS_SECRET ?? "dev_access_secret_change_me",
      ignoreExpiration: false
    });
  }

  async validate(payload: AccessPayload) {
    return payload;
  }
}

