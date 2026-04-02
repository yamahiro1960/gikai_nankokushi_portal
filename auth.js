window.portalAuth = (() => {
    let client = null;

    function ensureClient() {
        if (client) {
            return client;
        }

        if (!window.AUTH_CONFIG || !window.AUTH_CONFIG.supabaseUrl || !window.AUTH_CONFIG.supabaseAnonKey) {
            throw new Error("auth-config.js の Supabase設定が不足しています。");
        }

        if (!window.supabase || !window.supabase.createClient) {
            throw new Error("Supabase SDK が読み込まれていません。");
        }

        client = window.supabase.createClient(window.AUTH_CONFIG.supabaseUrl, window.AUTH_CONFIG.supabaseAnonKey);
        return client;
    }

    function getRoleScore(role) {
        return window.ROLE_ORDER[role] || 0;
    }

    function getMinRoleScore(minRole) {
        if (!minRole) {
            return 0;
        }
        return getRoleScore(minRole);
    }

    function isAuthPaused() {
        return !!(window.AUTH_CONFIG && window.AUTH_CONFIG.authPaused);
    }

    function toLogin(returnTo) {
        const path = returnTo || window.location.pathname.split("/").pop() || window.DEFAULT_RETURN_PATH;
        window.location.href = `login.html?returnTo=${encodeURIComponent(path)}`;
    }

    async function fetchProfile(userId) {
        const supabase = ensureClient();
        const { data, error } = await supabase
            .from("profiles")
            .select("user_id,email,display_name,role")
            .eq("user_id", userId)
            .single();

        if (error) {
            return null;
        }

        return data;
    }

    function renderAuthBadge(profile, user, options) {
        const target = document.getElementById(options.authTargetId || "authArea");
        if (!target) {
            return;
        }

        // ローカルセッションの場合、userはsessionデータ、profileはプロフィールオブジェクト
        const role = profile && profile.role ? profile.role : "viewer";
        const email = (profile && profile.email) || (user && user.email) || "ユーザー";
        const name = (profile && profile.display_name) || email;

        target.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;">
                <span style="font-size:12px;background:#eef2ff;color:#4338ca;padding:4px 8px;border-radius:999px;">${role}</span>
                <span style="font-size:12px;color:#374151;">${name}</span>
                <button id="logoutButton" style="font-size:12px;background:#111827;color:#fff;border:0;padding:6px 10px;border-radius:8px;cursor:pointer;">ログアウト</button>
            </div>
        `;

        const logoutButton = document.getElementById("logoutButton");
        if (logoutButton) {
            logoutButton.addEventListener("click", async () => {
                // ローカルセッションをクリア
                logout();
                toLogin(options.returnTo || window.DEFAULT_RETURN_PATH);
            });
        }
    }

    async function init(options = {}) {
        const supabase = ensureClient();
        const {
            requireAuth = true,
            minRole = "viewer",
            returnTo,
            onReady
        } = options;

        // ローカルストレージからセッション情報を取得（パスワードなしログイン用）
        const localSession = getSession();
        if (localSession) {
            const role = localSession.role || "viewer";
            if (getRoleScore(role) < getMinRoleScore(minRole)) {
                window.location.href = "access-denied.html";
                return;
            }

            if (typeof onReady === "function") {
                onReady({ session: localSession, profile: { role, email: localSession.email, display_name: localSession.displayName }, role, client: supabase });
            }
            return;
        }

        if (isAuthPaused()) {
            // 無認証運用中は profiles テーブルを一切読まない（RLS無限再帰を防止）
            if (typeof onReady === "function") {
                onReady({ session: null, profile: null, role: "viewer", client: supabase });
            }
            return;
        }

        const { data } = await supabase.auth.getSession();
        const session = data ? data.session : null;

        if (!session || !session.user) {
            if (requireAuth) {
                toLogin(returnTo);
                return;
            }
            return;
        }

        // fetchProfile() は認証ユーザーのみ呼び出し
        const profile = await fetchProfile(session.user.id);
        const role = profile && profile.role ? profile.role : "viewer";

        if (getRoleScore(role) < getMinRoleScore(minRole)) {
            window.location.href = "access-denied.html";
            return;
        }

        renderAuthBadge(profile, session.user, options);

        if (typeof onReady === "function") {
            onReady({ session, profile, role, client: supabase });
        }
    }

    async function emailOnlyLogin(email) {
        const supabase = ensureClient();
        
        // メールアドレスの妥当性チェック
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new Error("正しいメールアドレスを入力してください。");
        }

        try {
            // profilesテーブルでメールアドレスをチェック
            const { data: profile, error: profileError } = await supabase
                .from("profiles")
                .select("user_id,email,display_name,role")
                .eq("email", email.toLowerCase())
                .maybeSingle();

            console.log("Email query result:", { email: email.toLowerCase(), profile, profileError });

            if (profileError && profileError.code !== "PGRST116") {
                console.error("Profile query error:", profileError);
                throw profileError;
            }

            if (!profile) {
                throw new Error("このメールアドレスはシステムに登録されていません。");
            }

            // メールアドレスのみでセッション作成（パスワードなし）
            // localStorageにセッション情報を保存
            const sessionData = {
                email: profile.email,
                userId: profile.user_id,
                displayName: profile.display_name,
                role: profile.role || "viewer",
                loginTime: new Date().toISOString()
            };

            localStorage.setItem("portalSession", JSON.stringify(sessionData));
            return sessionData;
        } catch (error) {
            console.error("ログインエラー:", error);
            throw error;
        }
    }

    function getSession() {
        const sessionStr = localStorage.getItem("portalSession");
        if (!sessionStr) {
            return null;
        }
        return JSON.parse(sessionStr);
    }

    function logout() {
        localStorage.removeItem("portalSession");
    }

    function generateGreeting(profile, session) {
        // displayName優先度: profile.display_name > session.displayName > email > "ユーザー"
        const displayName = (profile && profile.display_name) || (session && session.displayName) || (session && session.email) || "ユーザー";
        const role = (profile && profile.role) || (session && session.role) || "viewer";
        
        // roleが"議員"の場合は"議員"、それ以外は"様"
        const suffix = role === "議員" ? "議員" : "様";
        
        return `こんにちは、${displayName}${suffix}。`;
    }

    return {
        init,
        ensureClient,
        emailOnlyLogin,
        getSession,
        logout,
        generateGreeting
    };
})();
