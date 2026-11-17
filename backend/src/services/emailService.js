import nodemailer from "nodemailer";
import { config } from "../config/index.js";

class EmailService {
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

  async sendEmail({ to, subject, html, text }) {
    const mailOptions = {
      from: `"IT Asset Inventory" <${config.email.from}>`,
      to,
      subject,
      html,
      text,
    };

    return this.transporter.sendMail(mailOptions);
  }

  async sendPasswordResetEmail(user, token) {
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

  async sendPasswordChangedEmail(user) {
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

  async sendEmailNotLinkedNotice(email, message) {
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
