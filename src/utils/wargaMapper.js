export const KABUPATEN_MAP = {
    "Kota Palu": "KOTA_PALU",
    "Kabupaten Donggala": "DONGGALA",
    "Donggala": "DONGGALA",
    "Kabupaten Sigi": "SIGI",
    "Sigi": "SIGI",
    "Kabupaten Parigi Moutong": "PARIGI_MOUTONG",
    "Parigi Moutong": "PARIGI_MOUTONG",
    "Kabupaten Poso": "POSO",
    "Poso": "POSO",
    "Kabupaten Tojo Una-Una": "TOJO_UNA_UNA",
    "Tojo Una-Una": "TOJO_UNA_UNA",
    "Kabupaten Morowali": "MOROWALI",
    "Morowali": "MOROWALI",
    "Kabupaten Morowali Utara": "MOROWALI_UTARA",
    "Morowali Utara": "MOROWALI_UTARA",
    "Kabupaten Banggai": "BANGGAI",
    "Banggai": "BANGGAI",
    "Kabupaten Banggai Kepulauan": "BANGGAI_KEPULAUAN",
    "Banggai Kepulauan": "BANGGAI_KEPULAUAN",
    "Kabupaten Banggai Laut": "BANGGAI_LAUT",
    "Banggai Laut": "BANGGAI_LAUT",
    "Kabupaten Buol": "BUOL",
    "Buol": "BUOL",
    "Kabupaten Tolitoli": "TOLITOLI",
    "Tolitoli": "TOLITOLI",
};

export function mapKabupaten(value) {
    if (!value) return null;
    return KABUPATEN_MAP[String(value).trim()] || null;
}

export function mapJenisKelamin(value) {
    if (!value) return null;
    const v = String(value).trim().toLowerCase();
    if (v === "laki-laki" || v === "laki laki") return "LAKI_LAKI";
    if (v === "perempuan") return "PEREMPUAN";
    return null;
}

// Untuk tampilan preview: enum -> "L" / "P"
export function mapJenisKelaminLabel(value) {
    if (value === "LAKI_LAKI") return "L";
    if (value === "PEREMPUAN") return "P";
    return null;
}

export function parseTanggalLahir(value) {
    if (!value) return null;
    if (value instanceof Date) return value;
    const str = String(value).trim();
    const match = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!match) return null;
    const [, day, month, year] = match;
    return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

// Untuk tampilan preview: Date -> "dd-mm-yyyy"
export function formatTanggalLahir(value) {
    if (!value) return null;
    const d = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(d.getTime())) return null;
    const dd = String(d.getUTCDate()).padStart(2, "0");
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const yyyy = d.getUTCFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

// "TIDAK" / "TIDAK (...)" -> "Tidak", selain itu (mis. "YA (PBI JKN...)", "KELUARGA (PKH...)") -> "Ya"
export function statusBansos(value) {
    if (!value) return null;
    return String(value).trim().toUpperCase().startsWith("TIDAK") ? "Tidak" : "Ya";
}

// "DESIL 4" -> 4
export function extractDesil(value) {
    if (!value) return null;
    const match = String(value).match(/(\d+)/);
    return match ? Number(match[1]) : null;
}

function clean(value) {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    return str === "" || str === "-" ? null : str;
}

export { clean };