window.portalMeetingSettings = (() => {
    const defaultSettings = {
        "定例会名": "令和8（2026）年第1回定例会",
        "開始日": "2026-03-23",
        "終了日": "2026-03-29",
        "会場": "南国市議会議場",
        "議案数": "12",
        "報告数": "3",
        "議発数": "1",
        "ステータス": "進行中"
    };

    function normalizeSettings(rawSettings) {
        const settings = { ...defaultSettings, ...(rawSettings || {}) };

        if (!settings["開始日"] && settings["開催日程"]) {
            settings["開始日"] = settings["開催日程"];
        }
        if (!settings["議案数"] && settings["議案"]) {
            settings["議案数"] = settings["議案"];
        }
        if (!settings["報告数"] && settings["報告"]) {
            settings["報告数"] = settings["報告"];
        }
        if (!settings["議発数"] && settings["議発"]) {
            settings["議発数"] = settings["議発"];
        }
        if (!settings["議案数"] && settings["議題数"]) {
            settings["議案数"] = settings["議題数"];
        }

        return settings;
    }

    async function loadFromSupabase(client) {
        if (!client) {
            return null;
        }

        const { data, error } = await client
            .from("meeting_settings")
            .select("setting_payload")
            .eq("setting_key", "current")
            .maybeSingle();

        if (error || !data || !data.setting_payload) {
            return null;
        }

        return normalizeSettings(data.setting_payload);
    }

    function loadFromLocalStorage() {
        try {
            const raw = localStorage.getItem("gikaiSettings");
            if (!raw) {
                return null;
            }

            const parsed = JSON.parse(raw);
            if (!parsed || typeof parsed !== "object") {
                return null;
            }

            return normalizeSettings(parsed);
        } catch (error) {
            console.warn("ローカル保存設定の読み込みに失敗しました:", error);
            return null;
        }
    }

    async function loadFromCsv(csvPath = "gikai_settings.csv") {
        try {
            const response = await fetch(csvPath, { cache: "no-store" });
            if (!response.ok) {
                return null;
            }

            const csvText = await response.text();
            const lines = csvText
                .split(/\r?\n/)
                .map((line) => line.trim())
                .filter((line) => line.length > 0);

            const settings = {};
            for (let i = 1; i < lines.length; i += 1) {
                const parts = lines[i].split(",");
                const key = parts[0] ? parts[0].trim() : "";
                const value = parts.slice(1).join(",").trim();
                if (key) {
                    settings[key] = value;
                }
            }

            return normalizeSettings(settings);
        } catch (error) {
            console.warn("CSV設定の読み込みに失敗しました:", error);
            return null;
        }
    }

    async function load(client, options = {}) {
        const csvPath = options.csvPath || "gikai_settings.csv";
        const fromSupabase = await loadFromSupabase(client);
        if (fromSupabase) {
            return fromSupabase;
        }

        const fromLocalStorage = loadFromLocalStorage();
        if (fromLocalStorage) {
            return fromLocalStorage;
        }

        const fromCsv = await loadFromCsv(csvPath);
        if (fromCsv) {
            return fromCsv;
        }

        return { ...defaultSettings };
    }

    async function save(client, settings) {
        if (!client) {
            throw new Error("Supabaseクライアントがありません。");
        }

        const normalized = normalizeSettings(settings);
        const { error } = await client
            .from("meeting_settings")
            .upsert({
                setting_key: "current",
                setting_payload: normalized
            }, { onConflict: "setting_key" });

        if (error) {
            throw error;
        }

        localStorage.setItem("gikaiSettings", JSON.stringify(normalized));
        return normalized;
    }

    function resetLocal(settings = defaultSettings) {
        localStorage.setItem("gikaiSettings", JSON.stringify(normalizeSettings(settings)));
    }

    return {
        defaultSettings,
        normalizeSettings,
        load,
        save,
        resetLocal
    };
})();
