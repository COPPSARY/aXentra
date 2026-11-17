import jwt from "jsonwebtoken";
import { config } from "../config/index.js";

export const generateAccessToken = (payload) => {
  return jwt.sign(payload, config.jwt.secret, {
    expiresIn: config.jwt.expiresIn,
  });
};

export const verifyAccessToken = (token) => {
  return jwt.verify(token, config.jwt.secret);
};
