import { promises as fs } from "node:fs";
import path from "node:path";

const projectRoot = process.cwd();
const authConfigPath = path.join(projectRoot, "auth-config.js");
const gianRoot = path.join(projectRoot, "gian");
const targetFolders = ["444_2025_12", "445_2026_01", "446_2026_03"];

function parseAuthConfig(source) {
    const urlMatch = source.match(/supabaseUrl:\s*"([^"]+)"/);
    const keyMatch = source.match(/supabaseAnonKey:\s*"([^"]+)"/);

    if (!urlMatch || !keyMatch) {
        throw new Error("auth-config.js から Supabase 設定を読み取れませんでした。");
    }

    return {
        supabaseUrl: urlMatch[1],
        supabaseAnonKey: keyMatch[1]
    };
}

function sanitizePath(filePath) {
    return filePath
        .replace(/[^\w\-.\/]/g, "_")
        .replace(/_{2,}/g, "_")
        .replace(/^_+|_+$/g, "");
}

function inferDocumentType(fileName, relativePath) {
    const normalizedName = fileName.toLowerCase();
    const normalizedPath = relativePath.replace(/\\/g, "/").toLowerCase();

    if (normalizedName.endsWith(".doc") || normalizedName.endsWith(".docx")) {
        return { type: "doc", subFolder: null };
    }
    if (normalizedPath.startsWith("benkyoukai/")) {
        return { type: "study", subFolder: "benkyoukai" };
    }
    if (normalizedName.includes("勉強会")) {
        return { type: "study", subFolder: null };
    }
    if (normalizedName.includes("一覧表")) {
        return { type: "summary", subFolder: null };
    }
    if (normalizedName.includes("報告")) {
        return { type: "report", subFolder: null };
    }
    if (normalizedName.includes("提案理由")) {
        return { type: "reason", subFolder: null };
    }
    if (normalizedName.includes("施政方針")) {
        return { type: "policy", subFolder: null };
    }
    if (normalizedName.includes("議案")) {
        return { type: "bill", subFolder: null };
    }

    return null;
}

async function collectFiles(folderPath, prefix = "") {
    const entries = await fs.readdir(folderPath, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const nextPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
        const fullPath = path.join(folderPath, entry.name);

        if (entry.isDirectory()) {
            files.push(...await collectFiles(fullPath, nextPrefix));
            continue;
        }

        const fileInfo = inferDocumentType(entry.name, nextPrefix);
        if (!fileInfo) {
            continue;
        }

        files.push({
            absolutePath: fullPath,
            relativePath: nextPrefix,
            fileName: entry.name,
            ...fileInfo
        });
    }

    return files;
}

async function requestJson(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;

    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${text}`);
    }

    return payload;
}

async function requestText(url, options) {
    const response = await fetch(url, options);
    const text = await response.text();

    if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}: ${text}`);
    }

    return text;
}

async function loadExistingUploadKeys(config) {
    const url = `${config.supabaseUrl}/rest/v1/meeting_settings?select=setting_key&setting_key=like.uploaded_documents_%25`;
    const data = await requestJson(url, {
        method: "GET",
        headers: {
            apikey: config.supabaseAnonKey,
            Authorization: `Bearer ${config.supabaseAnonKey}`
        }
    });

    return new Set((data || []).map((item) => item.setting_key));
}

async function uploadFile(config, folderName, file, index) {
    const fileBuffer = await fs.readFile(file.absolutePath);
    const ext = path.extname(file.fileName).replace(/^\./, "") || "bin";
    const storageBasePath = file.subFolder
        ? `${folderName}/${file.subFolder}`
        : folderName;
    const fileId = `file_${Date.now()}_${index}.${ext}`;
    const storagePath = sanitizePath(`${storageBasePath}/${fileId}`);
    const uploadUrl = `${config.supabaseUrl}/storage/v1/object/gian/${storagePath.split("/").map(encodeURIComponent).join("/")}`;

    await requestText(uploadUrl, {
        method: "POST",
        headers: {
            apikey: config.supabaseAnonKey,
            Authorization: `Bearer ${config.supabaseAnonKey}`,
            "x-upsert": "true",
            "content-type": "application/octet-stream"
        },
        body: fileBuffer
    });

    return storagePath;
}

async function saveMetadata(config, session, folderName, documents) {
    const [year, month] = folderName.split("_").slice(1);
    const url = `${config.supabaseUrl}/rest/v1/meeting_settings?on_conflict=setting_key`;
    const body = [{
        setting_key: `uploaded_documents_${session}_${folderName}`,
        setting_payload: {
            folderName,
            session,
            year,
            month,
            documents,
            uploadedAt: new Date().toISOString(),
            migratedFromLocal: true
        }
    }];

    await requestText(url, {
        method: "POST",
        headers: {
            apikey: config.supabaseAnonKey,
            Authorization: `Bearer ${config.supabaseAnonKey}`,
            "content-type": "application/json",
            Prefer: "resolution=merge-duplicates,return=minimal"
        },
        body: JSON.stringify(body)
    });
}

async function migrateFolder(config, existingKeys, folderName) {
    const session = folderName.split("_")[0];
    const settingKey = `uploaded_documents_${session}_${folderName}`;
    if (existingKeys.has(settingKey)) {
        console.log(`SKIP ${folderName}: すでに metadata が存在します。`);
        return;
    }

    const folderPath = path.join(gianRoot, folderName);
    const files = await collectFiles(folderPath);
    if (!files.length) {
        console.log(`SKIP ${folderName}: 移行対象ファイルがありません。`);
        return;
    }

    const documents = [];
    console.log(`START ${folderName}: ${files.length} files`);

    for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        const storagePath = await uploadFile(config, folderName, file, index);
        documents.push({
            label: file.fileName.replace(/\.(pdf|doc|docx)$/i, ""),
            fileName: file.fileName,
            type: file.type,
            relativePath: file.relativePath,
            subFolder: file.subFolder,
            storagePath
        });
        console.log(`  uploaded ${index + 1}/${files.length}: ${file.relativePath}`);
    }

    await saveMetadata(config, session, folderName, documents);
    console.log(`DONE ${folderName}`);
}

async function main() {
    const authConfigSource = await fs.readFile(authConfigPath, "utf8");
    const config = parseAuthConfig(authConfigSource);
    const existingKeys = await loadExistingUploadKeys(config);

    for (const folderName of targetFolders) {
        await migrateFolder(config, existingKeys, folderName);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});