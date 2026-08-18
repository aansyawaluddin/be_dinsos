import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const isConfirmed = process.argv.includes("--confirm");

async function main() {
    const counts = {
        jawaban_opsi_dipilih: await prisma.jawabanOpsiDipilih.count(),
        jawaban_wawancara: await prisma.jawabanWawancara.count(),
        kendala_survei: await prisma.kendalaSurvei.count(),
        warga_sudah_diwawancara: await prisma.warga.count({
            where: { statusWawancara: { not: "BELUM_DIWAWANCARA" } },
        }),
    };

    console.log("Reset hasil wawancara (data warga & file fisik TIDAK dihapus, hanya di-reset):\n");
    console.table(counts);

    if (!isConfirmed) {
        console.log("Ini cuma preview, belum ada yang dihapus/direset.");
        console.log("Jalanin ulang dengan flag --confirm buat beneran eksekusi:");
        console.log("  node resetHasilWawancara.js --confirm\n");
        return;
    }

    console.log("\nMenghapus jawaban wawancara & kendala survei, lalu reset field warga (satu transaksi)...\n");

    const [jawabanOpsi, jawaban, kendala, wargaReset] = await prisma.$transaction([
        prisma.jawabanOpsiDipilih.deleteMany(),
        prisma.jawabanWawancara.deleteMany(),
        prisma.kendalaSurvei.deleteMany(),
        prisma.warga.updateMany({
            data: {
                statusWawancara: "BELUM_DIWAWANCARA",
                keteranganValidasi: null,
                tanggalWawancara: null,
                diwawancaraOlehId: null,
                klasifikasi: null,
                skorSurvei: null,
                skorMaksimal: null,
                latitude: null,
                longitude: null,
                fotoDokumentasi: null,
                fotoRumah: null,
                fotoKtp: null,
                fotoKk: null,
                tandaTanganResponden: null,
                tandaTanganEnumerator: null,
            },
        }),
    ]);

    console.log(`- jawaban_opsi_dipilih : ${jawabanOpsi.count} baris dihapus`);
    console.log(`- jawaban_wawancara    : ${jawaban.count} baris dihapus`);
    console.log(`- kendala_survei       : ${kendala.count} baris dihapus`);
    console.log(`- warga                : ${wargaReset.count} baris di-reset field wawancaranya`);

    console.log("\nReset AUTO_INCREMENT (jawaban_opsi_dipilih, jawaban_wawancara, kendala_survei)...\n");

    const tabelUntukReset = ["jawaban_opsi_dipilih", "jawaban_wawancara", "kendala_survei"];
    for (const nama of tabelUntukReset) {
        await prisma.$executeRawUnsafe(`ALTER TABLE \`${nama}\` AUTO_INCREMENT = 1;`);
        console.log(`- ${nama}: AUTO_INCREMENT direset ke 1`);
    }

    console.log("\nSelesai. Data warga (identitas) masih utuh, hasil wawancara sudah direset di database.");
    console.log("File fisik (foto & tanda tangan) di folder uploads TIDAK dihapus.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });