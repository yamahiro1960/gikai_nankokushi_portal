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
        if (role === "議員" || role === "職員" || role === "使用者") {
            return window.ROLE_ORDER.viewer || 1;
        }
        if (role === "管理者") {
            return window.ROLE_ORDER.admin || 3;
        }
        return window.ROLE_ORDER[role] || 0;
    }

    function getMinRoleScore(minRole) {
        if (!minRole) {
            return 0;
        }
        return getRoleScore(minRole);
    }

    function normalizeEmail(value) {
        return (value || "").trim().toLowerCase();
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

    async function hasConfiguredAdmins() {
        const supabase = ensureClient();
        const { count, error } = await supabase
            .from("member_directory")
            .select("member_id", { count: "exact", head: true })
            .eq("is_current", true)
            .eq("access_role", "管理者");

        if (error) {
            return true;
        }

        return (count || 0) > 0;
    }

    async function canAccessWithBootstrap(minRole, role) {
        if (getRoleScore(role) >= getMinRoleScore(minRole)) {
            return true;
        }

        if (minRole !== "admin") {
            return false;
        }

        const adminsExist = await hasConfiguredAdmins();
        return !adminsExist;
    }

    function createLocalSessionFromMember(member, googleInfo = null) {
        return {
            email: member.email || "",
            userId: member.member_id,
            memberId: member.member_id,
            displayName: member.full_name || member.email || "ユーザー",
            role: member.access_role === "管理者" ? "admin" : "viewer",
            accessRole: member.access_role || "使用者",
            category: member.category || null,
            isCurrent: !!member.is_current,
            googleEmail: googleInfo && googleInfo.email ? googleInfo.email : null,
            googleAccessToken: googleInfo && googleInfo.accessToken ? googleInfo.accessToken : null,
            loginTime: new Date().toISOString()
        };
    }

    function renderAuthBadge(profile, user, options) {
        const target = document.getElementById(options.authTargetId || "authArea");
        if (!target) {
            return;
        }

        // ローカルセッションの場合、userはsessionデータ、profileはプロフィールオブジェクト
        const role = profile && profile.role ? profile.role : "viewer";
        const accessRole = (profile && profile.access_role) || (user && user.accessRole) || (role === "admin" ? "管理者" : "使用者");
        const email = (profile && profile.email) || (user && user.email) || "ユーザー";
        const name = (profile && profile.display_name) || email;

        target.innerHTML = `
            <div style="display:flex;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap;">
                <span style="font-size:12px;background:#eef2ff;color:#4338ca;padding:4px 8px;border-radius:999px;">${accessRole}</span>
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
            if (!(await canAccessWithBootstrap(minRole, role))) {
                window.location.href = "access-denied.html";
                return;
            }

            renderAuthBadge(
                {
                    role,
                    email: localSession.email,
                    display_name: localSession.displayName,
                    access_role: localSession.accessRole || null
                },
                { email: localSession.email, accessRole: localSession.accessRole || null },
                options
            );

            if (typeof onReady === "function") {
                onReady({
                    session: localSession,
                    profile: {
                        role,
                        email: localSession.email,
                        display_name: localSession.displayName,
                        category: localSession.category || null,
                        access_role: localSession.accessRole || null
                    },
                    role,
                    client: supabase
                });
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

        if (!(await canAccessWithBootstrap(minRole, role))) {
            window.location.href = "access-denied.html";
            return;
        }

        renderAuthBadge(profile, session.user, options);

        if (typeof onReady === "function") {
            onReady({ session, profile, role, client: supabase });
        }
    }

    async function getCurrentLoginMembers() {
        const supabase = ensureClient();

        // is_current / access_role カラムを含む完全クエリを試みる
        const { data, error } = await supabase
            .from("member_directory")
            .select("member_id,full_name,category,position_name,access_role,is_current,email")
            .eq("is_current", true)
            .order("category", { ascending: true })
            .order("member_id", { ascending: true });

        if (!error) {
            return data || [];
        }

        // カラムが未追加の場合(DB未マイグレーション)は基本カラムのみでフォールバック
        console.warn("getCurrentLoginMembers: フォールバッククエリを使用します。DBマイグレーションが必要です。", error);

        const { data: fallbackData, error: fallbackError } = await supabase
            .from("member_directory")
            .select("member_id,full_name,category,position_name,email")
            .order("category", { ascending: true })
            .order("member_id", { ascending: true });

        if (fallbackError) {
            throw fallbackError;
        }

        return (fallbackData || []).map((m) => ({
            ...m,
            is_current: true,
            access_role: "使用者",
        }));
    }

    async function memberSelectLogin(memberId) {
        const supabase = ensureClient();

        try {
            // is_current/access_role カラムを含む完全クエリを試みる
            let member = null;
            const { data: memberFull, error: memberFullError } = await supabase
                .from("member_directory")
                .select("member_id,full_name,email,category,access_role,is_current")
                .eq("member_id", memberId)
                .eq("is_current", true)
                .limit(1)
                .maybeSingle();

            if (!memberFullError) {
                member = memberFull;
            } else {
                // DBマイグレーション未実施の場合は基本カラムのみでフォールバック
                console.warn("memberSelectLogin: フォールバッククエリを使用します。", memberFullError);
                const { data: memberBasic, error: memberBasicError } = await supabase
                    .from("member_directory")
                    .select("member_id,full_name,email,category")
                    .eq("member_id", memberId)
                    .limit(1)
                    .maybeSingle();
                if (memberBasicError && memberBasicError.code !== "PGRST116") {
                    throw memberBasicError;
                }
                member = memberBasic ? { ...memberBasic, is_current: true, access_role: "使用者" } : null;
            }

            if (!member) {
                throw new Error("選択した利用者でログインできません。");
            }

            const sessionData = createLocalSessionFromMember(member);

            localStorage.setItem("portalSession", JSON.stringify(sessionData));
            return sessionData;
        } catch (error) {
            console.error("ログインエラー:", error);
            throw error;
        }
    }

    async function findCurrentMemberByEmail(email) {
        const supabase = ensureClient();
        const normalizedEmail = normalizeEmail(email);

        if (!normalizedEmail) {
            return null;
        }

        const { data: memberFull, error: memberFullError } = await supabase
            .from("member_directory")
            .select("member_id,full_name,email,category,access_role,is_current")
            .eq("email", normalizedEmail)
            .eq("is_current", true)
            .limit(1)
            .maybeSingle();

        if (!memberFullError) {
            return memberFull;
        }

        // DB マイグレーション未実施時フォールバック
        const { data: memberBasic, error: memberBasicError } = await supabase
            .from("member_directory")
            .select("member_id,full_name,email,category")
            .eq("email", normalizedEmail)
            .limit(1)
            .maybeSingle();

        if (memberBasicError && memberBasicError.code !== "PGRST116") {
            throw memberBasicError;
        }

        return memberBasic ? { ...memberBasic, is_current: true, access_role: "使用者" } : null;
    }

    async function googleLogin() {
        if (!window.AUTH_CONFIG || !window.AUTH_CONFIG.googleEnabled) {
            throw new Error("Googleログインが無効です。auth-config.js を確認してください。");
        }

        const clientId = (window.AUTH_CONFIG.googleClientId || "").trim();
        if (!clientId) {
            throw new Error("Google Client ID が未設定です。auth-config.js を確認してください。");
        }

        if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
            throw new Error("Google Identity Services が読み込まれていません。");
        }

        const scopes = (window.AUTH_CONFIG.googleScopes || [
            "openid",
            "email",
            "profile",
            "https://www.googleapis.com/auth/calendar.readonly"
        ]).join(" ");

        const tokenResponse = await new Promise((resolve, reject) => {
            const tokenClient = window.google.accounts.oauth2.initTokenClient({
                client_id: clientId,
                scope: scopes,
                callback: (response) => {
                    if (!response || response.error) {
                        reject(new Error("Google認証に失敗しました。"));
                        return;
                    }
                    resolve(response);
                }
            });

            tokenClient.requestAccessToken({ prompt: "consent" });
        });

        const accessToken = tokenResponse.access_token;
        const profileResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
            headers: {
                Authorization: `Bearer ${accessToken}`
            }
        });

        if (!profileResponse.ok) {
            throw new Error("Googleプロフィールの取得に失敗しました。");
        }

        const googleProfile = await profileResponse.json();
        const email = normalizeEmail(googleProfile.email);
        if (!email) {
            throw new Error("Googleアカウントのメールアドレスが取得できませんでした。");
        }

        const member = await findCurrentMemberByEmail(email);
        if (!member) {
            throw new Error("現職利用者として登録されている Google アカウントでログインしてください。");
        }

        const sessionData = createLocalSessionFromMember(member, {
            email,
            accessToken
        });

        localStorage.setItem("portalSession", JSON.stringify(sessionData));
        return sessionData;
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
        const category = (profile && profile.category) || (session && session.category) || "";
        
        // roleが"議員"の場合は"議員"、それ以外は"様"
        const suffix = role === "議員" || category === "議員" ? "議員" : "様";
        
        return `こんにちは、${displayName}${suffix}。`;
    }

    return {
        init,
        ensureClient,
        getCurrentLoginMembers,
        memberSelectLogin,
        googleLogin,
        getSession,
        logout,
        generateGreeting
    };
})();
