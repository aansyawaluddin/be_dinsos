
const SKALA_AKSES_FASILITAS = [
    { kode: "1", label: "Sangat Mudah" },
    { kode: "2", label: "Mudah" },
    { kode: "3", label: "Sulit" },
    { kode: "4", label: "Sangat Sulit" },
];

function aksesFasilitas(kode, namaFasilitas) {
    return {
        kode,
        variabel: `Kemudahan akses -- ${namaFasilitas}`,
        jenis: "PILIHAN_TUNGGAL",
        wajib: true,
        aturan: null,
        opsi: SKALA_AKSES_FASILITAS,
    };
}

export const BLOK_I = {
    kode: "I",
    judul: "Kebutuhan Prioritas dan Akses Layanan Dasar",
    pertanyaan: [
        { kode: "I1a", variabel: "Urutan prioritas -- Pendapatan/pekerjaan yang layak", jenis: "ANGKA", wajib: false, aturan: "Isi 1/2/3 kalau termasuk 3 kebutuhan paling mendesak; kosongkan kalau tidak. Bagian dari I1." },
        { kode: "I1b", variabel: "Urutan prioritas -- Akses layanan kesehatan", jenis: "ANGKA", wajib: false, aturan: "Bagian dari I1" },
        { kode: "I1c", variabel: "Urutan prioritas -- Biaya pendidikan anak", jenis: "ANGKA", wajib: false, aturan: "Bagian dari I1" },
        { kode: "I1d", variabel: "Urutan prioritas -- Perbaikan/kepemilikan rumah", jenis: "ANGKA", wajib: false, aturan: "Bagian dari I1" },
        { kode: "I1e", variabel: "Urutan prioritas -- Air bersih", jenis: "ANGKA", wajib: false, aturan: "Bagian dari I1" },
        { kode: "I1f", variabel: "Urutan prioritas -- Listrik", jenis: "ANGKA", wajib: false, aturan: "Bagian dari I1" },
        { kode: "I1g", variabel: "Urutan prioritas -- Jalan/transportasi", jenis: "ANGKA", wajib: false, aturan: "Bagian dari I1" },
        { kode: "I1h", variabel: "Urutan prioritas -- Modal usaha", jenis: "ANGKA", wajib: false, aturan: "Bagian dari I1" },
        { kode: "I1i", variabel: "Urutan prioritas -- Bantuan sosial (pangan/tunai)", jenis: "ANGKA", wajib: false, aturan: "Bagian dari I1" },
        { kode: "I1j", variabel: "Urutan prioritas -- Pelatihan keterampilan kerja", jenis: "ANGKA", wajib: false, aturan: "Bagian dari I1" },
        { kode: "I1k", variabel: "Urutan prioritas -- Perlindungan hukum/sosial", jenis: "ANGKA", wajib: false, aturan: "Bagian dari I1" },
        { kode: "I1l", variabel: "Urutan prioritas -- Lainnya", jenis: "ANGKA", wajib: false, aturan: "Bagian dari I1" },
        { kode: "I1m", variabel: "Sebutkan kebutuhan 'Lainnya' (jika I1l diisi)", jenis: "TEKS", wajib: false, aturan: "Diisi hanya jika I1l diisi" },

        aksesFasilitas("I2a", "Puskesmas/klinik terdekat"),
        aksesFasilitas("I2b", "Sekolah SD terdekat"),
        aksesFasilitas("I2c", "Sekolah SMP terdekat"),
        aksesFasilitas("I2d", "Pasar/warung sembako"),
        aksesFasilitas("I2e", "Kantor pemerintah (desa/kec.)"),
        aksesFasilitas("I2f", "Jalan aspal/beraspal"),
        aksesFasilitas("I2g", "Sinyal internet/telepon"),

        {
            kode: "I3",
            variabel: "Apakah Keluarga pernah mengikuti program pelatihan keterampilan/vokasional dari pemerintah?",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: null,
            opsi: [
                { kode: "1", label: "Ya" },
                { kode: "2", label: "Tidak" },
            ],
        },
        {
            kode: "I3a",
            variabel: "Jenis pelatihan (jika I3 = 'Ya')",
            jenis: "TEKS",
            wajib: false,
            aturan: "Diisi hanya jika I3 = 'Ya'",
        },
        {
            kode: "I3b",
            variabel: "Tahun pelatihan (jika I3 = 'Ya')",
            jenis: "TEKS",
            wajib: false,
            aturan: "Diisi hanya jika I3 = 'Ya'",
        },
        {
            kode: "I4",
            variabel:
                "Apakah Keluarga berminat mengikuti program pemberdayaan ekonomi (usaha/keterampilan) jika difasilitasi pemerintah?",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: null,
            opsi: [
                { kode: "1", label: "Ya, sangat berminat" },
                { kode: "2", label: "Berminat" },
                { kode: "3", label: "Tidak berminat" },
                { kode: "4", label: "Tidak tahu" },
            ],
        },
        {
            kode: "I4a",
            variabel: "Jenis kegiatan yang diminati (jika I4 = 'Ya, sangat berminat' atau 'Berminat')",
            jenis: "TEKS",
            wajib: false,
            aturan: "Diisi hanya jika I4 menunjukkan berminat",
        },
    ],
};