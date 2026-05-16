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
            authUserId: googleInfo && googleInfo.authUserId ? googleInfo.authUserId : null,
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

    async function buildAppContextFromAuthSession(authSession) {
        if (!authSession || !authSession.user) {
            return null;
        }

        const user = authSession.user;
        const email = normalizeEmail(user.email);
        if (!email) {
            throw new Error("ログインユーザーのメールアドレスを取得できませんでした。");
        }

        const member = await findCurrentMemberByEmail(email);
        if (!member) {
            throw new Error("現職利用者として登録されているアカウントでログインしてください。");
        }

        const profile = await fetchProfile(user.id);
        const roleFromProfile = profile && profile.role ? profile.role : null;
        const role = roleFromProfile || (member.access_role === "管理者" ? "admin" : "viewer");

        const appSession = createLocalSessionFromMember(member, {
            email,
            authUserId: user.id
        });

        appSession.role = role;
        appSession.displayName = (profile && profile.display_name) || appSession.displayName;
        appSession.email = email;

        const mergedProfile = {
            user_id: user.id,
            email,
            display_name: (profile && profile.display_name) || member.full_name || email,
            role,
            category: member.category || null,
            access_role: member.access_role || null
        };

        localStorage.setItem("portalSession", JSON.stringify(appSession));

        return {
            appSession,
            profile: mergedProfile,
            role
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
            logout();
            if (requireAuth) {
                toLogin(returnTo);
                return;
            }
            return;
        }

        let context;
        try {
            context = await buildAppContextFromAuthSession(session);
        } catch (error) {
            await supabase.auth.signOut();
            logout();
            if (requireAuth) {
                toLogin(returnTo);
                return;
            }
            return;
        }

        const profile = context.profile;
        const role = context.role;
        const appSession = context.appSession;

        if (!(await canAccessWithBootstrap(minRole, role))) {
            window.location.href = "access-denied.html";
            return;
        }

        renderAuthBadge(profile, session.user, options);

        if (typeof onReady === "function") {
            onReady({ session: appSession, profile, role, client: supabase, authSession: session });
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
        throw new Error("代替ログインは廃止しました。Googleログインを利用してください。");
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

    async function googleLogin(options = {}) {
        if (!window.AUTH_CONFIG || !window.AUTH_CONFIG.googleEnabled) {
            throw new Error("Googleログインが無効です。auth-config.js を確認してください。");
        }

        const supabase = ensureClient();
        const callbackUrl = new URL(window.location.origin + window.location.pathname);
        const returnTo = (options.returnTo || "").trim();
        if (returnTo) {
            callbackUrl.searchParams.set("returnTo", returnTo);
        }

        const { error } = await supabase.auth.signInWithOAuth({
            provider: "google",
            options: {
                redirectTo: callbackUrl.toString(),
                scopes: (window.AUTH_CONFIG.googleScopes || [
                    "openid",
                    "email",
                    "profile",
                    "https://www.googleapis.com/auth/calendar.readonly"
                ]).join(" ")
            }
        });

        if (error) {
            throw new Error("Googleログインの開始に失敗しました: " + error.message);
        }

        return null;
    }

    async function restoreSessionFromAuth() {
        const supabase = ensureClient();
        const { data, error } = await supabase.auth.getSession();

        if (error) {
            throw error;
        }

        const session = data ? data.session : null;
        if (!session || !session.user) {
            logout();
            return null;
        }

        const context = await buildAppContextFromAuthSession(session);
        return context ? context.appSession : null;
    }

    function getSession() {
        const sessionStr = localStorage.getItem("portalSession");
        if (!sessionStr) {
            return null;
        }
        return JSON.parse(sessionStr);
    }

    function logout() {
        try {
            const supabase = ensureClient();
            supabase.auth.signOut();
        } catch (_error) {
            // no-op
        }
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
        restoreSessionFromAuth,
        getSession,
        logout,
        generateGreeting
    };
})();
