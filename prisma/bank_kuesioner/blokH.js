const SKALA_MANFAAT_PROGRAM = [
    { kode: "1", label: "Tidak Tahu" },
    { kode: "2", label: "Tidak Akses" },
    { kode: "3", label: "Akses, Tidak Manfaat" },
    { kode: "4", label: "Cukup Bermanfaat" },
    { kode: "5", label: "Sangat Bermanfaat" },
];

function programBerani(kode, nama, deskripsi) {
    return {
        kode,
        variabel: `${nama} (${deskripsi})`,
        jenis: "PILIHAN_TUNGGAL",
        wajib: true,
        aturan: null,
        opsi: SKALA_MANFAAT_PROGRAM,
    };
}

export const BLOK_H = {
    kode: "H",
    judul: "Program 9 Berani Pemerintah Provinsi Sulawesi Tengah",
    pertanyaan: [
        programBerani("H1", "Berani Sehat", "layanan kesehatan gratis/bersubsidi"),
        programBerani("H2", "Berani Cerdas", "beasiswa/pendidikan"),
        programBerani("H3", "Berani Kerja", "pelatihan & penempatan kerja"),
        programBerani("H4", "Berani Sejahtera", "bansos & perlindungan sosial"),
        programBerani("H5", "Berani Tumbuh", "pemberdayaan UMKM/ekonomi"),
        programBerani("H6", "Berani Berinfrastruktur", "jalan/jembatan/air bersih"),
        programBerani("H7", "Berani Berinovasi", "teknologi & digitalisasi"),
        programBerani("H8", "Berani Berbudaya", "seni & pelestarian budaya"),
        programBerani("H9", "Berani Bersatu", "kerukunan & partisipasi sosial"),
        {
            kode: "H10",
            variabel: "Dari seluruh Program 9 Berani, mana yang paling dirasakan manfaatnya oleh Keluarga?",
            jenis: "TEKS",
            wajib: true,
            aturan: "Isi nama program (mis. 'Berani Sehat')",
        },
        {
            kode: "H11",
            variabel: "Dari seluruh Program 9 Berani, mana yang paling sulit diakses?",
            jenis: "TEKS",
            wajib: true,
            aturan: "Isi nama program (mis. 'Berani Kerja')",
        },
        {
            kode: "H11a",
            variabel: "Alasan sulit diakses (untuk program yang disebut di H11)",
            jenis: "TEKS",
            wajib: true,
            aturan: "Diisi hanya jika H11 diisi",
        },
        {
            kode: "H12",
            variabel:
                "Secara keseluruhan, bagaimana penilaian Anda terhadap Program 9 Berani dalam meningkatkan kesejahteraan masyarakat?",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: null,
            opsi: [
                { kode: "1", label: "Sangat baik / sangat membantu" },
                { kode: "2", label: "Baik / membantu" },
                { kode: "3", label: "Cukup / biasa saja" },
                { kode: "4", label: "Kurang membantu" },
                { kode: "5", label: "Tidak membantu sama sekali" },
                { kode: "6", label: "Tidak tahu / belum pernah merasakan" },
            ],
        },
    ],
};