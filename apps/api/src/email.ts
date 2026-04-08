/**
 * LexOS Email Service
 * Email sending with HTML templates
 */

import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import { config } from './config.js';
import { logger } from './logger.js';

// ============================================================
// TYPES
// ============================================================

export interface EmailOptions {
  to: string | string[];
  subject: string;
  text?: string;
  html?: string;
}

// ============================================================
// TRANSPORTER
// ============================================================

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  if (config.EMAIL_DELIVERY_MODE === 'smtp') {
    transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_SECURE === 'true',
      auth:
        config.SMTP_USER && config.SMTP_PASS
          ? {
              user: config.SMTP_USER,
              pass: config.SMTP_PASS,
            }
          : undefined,
    });
    logger.info('SMTP transporter initialized');
  } else {
    // Log mode - just log emails instead of sending
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
    logger.info('Email transporter in log mode');
  }

  return transporter;
}

// ============================================================
// SEND EMAIL
// ============================================================

export async function sendEmail(options: EmailOptions): Promise<void> {
  const transport = getTransporter();

  const mailOptions = {
    from: config.MAIL_FROM,
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  };

  if (config.EMAIL_DELIVERY_MODE === 'log') {
    logger.info({ email: mailOptions }, 'Email (log mode)');
    return;
  }

  await transport.sendMail(mailOptions);
  logger.info({ to: options.to, subject: options.subject }, 'Email sent');
}

// ============================================================
// EMAIL TEMPLATES
// ============================================================

const BASE_STYLES = `
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; line-height: 1.6; color: #334155; margin: 0; padding: 0; }
  .container { max-width: 600px; margin: 0 auto; padding: 40px 20px; }
  .header { text-align: center; margin-bottom: 30px; }
  .logo { font-size: 28px; font-weight: 700; color: #0A1628; }
  .logo span { color: #C9A84C; }
  .content { background: #ffffff; border: 1px solid #E2E8F0; border-radius: 8px; padding: 32px; }
  .button { display: inline-block; background: #C9A84C; color: #0A1628 !important; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin: 20px 0; }
  .button:hover { background: #B89843; }
  .footer { text-align: center; margin-top: 30px; font-size: 12px; color: #64748B; }
  .code { font-family: 'JetBrains Mono', monospace; background: #F1F5F9; padding: 4px 8px; border-radius: 4px; font-size: 14px; }
  .warning { background: #FEF3C7; border: 1px solid #D97706; border-radius: 6px; padding: 16px; margin: 16px 0; }
`;

function wrapTemplate(content: string): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>${BASE_STYLES}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">Lex<span>OS</span></div>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p>This email was sent by LexOS. If you didn't request this, please ignore it.</p>
      <p>© ${new Date().getFullYear()} LexOS. All rights reserved.</p>
    </div>
  </div>
</body>
</html>
  `.trim();
}

// ============================================================
// TEMPLATE FUNCTIONS
// ============================================================

export async function sendPasswordResetEmail(
  email: string,
  resetUrl: string,
  attorneyName: string
): Promise<void> {
  const html = wrapTemplate(`
    <h2>Reset Your Password</h2>
    <p>Hi ${attorneyName},</p>
    <p>We received a request to reset the password for your LexOS account. Click the button below to set a new password:</p>
    <p style="text-align: center;">
      <a href="${resetUrl}" class="button">Reset Password</a>
    </p>
    <p>This link will expire in <strong>1 hour</strong>.</p>
    <p>If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p>
    <div class="warning">
      <strong>Security Notice:</strong> Never share this link with anyone. LexOS support will never ask for your password.
    </div>
  `);

  await sendEmail({
    to: email,
    subject: 'Reset Your LexOS Password',
    html,
  });
}

export async function sendInvitationEmail(
  email: string,
  inviteUrl: string,
  firmName: string,
  inviterName: string
): Promise<void> {
  const html = wrapTemplate(`
    <h2>You've Been Invited to LexOS</h2>
    <p>Hi there,</p>
    <p><strong>${inviterName}</strong> has invited you to join <strong>${firmName}</strong> on LexOS, the AI-powered legal intelligence platform.</p>
    <p style="text-align: center;">
      <a href="${inviteUrl}" class="button">Accept Invitation</a>
    </p>
    <p>This invitation will expire in <strong>7 days</strong>.</p>
    <p>If you have any questions, please contact your firm administrator.</p>
  `);

  await sendEmail({
    to: email,
    subject: `You're invited to join ${firmName} on LexOS`,
    html,
  });
}

export async function sendMFAEnabledEmail(
  email: string,
  attorneyName: string
): Promise<void> {
  const html = wrapTemplate(`
    <h2>Two-Factor Authentication Enabled</h2>
    <p>Hi ${attorneyName},</p>
    <p>Two-factor authentication has been successfully enabled for your LexOS account. Your account is now more secure.</p>
    <p>From now on, you'll need to enter a code from your authenticator app when signing in.</p>
    <div class="warning">
      <strong>Important:</strong> Make sure you've saved your recovery codes in a safe place. You'll need them if you lose access to your authenticator app.
    </div>
    <p>If you didn't enable two-factor authentication, please contact your administrator immediately.</p>
  `);

  await sendEmail({
    to: email,
    subject: 'Two-Factor Authentication Enabled on LexOS',
    html,
  });
}

export async function sendObligationReminderEmail(
  email: string,
  attorneyName: string,
  obligationDescription: string,
  matterName: string,
  deadlineDate: string,
  daysUntilDue: number
): Promise<void> {
  const urgencyClass = daysUntilDue <= 3 ? 'warning' : '';
  
  const html = wrapTemplate(`
    <h2>Upcoming Obligation Reminder</h2>
    <p>Hi ${attorneyName},</p>
    <p>This is a reminder about an upcoming obligation for matter <strong>${matterName}</strong>:</p>
    <div class="${urgencyClass}" style="background: #F1F5F9; border-radius: 6px; padding: 16px; margin: 16px 0;">
      <p style="margin: 0;"><strong>Obligation:</strong> ${obligationDescription}</p>
      <p style="margin: 8px 0 0 0;"><strong>Due Date:</strong> ${deadlineDate} (${daysUntilDue} days remaining)</p>
    </div>
    <p style="text-align: center;">
      <a href="${config.FRONTEND_URL}/matters" class="button">View in LexOS</a>
    </p>
  `);

  await sendEmail({
    to: email,
    subject: `Obligation Due in ${daysUntilDue} Days: ${matterName}`,
    html,
  });
}

export async function sendDocumentProcessedEmail(
  email: string,
  attorneyName: string,
  documentName: string,
  matterName: string,
  flagCount: number,
  criticalFlags: number
): Promise<void> {
  const flagSummary = flagCount > 0
    ? `<p>We found <strong>${flagCount} flags</strong>${criticalFlags > 0 ? ` including <strong style="color: #DC2626;">${criticalFlags} critical issues</strong>` : ''} that require your attention.</p>`
    : '<p>No flags were raised during analysis.</p>';

  const html = wrapTemplate(`
    <h2>Document Analysis Complete</h2>
    <p>Hi ${attorneyName},</p>
    <p>The document <strong>${documentName}</strong> for matter <strong>${matterName}</strong> has been fully analyzed.</p>
    ${flagSummary}
    <p style="text-align: center;">
      <a href="${config.FRONTEND_URL}/matters" class="button">Review Document</a>
    </p>
    <p style="font-size: 12px; color: #64748B;">
      <em>AI-generated analysis — requires attorney review</em>
    </p>
  `);

  await sendEmail({
    to: email,
    subject: `Document Analyzed: ${documentName}`,
    html,
  });
}

function formatUsd(amountCents: number): string {
  return `$${(Math.max(0, amountCents) / 100).toFixed(2)}`;
}

export async function sendMalwareAlertEmail(
  tenantAdminEmail: string,
  documentName: string,
  tenantName: string,
  viruses: string[],
): Promise<void> {
  const threatList = viruses.length > 0 ? viruses.join(', ') : 'unknown';

  const html = wrapTemplate(`
    <h2>Security Alert: Malware Detected</h2>
    <p>A newly uploaded file in <strong>${tenantName}</strong> was quarantined after malware scanning.</p>
    <ul>
      <li><strong>File:</strong> ${documentName}</li>
      <li><strong>Threat(s):</strong> ${threatList}</li>
      <li><strong>Action Taken:</strong> File quarantined and pipeline stopped</li>
    </ul>
    <div class="warning">
      <strong>Required Action:</strong> Review the upload source and ask the uploader to submit a clean copy.
    </div>
  `);

  await sendEmail({
    to: tenantAdminEmail,
    subject: `Security Alert: Malware Detected in ${tenantName}`,
    html,
  });
}

export async function sendPaymentFailedEmail(
  adminEmail: string,
  amount: number,
  invoiceUrl: string,
): Promise<void> {
  const safeInvoiceUrl = invoiceUrl || `${config.FRONTEND_URL}/billing`;
  const amountLabel = formatUsd(amount);

  const html = wrapTemplate(`
    <h2>Payment Failed</h2>
    <p>We were unable to process your latest LexOS invoice payment.</p>
    <ul>
      <li><strong>Amount Due:</strong> ${amountLabel}</li>
    </ul>
    <p style="text-align: center;">
      <a href="${safeInvoiceUrl}" class="button">Review Invoice</a>
    </p>
    <div class="warning">
      <strong>Impact:</strong> Your subscription is now marked as past due. Service limits may apply if payment is not resolved.
    </div>
  `);

  await sendEmail({
    to: adminEmail,
    subject: `Action Required: LexOS Payment Failed (${amountLabel})`,
    html,
  });
}
