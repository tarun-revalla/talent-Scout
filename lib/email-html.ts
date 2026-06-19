import { APP_NAME, BRAND } from "./brand";

export interface EmailHtmlOptions {
  recruiterName?: string;
  jobTitle?: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Convert plain-text email body into simple HTML paragraphs. */
export function plainTextToHtml(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").trim();
  if (!normalized) return "<p></p>";

  return normalized
    .split(/\n{2,}/)
    .map((block) => {
      const lines = block.split("\n").map((line) => escapeHtml(line.trimEnd()));
      return `<p class="email-body-text" style="margin:0 0 16px;font-size:15px;line-height:1.6;color:${BRAND.colors.text};">${lines.join("<br>")}</p>`;
    })
    .join("");
}

export function wrapEmailHtml(bodyText: string, options: EmailHtmlOptions = {}): string {
  const recruiterName = escapeHtml(options.recruiterName?.trim() || "Talent Team");
  const jobTitle = options.jobTitle?.trim();
  const bodyHtml = plainTextToHtml(bodyText);
  const logoUrl = BRAND.assets.yextLogoCdn;

  const headerSubtitle = jobTitle
    ? `<p class="email-subtitle" style="margin:6px 0 0;font-size:14px;line-height:1.4;color:${BRAND.colors.primaryLight};opacity:0.95;">Re: ${escapeHtml(jobTitle)}</p>`
    : "";

  const { primary, primaryHover, primaryLight, surface, border, textMuted, textSubtle, white } =
    BRAND.colors;

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <title>${escapeHtml(APP_NAME)}</title>
  <!--[if mso]>
  <noscript>
    <xml>
      <o:OfficeDocumentSettings>
        <o:PixelsPerInch>96</o:PixelsPerInch>
      </o:OfficeDocumentSettings>
    </xml>
  </noscript>
  <![endif]-->
  <style type="text/css">
    body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
    table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; border-collapse: collapse; }
    img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; display: block; }
    body { margin: 0 !important; padding: 0 !important; width: 100% !important; }
    a { color: ${primary}; }
    @media only screen and (max-width: 620px) {
      .email-wrapper { padding: 12px 8px !important; }
      .email-container { width: 100% !important; max-width: 100% !important; border-radius: 8px !important; }
      .email-header-cell { padding: 16px 20px !important; }
      .email-body-cell { padding: 20px !important; }
      .email-footer-cell { padding: 16px 20px !important; }
      .email-header-row { display: block !important; width: 100% !important; }
      .email-logo-cell { display: block !important; width: 100% !important; padding-bottom: 10px !important; text-align: left !important; }
      .email-title-cell { display: block !important; width: 100% !important; text-align: left !important; }
      .email-title { font-size: 17px !important; }
      .email-subtitle { font-size: 13px !important; }
      .email-body-text { font-size: 14px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${surface};">
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">
    Message from ${escapeHtml(APP_NAME)}${jobTitle ? ` — ${escapeHtml(jobTitle)}` : ""}
  </div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-wrapper" style="background:${surface};padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-container" style="max-width:600px;width:100%;background:${white};border:1px solid ${border};border-radius:12px;overflow:hidden;">
          <tr>
            <td class="email-header-cell" style="background:${primary};padding:20px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-header-row">
                <tr>
                  <td class="email-logo-cell" width="48" valign="middle" style="padding-right:12px;">
                    <img src="${logoUrl}" alt="Yext" width="40" height="40" style="width:40px;height:40px;border-radius:8px;background:${white};padding:4px;" />
                  </td>
                  <td class="email-title-cell" valign="middle">
                    <p class="email-title" style="margin:0;font-size:18px;font-weight:700;color:${white};letter-spacing:-0.02em;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">${escapeHtml(APP_NAME)}</p>
                    ${headerSubtitle}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td class="email-body-cell" style="padding:28px;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td class="email-footer-cell" style="padding:20px 28px;border-top:1px solid ${border};background:${primaryLight};">
              <p style="margin:0 0 6px;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:13px;color:${textMuted};">
                Sent on behalf of <strong style="color:${primaryHover};">${recruiterName}</strong>
              </p>
              <p style="margin:0;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:12px;color:${textSubtle};">
                Please reply directly to this email. Your response will be read and analysed by our recruiting agent.
              </p>
              <p style="margin:10px 0 0;font-family:Inter,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:11px;color:${textSubtle};">
                Powered by <a href="https://www.yext.com" style="color:${primary};text-decoration:none;font-weight:600;">Yext</a>
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
