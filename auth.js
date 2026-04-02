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

    function createLocalSessionFromMember(member) {
        return {
            email: member.email || "",
            userId: member.member_id,
            memberId: member.member_id,
            displayName: member.full_name || member.email || "ユーザー",
            role: member.access_role === "管理者" ? "admin" : "viewer",
            accessRole: member.access_role || "使用者",
            category: member.category || null,
            isCurrent: !!member.is_current,
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

        const { data, error } = await supabase
            .from("member_directory")
            .select("member_id,full_name,category,position_name,access_role,is_current,email")
            .eq("is_current", true)
            .order("category", { ascending: true })
            .order("member_id", { ascending: true });

        if (error) {
            throw error;
        }

        return data || [];
    }

    async function memberSelectLogin(memberId) {
        const supabase = ensureClient();

        try {
            const { data: member, error: memberError } = await supabase
                .from("member_directory")
                .select("member_id,full_name,email,category,access_role,is_current")
                .eq("member_id", memberId)
                .eq("is_current", true)
                .limit(1)
                .maybeSingle();

            if (memberError && memberError.code !== "PGRST116") {
                throw memberError;
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
        getSession,
        logout,
        generateGreeting
    };
})();
