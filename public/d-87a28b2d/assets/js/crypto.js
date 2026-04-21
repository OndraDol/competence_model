/* ═════════════════════════════════════════════════
   AURES Competence Model — WebCrypto decrypt
   Must match Python ats_sync.encrypt_payload() parameters.
   ═════════════════════════════════════════════════ */

const BLOB_URL = "./data.enc.json";

function b64ToBytes(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

async function fetchEncryptedBlob() {
    const response = await fetch(BLOB_URL, { cache: "no-store" });
    if (!response.ok) {
        throw new Error(`Nelze načíst data.enc.json (HTTP ${response.status})`);
    }
    return response.json();
}

async function deriveAesKey(password, salt, iterations) {
    const enc = new TextEncoder();
    const baseKey = await crypto.subtle.importKey(
        "raw",
        enc.encode(password),
        { name: "PBKDF2" },
        false,
        ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
        {
            name: "PBKDF2",
            salt,
            iterations,
            hash: "SHA-256"
        },
        baseKey,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
    );
}

async function decryptBlob(password, blob) {
    if (!blob || typeof blob !== "object") {
        throw new Error("Prázdný nebo neplatný data.enc.json");
    }
    if (blob.v !== 1) {
        throw new Error(`Nepodporovaná verze blobu: ${blob.v}`);
    }

    const salt = b64ToBytes(blob.salt);
    const iv = b64ToBytes(blob.iv);
    const ciphertext = b64ToBytes(blob.ciphertext);
    const iterations = Number(blob.iter) || 250000;

    let key;
    try {
        key = await deriveAesKey(password, salt, iterations);
    } catch (err) {
        throw new Error("Odvození klíče selhalo: " + (err && err.message || err));
    }

    let plaintextBytes;
    try {
        plaintextBytes = await crypto.subtle.decrypt(
            { name: "AES-GCM", iv },
            key,
            ciphertext
        );
    } catch (err) {
        // AES-GCM authentication failure → wrong password or tampered blob.
        throw new Error("Nesprávné heslo nebo poškozená data.");
    }

    const text = new TextDecoder().decode(plaintextBytes);
    let parsed;
    try {
        parsed = JSON.parse(text);
    } catch (err) {
        throw new Error("Dešifrovaná data nejsou validní JSON.");
    }
    return {
        records: parsed.records || [],
        meta: parsed.meta || {},
        blobMeta: {
            syncedAt: blob.syncedAt,
            datacruitFetchedAt: blob.datacruitFetchedAt,
            recordCount: blob.recordCount
        }
    };
}

// Expose
window.CompetenceCrypto = { fetchEncryptedBlob, decryptBlob };
