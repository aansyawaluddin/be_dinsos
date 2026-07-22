import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const BLOK_D = {
    kode: "D",
    judul: "Karakteristik Responden & Rumah Tangga",
    pertanyaan: [
        {
            kode: "D1",
            variabel: "Kategori responden",
            jenis: "MULTI_PILIHAN",
            wajib: true,
            aturan: "Minimal pilih satu",
            opsi: [
                { kode: "A", label: "RT miskin/tidak mampu" },
                { kode: "B", label: "Rentan miskin" },
                { kode: "C", label: "Lansia" },
                { kode: "D", label: "Penyandang disabilitas" },
                { kode: "E", label: "Perempuan kepala keluarga" },
                { kode: "F", label: "Pekerja informal" },
                { kode: "G", label: "Lainnya" },
            ],
        },
        {
            kode: "D2",
            variabel: "Status dalam DTSEN",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: "Diutamakan diisi otomatis dari data desil awal (prelist) bila tersedia",
            opsi: [
                { kode: "1", label: "Desil 1" },
                { kode: "2", label: "Desil 2" },
                { kode: "3", label: "Desil 3" },
                { kode: "4", label: "Desil 4" },
                { kode: "5", label: "Tidak terdaftar" },
                { kode: "8", label: "Tidak tahu" },
            ],
        },
        {
            kode: "D3",
            variabel: "Jumlah anggota rumah tangga",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: null,
            opsi: [
                { kode: "1", label: "1–2 orang" },
                { kode: "2", label: "3–4 orang" },
                { kode: "3", label: "5–6 orang" },
                { kode: "4", label: "7 orang atau lebih" },
            ],
        },
        {
            kode: "D4",
            variabel: "Jenis kelamin kepala rumah tangga",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: null,
            opsi: [
                { kode: "1", label: "Laki-laki" },
                { kode: "2", label: "Perempuan" },
            ],
        },
        {
            kode: "D5",
            variabel: "Umur responden",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: "Kode 1 cuma valid kalau responden sudah menikah",
            opsi: [
                { kode: "1", label: "Di bawah 18 tahun (sudah menikah)" },
                { kode: "2", label: "18–30 tahun" },
                { kode: "3", label: "31–45 tahun" },
                { kode: "4", label: "46–60 tahun" },
                { kode: "5", label: "61 tahun atau lebih" },
            ],
        },
        {
            kode: "D6",
            variabel: "Pendidikan tertinggi kepala rumah tangga",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: null,
            opsi: [
                { kode: "0", label: "Tidak/belum tamat SD" },
                { kode: "1", label: "SD" },
                { kode: "2", label: "SMP" },
                { kode: "3", label: "SMA" },
                { kode: "4", label: "D1–D3" },
                { kode: "5", label: "D4/S1" },
                { kode: "6", label: "S2/S3" },
            ],
        },
        {
            kode: "D7",
            variabel: "Status pekerjaan pencari nafkah utama",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: null,
            opsi: [
                { kode: "1", label: "Berusaha sendiri" },
                { kode: "2", label: "Berusaha dibantu buruh" },
                { kode: "3", label: "Buruh/karyawan swasta" },
                { kode: "4", label: "ASN/TNI/Polri/BUMN/BUMD" },
                { kode: "5", label: "Pekerja bebas" },
                { kode: "6", label: "Pekerja keluarga/tidak dibayar" },
                { kode: "7", label: "Tidak bekerja" },
            ],
        },
        {
            kode: "D8",
            variabel: "Sumber penghasilan utama rumah tangga",
            jenis: "PILIHAN_TUNGGAL",
            wajib: true,
            aturan: null,
            opsi: [
                { kode: "1", label: "ART yang bekerja" },
                { kode: "2", label: "Kiriman uang/barang" },
                { kode: "3", label: "Hasil investasi" },
                { kode: "4", label: "Tabungan" },
                { kode: "5", label: "Pensiun" },
                { kode: "6", label: "Lainnya" },
            ],
        },
        {
            kode: "D9",
            variabel: "Perkiraan pendapatan rumah tangga per bulan",
            jenis: "PILIHAN_TUNGGAL",
            wajib: false,
            aturan: "Opsional karena sensitif; jawaban berupa rentang, bukan nilai persis",
            opsi: [
                { kode: "1", label: "< Rp1 juta" },
                { kode: "2", label: "Rp1–2 juta" },
                { kode: "3", label: "Rp2–3 juta" },
                { kode: "4", label: "> Rp3 juta" },
                { kode: "8", label: "Tidak bersedia menjawab" },
            ],
        },
        {
            kode: "D10",
            variabel: "Jumlah tanggungan khusus (lansia/anak balita/disabilitas)",
            jenis: "PILIHAN_TUNGGAL",
            wajib: false,
            aturan: null,
            opsi: [
                { kode: "0", label: "Tidak ada" },
                { kode: "1", label: "1–2 orang" },
                { kode: "2", label: "3–4 orang" },
                { kode: "3", label: "5 orang atau lebih" },
            ],
        },
    ],
};

async function seedBlok(blokConfig, urutanBlok) {
    const blok = await prisma.blokWawancara.upsert({
        where: { kode: blokConfig.kode },
        update: { judul: blokConfig.judul, urutan: urutanBlok },
        create: { kode: blokConfig.kode, judul: blokConfig.judul, urutan: urutanBlok },
    });

    for (let i = 0; i < blokConfig.pertanyaan.length; i++) {
        const soal = blokConfig.pertanyaan[i];

        const pertanyaan = await prisma.pertanyaanWawancara.upsert({
            where: { blokId_kode: { blokId: blok.id, kode: soal.kode } },
            update: {
                variabel: soal.variabel,
                jenis: soal.jenis,
                wajib: soal.wajib,
                aturan: soal.aturan ?? null,
                urutan: i,
            },
            create: {
                blokId: blok.id,
                kode: soal.kode,
                variabel: soal.variabel,
                jenis: soal.jenis,
                wajib: soal.wajib,
                aturan: soal.aturan ?? null,
                urutan: i,
            },
        });

        for (let j = 0; j < (soal.opsi?.length ?? 0); j++) {
            const opsi = soal.opsi[j];
            await prisma.opsiJawaban.upsert({
                where: { pertanyaanId_kode: { pertanyaanId: pertanyaan.id, kode: opsi.kode } },
                update: { label: opsi.label, urutan: j },
                create: {
                    pertanyaanId: pertanyaan.id,
                    kode: opsi.kode,
                    label: opsi.label,
                    urutan: j,
                },
            });
        }
    }

    console.log(`Blok ${blokConfig.kode} (${blokConfig.judul}): ${blokConfig.pertanyaan.length} pertanyaan di-seed.`);
}

async function main() {
    await seedBlok(BLOK_D, 0);
    console.log("Seed instrumen wawancara selesai.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });