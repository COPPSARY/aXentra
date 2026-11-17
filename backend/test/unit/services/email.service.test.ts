import { beforeEach, describe, expect, it, vi } from "vitest";

const { sendMailMock, createTransportMock } = vi.hoisted(() => {
  const sendMail = vi.fn();
  const createTransport = vi.fn(() => ({
    sendMail,
  }));
  return {
    sendMailMock: sendMail,
    createTransportMock: createTransport,
  };
});

vi.mock("nodemailer", () => ({
  default: {
    createTransport: createTransportMock,
  },
}));

vi.mock("../../../src/config/index.js", () => ({
  config: {
    email: {
      host: "smtp.example.com",
      port: 587,
      user: "user@example.com",
      pass: "secret",
      from: "noreply@example.com",
    },
    frontendUrl: "http://frontend.local",
  },
}));

import { emailService } from "../../../src/services/emailService.js";

describe("EmailService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    sendMailMock.mockResolvedValue({ accepted: ["ok@example.com"] });
  });

  it("sendPasswordResetEmail should include reset token URL", async () => {
    await emailService.sendPasswordResetEmail(
      { username: "alice", email: "alice@example.com" },
      "token-123"
    );

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "alice@example.com",
        subject: "Reset your password",
      })
    );

    const payload = sendMailMock.mock.calls[0][0];
    expect(payload.from).toContain("noreply@example.com");
    expect(payload.text).toContain("token=token-123");
  });

  it("sendEmailNotLinkedNotice should send notice email", async () => {
    await emailService.sendEmailNotLinkedNotice(
      "no-user@example.com",
      "Your email is not linked to any account"
    );

    expect(sendMailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "no-user@example.com",
        subject: "Password reset request update",
      })
    );
  });
});
