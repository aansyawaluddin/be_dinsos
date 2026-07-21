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

// "La Ode Samsuddin" -> "LO" (huruf pertama kata ke-1 + kata ke-2)
export function getInitials(nama) {
    if (!nama) return null;
    const parts = String(nama).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return null;
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Hitung usia (tahun penuh) dari tanggal lahir ke waktu sekarang
export function hitungUsia(tanggalLahir) {
    if (!tanggalLahir) return null;
    const now = new Date();
    const lahir = new Date(tanggalLahir);
    if (Number.isNaN(lahir.getTime())) return null;

    let usia = now.getUTCFullYear() - lahir.getUTCFullYear();
    const belumUlangTahun =
        now.getUTCMonth() < lahir.getUTCMonth() ||
        (now.getUTCMonth() === lahir.getUTCMonth() && now.getUTCDate() < lahir.getUTCDate());
    if (belumUlangTahun) usia--;
    return usia;
}

// "DESIL 4" -> "Desil 4", null kalau kosong/tidak dikenali
export function formatDesilLabel(value) {
    const n = extractDesil(value);
    return n ? `Desil ${n}` : null;
}

const KABUPATEN_LABEL = {
    KOTA_PALU: "Kota Palu",
    DONGGALA: "Kabupaten Donggala",
    SIGI: "Kabupaten Sigi",
    PARIGI_MOUTONG: "Kabupaten Parigi Moutong",
    POSO: "Kabupaten Poso",
    TOJO_UNA_UNA: "Kabupaten Tojo Una-Una",
    MOROWALI: "Kabupaten Morowali",
    MOROWALI_UTARA: "Kabupaten Morowali Utara",
    BANGGAI: "Kabupaten Banggai",
    BANGGAI_KEPULAUAN: "Kabupaten Banggai Kepulauan",
    BANGGAI_LAUT: "Kabupaten Banggai Laut",
    BUOL: "Kabupaten Buol",
    TOLITOLI: "Kabupaten Tolitoli",
};

// KOTA_PALU -> "Kota Palu" (kebalikan dari mapKabupaten, buat tampilan)
export function mapKabupatenLabel(value) {
    return KABUPATEN_LABEL[value] || null;
}

const KABUPATEN_ENUM_VALUES = Object.keys(KABUPATEN_LABEL);

export function resolveKabupatenKota(value) {
    if (!value) return null;
    const cleaned = String(value).trim();
    const asEnum = cleaned.toUpperCase().replace(/\s+/g, "_");
    if (KABUPATEN_ENUM_VALUES.includes(asEnum)) return asEnum;
    return mapKabupaten(cleaned);
}

// Titik tengah (ibu kota kabupaten/kota) buat plotting di peta GIS.
// Koordinat perkiraan buat penempatan titik di peta, bukan batas wilayah presisi survei.
const KABUPATEN_COORDINATES = {
    KOTA_PALU: { latitude: -0.8917, longitude: 119.8707 },
    DONGGALA: { latitude: -0.6944, longitude: 119.7306 },
    SIGI: { latitude: -1.05, longitude: 119.95 },
    PARIGI_MOUTONG: { latitude: -0.8167, longitude: 120.1667 },
    POSO: { latitude: -1.3959, longitude: 120.7517 },
    TOJO_UNA_UNA: { latitude: -0.8756, longitude: 121.6297 },
    MOROWALI: { latitude: -2.6, longitude: 121.85 },
    MOROWALI_UTARA: { latitude: -1.9667, longitude: 121.85 },
    BANGGAI: { latitude: -0.9481, longitude: 122.7875 },
    BANGGAI_KEPULAUAN: { latitude: -1.85, longitude: 123.4 },
    BANGGAI_LAUT: { latitude: -1.5814, longitude: 123.5111 },
    BUOL: { latitude: 1.1936, longitude: 121.4453 },
    TOLITOLI: { latitude: 1.0524, longitude: 120.7942 },
};

export function getKabupatenCoordinates(value) {
    return KABUPATEN_COORDINATES[value] || null;
}

// rt="3", rw="4" -> "003/004"
export function formatRtRw(rt, rw) {
    if (!rt && !rw) return null;
    const pad = (v) => (v ? String(v).replace(/\D/g, "").padStart(3, "0") : "-");
    return `${pad(rt)}/${pad(rw)}`;
}

// skorSurvei=20, skorMaksimal=21 -> "20/21"
export function formatSkor(skorSurvei, skorMaksimal) {
    if (skorSurvei == null || skorMaksimal == null) return null;
    return `${skorSurvei}/${skorMaksimal}`;
}

function clean(value) {
    if (value === null || value === undefined) return null;
    const str = String(value).trim();
    return str === "" || str === "-" ? null : str;
}

export { clean };