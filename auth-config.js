window.AUTH_CONFIG = {
    supabaseUrl: "https://gnnfzimhfizbfhvwuzbf.supabase.co",
    supabaseAnonKey: "sb_publishable__SRHapM6Zzz01tC--VG9YQ_-xN3re0Q",
    // ポータルの正規公開URL（末尾スラッシュ不要）。
    // OAuth の戻り先をこのURL基準で固定します。
    portalBaseUrl: "https://nankokushigikai.github.io/gikai_nankokushi_portal",
    googleEnabled: true,
    authPaused: false,
    // プロフィール通知メール送信用Webhook（任意）。
    // 例: "https://example.com/webhooks/profile-notify"
    // 未設定時は mailto でメール作成画面を開きます。
    profileNotifyWebhookUrl: "https://gnnfzimhfizbfhvwuzbf.functions.supabase.co/profile-notify-mail",
    // 政務活動費アプリの本番公開URL（末尾スラッシュ不要）。
    // 例: "https://seimu.example.com"
    seimukatudouhiAppBaseUrl: "",
    // Google Cloud Console で発行した OAuth 2.0 Client ID を設定
    googleClientId: "995727635041-4btvd387rc69h0agjq4ld4ko9jlmpuki.apps.googleusercontent.com",
    // 本番公開向けの最小スコープ
    googleScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.events"
    ]
};

window.ROLE_ORDER = {
    viewer: 1,
    editor: 2,
    admin: 3
};

window.DEFAULT_RETURN_PATH = "index.html";
