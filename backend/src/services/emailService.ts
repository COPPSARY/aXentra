import nodemailer, { type Transporter } from "nodemailer";
import { config } from "../config/index.js";

/** The user fields an email needs. */
interface EmailRecipient {
  username: string;
  email: string | null;
}

class EmailService {
  transporter: Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.port === 465,
      auth: {
        user: config.email.user,
        pass: config.email.pass,
      },
    });
  }

  async sendEmail({
    to,
    subject,
    html,
    text,
  }: {
    to: string | null;
    subject: string;
    html: string;
    text: string;
  }) {
    const mailOptions = {
      from: `"IT Asset Inventory" <${config.email.from}>`,
      // A missing address is passed through; nodemailer then rejects the send.
      to: to ?? undefined,
      subject,
      html,
      text,
    };

    return this.transporter.sendMail(mailOptions);
  }

  async sendPasswordResetEmail(user: EmailRecipient, token: string) {
    const resetUrl = `${config.frontendUrl}/reset-password?token=${token}`;

    const html = `
      <p>Hello ${user.username},</p>
      <p>You requested a password reset.</p>
      <p><a href="${resetUrl}">Reset your password</a></p>
      <p>This link expires in 1 hour.</p>
      <p>If you did not request this, you can ignore this email.</p>
    `;

    const text = `
Hello ${user.username},

You requested a password reset.
Reset your password: ${resetUrl}

This link expires in 1 hour.
If you did not request this, you can ignore this email.
    `.trim();

    return this.sendEmail({
      to: user.email,
      subject: "Reset your password",
      html,
      text,
    });
  }

  async sendPasswordChangedEmail(user: EmailRecipient) {
    const html = `
      <p>Hello ${user.username},</p>
      <p>Your password was changed successfully.</p>
      <p>If this was not you, contact support immediately.</p>
    `;

    const text = `
Hello ${user.username},

Your password was changed successfully.
If this was not you, contact support immediately.
    `.trim();

    return this.sendEmail({
      to: user.email,
      subject: "Your password was changed",
      html,
      text,
    });
  }

  async sendEmailNotLinkedNotice(email: string, message: string) {
    const html = `
      <p>Hello,</p>
      <p>${message}</p>
    `;

    const text = `
Hello,

${message}
    `.trim();

    return this.sendEmail({
      to: email,
      subject: "Password reset request update",
      html,
      text,
    });
  }
}

export const emailService = new EmailService();
