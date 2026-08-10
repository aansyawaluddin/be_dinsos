import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isConfirmed = process.argv.includes("--confirm");

const KABUPATEN_TARGET = "KOTA_PALU";

async function main() {
    const wargaPalu = await prisma.warga.findMany({
        where: { kabupatenKota: KABUPATEN_TARGET },
        select: { id: true },
    });
    const wargaIds = wargaPalu.map((w) => w.id);

    if (wargaIds.length === 0) {
        console.log(`Tidak ada data warga dengan kabupatenKota = ${KABUPATEN_TARGET}. Tidak ada yang dihapus.`);
        return;
    }

    const counts = {
        warga: wargaIds.length,
        jawaban_wawancara: await prisma.jawabanWawancara.count({
            where: { wargaId: { in: wargaIds } },
        }),
        jawaban_opsi_dipilih: await prisma.jawabanOpsiDipilih.count({
            where: { jawaban: { wargaId: { in: wargaIds } } },
        }),
        kendala_survei: await prisma.kendalaSurvei.count({
            where: { wargaId: { in: wargaIds } },
        }),
    };

    console.log(`Data warga (${KABUPATEN_TARGET}) yang akan dihapus, beserta relasi turunannya:\n`);
    console.table(counts);
    console.log("Tabel 'user', 'blok_wawancara', 'pertanyaan_wawancara', 'opsi_jawaban' TIDAK disentuh.");
    console.log("Data warga kabupaten/kota lain juga TIDAK disentuh.\n");

    if (!isConfirmed) {
        console.log("Ini cuma preview, belum ada yang dihapus.");
        console.log("Jalanin ulang dengan flag --confirm buat beneran eksekusi:");
        console.log("  node resetDataWargaPalu.js --confirm\n");
        return;
    }

    console.log("\nMenghapus (dalam satu transaksi, sesuai urutan foreign key)...\n");

    const [kendala, jawabanOpsi, jawaban, warga] = await prisma.$transaction([
        prisma.kendalaSurvei.deleteMany({
            where: { wargaId: { in: wargaIds } },
        }),
        prisma.jawabanOpsiDipilih.deleteMany({
            where: { jawaban: { wargaId: { in: wargaIds } } },
        }),
        prisma.jawabanWawancara.deleteMany({
            where: { wargaId: { in: wargaIds } },
        }),
        prisma.warga.deleteMany({
            where: { id: { in: wargaIds } },
        }),
    ]);

    console.log(`- kendala_survei       : ${kendala.count} baris dihapus`);
    console.log(`- jawaban_opsi_dipilih : ${jawabanOpsi.count} baris dihapus`);
    console.log(`- jawaban_wawancara    : ${jawaban.count} baris dihapus`);
    console.log(`- warga (${KABUPATEN_TARGET})     : ${warga.count} baris dihapus`);

    console.log(
        "\nAUTO_INCREMENT TIDAK direset, karena tabel ini masih dipakai kabupaten/kota lain."
    );
    console.log(`\nSelesai. Data warga ${KABUPATEN_TARGET} berhasil dihapus.`);
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });