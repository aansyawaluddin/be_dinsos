import path from "path";

// Field foto di model Warga yang mau ditampilkan di export Excel (sebagai link, bukan gambar ter-embed).
export const FOTO_FIELDS_EXPORT = [
    { key: "fotoDokumentasi", label: "Foto Dokumentasi" },
    { key: "fotoRumah", label: "Foto Rumah" },
    { key: "fotoKtp", label: "Foto KTP" },
    { key: "fotoKk", label: "Foto KK" },
    { key: "tandaTanganResponden", label: "TTD Responden" },
    { key: "tandaTanganEnumerator", label: "TTD Enumerator" },
];

/**
 * Bangun URL publik ke file foto yang di-serve statis lewat /uploads (lihat app.js).
 * Prioritas: env PUBLIC_BASE_URL (paling akurat di belakang nginx/https) -> fallback dari request.
 *
 * @param {import('express').Request} req
 * @param {string|null|undefined} relPathFoto - path relatif tersimpan di kolom foto (mis. "warga/xxx/fotoKtp_123.jpg")
 * @returns {string|null}
 */
export function buildFotoUrl(req, relPathFoto) {
    if (!relPathFoto) return null;
    const baseUrl = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get("host")}`).replace(/\/$/, "");
    const relPathNormalized = relPathFoto.split(path.sep).join("/");
    return `${baseUrl}/uploads/${relPathNormalized}`;
}