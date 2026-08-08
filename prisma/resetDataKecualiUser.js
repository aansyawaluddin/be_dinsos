import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isConfirmed = process.argv.includes("--confirm");

async function main() {
    const counts = {
        jawaban_opsi_dipilih: await prisma.jawabanOpsiDipilih.count(),
        jawaban_wawancara: await prisma.jawabanWawancara.count(),
        warga: await prisma.warga.count(),
        opsi_jawaban: await prisma.opsiJawaban.count(),
        pertanyaan_wawancara: await prisma.pertanyaanWawancara.count(),
        blok_wawancara: await prisma.blokWawancara.count(),
    };

    console.log("Data yang akan dihapus (tabel 'user' TIDAK termasuk):\n");
    console.table(counts);

    if (!isConfirmed) {
        console.log("Ini cuma preview, belum ada yang dihapus.");
        console.log("Jalanin ulang dengan flag --confirm buat beneran eksekusi:");
        console.log("  node resetDataKecualiUser.js --confirm\n");
        return;
    }

    console.log("\nMenghapus (dalam satu transaksi, sesuai urutan foreign key)...\n");

    // Urutan wajib: child dulu baru parent, biar gak kena FK constraint error
    const [jawabanOpsi, jawaban, warga, opsi, pertanyaan, blok] = await prisma.$transaction([
        prisma.jawabanOpsiDipilih.deleteMany(),
        prisma.jawabanWawancara.deleteMany(),
        prisma.warga.deleteMany(),
        prisma.opsiJawaban.deleteMany(),
        prisma.pertanyaanWawancara.deleteMany(),
        prisma.blokWawancara.deleteMany(),
    ]);

    console.log(`- jawaban_opsi_dipilih : ${jawabanOpsi.count} baris dihapus`);
    console.log(`- jawaban_wawancara    : ${jawaban.count} baris dihapus`);
    console.log(`- warga                : ${warga.count} baris dihapus`);
    console.log(`- opsi_jawaban         : ${opsi.count} baris dihapus`);
    console.log(`- pertanyaan_wawancara : ${pertanyaan.count} baris dihapus`);
    console.log(`- blok_wawancara       : ${blok.count} baris dihapus`);
    console.log("\nSelesai. Tabel 'user' tidak disentuh sama sekali.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });