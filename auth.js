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

        const role = profile && profile.role ? profile.role : "viewer";
        const name = (profile && profile.display_name) || user.email || "ユーザー";

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
                const supabase = ensureClient();
                await supabase.auth.signOut();
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

        const { data } = await supabase.auth.getSession();
        const session = data ? data.session : null;

        if (!session || !session.user) {
            if (requireAuth) {
                toLogin(returnTo);
                return;
            }
            return;
        }

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

    return {
        init,
        ensureClient
    };
})();
