const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

type NotifyPayload = {
  toEmail?: string;
  memberId?: string;
  memberName?: string;
  mode?: "created" | "updated" | string;
  loginUrl?: string;
  subject?: string;
  body?: string;
};

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return jsonResponse(405, { ok: false, error: "Method not allowed" });
  }

  const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
  const fromEmail = Deno.env.get("RESEND_FROM_EMAIL") || "";

  if (!resendApiKey || !fromEmail) {
    return jsonResponse(500, {
      ok: false,
      error: "Missing environment variables: RESEND_API_KEY or RESEND_FROM_EMAIL"
    });
  }

  let payload: NotifyPayload;
  try {
    payload = (await req.json()) as NotifyPayload;
  } catch (_error) {
    return jsonResponse(400, { ok: false, error: "Invalid JSON payload" });
  }

  const toEmail = String(payload.toEmail || "").trim().toLowerCase();
  if (!toEmail) {
    return jsonResponse(400, { ok: false, error: "toEmail is required" });
  }

  const modeText = payload.mode === "updated" ? "変更" : "登録";
  const memberName = String(payload.memberName || "ご利用者様").trim() || "ご利用者様";
  const loginUrl = String(payload.loginUrl || "").trim();

  const subject =
    String(payload.subject || "").trim() ||
    `【南国市議会DXポータル】プロフィール情報${modeText}のお知らせ`;

  const body =
    String(payload.body || "").trim() ||
    [
      `${memberName} 様`,
      "",
      `南国市議会DXポータルのプロフィール情報を${modeText}しました。`,
      "ログインは以下のURLをご利用ください。",
      loginUrl,
      "",
      "このメールはシステムから自動送信されています。"
    ].join("\n");

  const htmlBody = body
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\n", "<br>");

  const resendResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${resendApiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: fromEmail,
      to: [toEmail],
      subject,
      text: body,
      html: `<div style=\"font-family: sans-serif; line-height: 1.6;\">${htmlBody}</div>`
    })
  });

  if (!resendResponse.ok) {
    const errorText = await resendResponse.text();
    return jsonResponse(502, {
      ok: false,
      error: "Resend API error",
      detail: errorText
    });
  }

  const data = await resendResponse.json();
  return jsonResponse(200, {
    ok: true,
    resendId: (data && (data as { id?: string }).id) || null,
    toEmail,
    memberId: payload.memberId || ""
  });
});
