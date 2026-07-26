import { PrismaClient } from "@prisma/client";
import { BLOK_A } from "./bank_kuesioner/blokA.js";
import { BLOK_B } from "./bank_kuesioner/blokB.js";
import { BLOK_C } from "./bank_kuesioner/blokC.js";
import { BLOK_D } from "./bank_kuesioner/blokD.js";
import { BLOK_E } from "./bank_kuesioner/blokE.js";
import { BLOK_F } from "./bank_kuesioner/blokF.js";
import { BLOK_G } from "./bank_kuesioner/blokG.js";
import { BLOK_H } from "./bank_kuesioner/blokH.js";
import { BLOK_I } from "./bank_kuesioner/blokI.js";
import { BLOK_J } from "./bank_kuesioner/blokJ.js";
import { BLOK_K } from "./bank_kuesioner/blokK.js";
import { BLOK_L } from "./bank_kuesioner/blokL.js";

const prisma = new PrismaClient();

const SEMUA_BLOK = [
    BLOK_A, BLOK_B, BLOK_C, BLOK_D, BLOK_E,
    BLOK_F, BLOK_G, BLOK_H, BLOK_I, BLOK_J, BLOK_K, BLOK_L,
];

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

async function hapusBlokLama(kode) {
    const blokLama = await prisma.blokWawancara.findUnique({ where: { kode } });
    if (!blokLama) return;

    const pertanyaanLama = await prisma.pertanyaanWawancara.findMany({ where: { blokId: blokLama.id } });
    const pertanyaanIds = pertanyaanLama.map((p) => p.id);

    if (pertanyaanIds.length > 0) {
        const jawabanLama = await prisma.jawabanWawancara.findMany({
            where: { pertanyaanId: { in: pertanyaanIds } },
        });
        const jawabanIds = jawabanLama.map((j) => j.id);

        if (jawabanIds.length > 0) {
            await prisma.jawabanOpsiDipilih.deleteMany({ where: { jawabanId: { in: jawabanIds } } });
            await prisma.jawabanWawancara.deleteMany({ where: { id: { in: jawabanIds } } });
        }
        await prisma.opsiJawaban.deleteMany({ where: { pertanyaanId: { in: pertanyaanIds } } });
        await prisma.pertanyaanWawancara.deleteMany({ where: { blokId: blokLama.id } });
    }

    await prisma.blokWawancara.delete({ where: { id: blokLama.id } });
    console.log(`Blok lama "${kode}" (placeholder) beserta jawabannya berhasil dihapus.`);
}

async function main() {
    await hapusBlokLama("D");

    for (let i = 0; i < SEMUA_BLOK.length; i++) {
        await seedBlok(SEMUA_BLOK[i], i);
    }

    console.log("Seed instrumen selesai.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });