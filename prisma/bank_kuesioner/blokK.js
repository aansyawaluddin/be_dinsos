export const BLOK_K = {
    kode: "K",
    judul: "Persepsi dan Harapan Masyarakat",
    pertanyaan: [
        {
            kode: "K1",
            variabel: "Bagaimana penilaian Anda terhadap kualitas pelayanan pemerintah daerah secara keseluruhan?",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: null,
            opsi: [
                { kode: "1", label: "Sangat baik" },
                { kode: "2", label: "Baik" },
                { kode: "3", label: "Cukup" },
                { kode: "4", label: "Buruk" },
                { kode: "5", label: "Sangat buruk" },
            ],
        },
        {
            kode: "K2",
            variabel:
                "Menurut Anda, apa yang harus menjadi prioritas utama Pemerintah Provinsi Sulawesi Tengah dalam 5 tahun ke depan?",
            jenis: "MULTI_PILIHAN",
            wajib: true,
            aturan: "Pilih maksimal 2",
            opsi: [
                { kode: "1", label: "Pengentasan kemiskinan" },
                { kode: "2", label: "Peningkatan kualitas pendidikan" },
                { kode: "3", label: "Peningkatan layanan kesehatan" },
                { kode: "4", label: "Penciptaan lapangan kerja" },
                { kode: "5", label: "Pembangunan infrastruktur" },
                { kode: "6", label: "Peningkatan bantuan sosial" },
                { kode: "7", label: "Pemberdayaan UMKM" },
                { kode: "8", label: "Pengembangan pertanian/perikanan" },
            ],
        },
        {
            kode: "K3",
            variabel: "Apakah Anda optimis kondisi ekonomi Keluarga akan membaik dalam 2 tahun ke depan?",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: null,
            opsi: [
                { kode: "1", label: "Sangat optimis" },
                { kode: "2", label: "Optimis" },
                { kode: "3", label: "Tidak yakin" },
                { kode: "4", label: "Pesimis" },
                { kode: "5", label: "Sangat pesimis" },
            ],
        },
        {
            kode: "K4",
            variabel: "Apakah Anda mengetahui cara melaporkan keluhan terkait program sosial kepada pemerintah?",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: null,
            opsi: [
                { kode: "1", label: "Ya, dan pernah melapor" },
                { kode: "2", label: "Ya, tapi belum pernah melapor" },
                { kode: "3", label: "Tidak tahu cara melapor" },
            ],
        },
        {
            kode: "K5",
            variabel:
                "Apa satu hal yang paling dibutuhkan Keluarga Bapak/Ibu agar kondisi ekonominya bisa membaik? (pertanyaan terbuka)",
            jenis: "TEKS",
            wajib: true,
            aturan: null,
        },
    ],
};