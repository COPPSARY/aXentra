import crypto from "crypto";

export const generateRandomToken = (length = 32) => {
  return crypto.randomBytes(length).toString("hex");
};

export const hashToken = (token: string) => {
  return crypto.createHash("sha256").update(token).digest("hex");
};
