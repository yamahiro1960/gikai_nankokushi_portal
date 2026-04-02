window.AUTH_CONFIG = {
    supabaseUrl: "https://gnnfzimhfizbfhvwuzbf.supabase.co",
    supabaseAnonKey: "sb_publishable__SRHapM6Zzz01tC--VG9YQ_-xN3re0Q",
    googleEnabled: true,
    authPaused: false,
    // Google Cloud Console で発行した OAuth 2.0 Client ID を設定
    googleClientId: "995727635041-4btvd387rc69h0agjq4ld4ko9jlmpuki.apps.googleusercontent.com",
    // 必要最小限の読み取りスコープ（将来 Sheets 連携時に追加）
    googleScopes: [
        "openid",
        "email",
        "profile",
        "https://www.googleapis.com/auth/calendar.readonly"
    ]
};

window.ROLE_ORDER = {
    viewer: 1,
    editor: 2,
    admin: 3
};

window.DEFAULT_RETURN_PATH = "index.html";
