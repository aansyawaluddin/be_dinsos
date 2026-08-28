// debugExportCount.js
import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

const STATUS_UNTUK_SEMUA = ["SUDAH_DIWAWANCARA", "DISETUJUI", "DITOLAK"];
const whereWarga = { statusWawancara: { in: STATUS_UNTUK_SEMUA } };

async function main() {
    // 1. Total count pake where yang PERSIS sama kayak export
    const totalCount = await prisma.warga.count({ where: whereWarga });
    console.log("1) Total count (where sama kayak export):", totalCount);

    // 2. Breakdown per kabupaten
    const perKab = await prisma.warga.groupBy({
        by: ["kabupatenKota"],
        where: whereWarga,
        _count: { _all: true },
    });
    console.log("2) Breakdown per kabupaten:");
    perKab.forEach((r) => console.log("   ", r.kabupatenKota, r._count._all));

    // 3. Breakdown per status (bandingin sama angka dashboard: 1184 / 6612 / 2)
    const perStatus = await prisma.warga.groupBy({
        by: ["statusWawancara"],
        where: whereWarga,
        _count: { _all: true },
    });
    console.log("3) Breakdown per status:");
    perStatus.forEach((r) => console.log("   ", r.statusWawancara, r._count._all));

    // 4. Simulasi manual loop cursor persis kayak di iterDataSurveiRows,
    //    tapi print progress tiap batch biar keliatan berhenti di mana & kenapa
    let cursorId, totalLooped = 0, batchNum = 0;
    const orderBy = [{ kabupatenKota: "asc" }, { tanggalWawancara: "asc" }, { id: "asc" }];
    while (true) {
        const batch = await prisma.warga.findMany({
            where: whereWarga,
            select: { id: true, kabupatenKota: true, tanggalWawancara: true },
            orderBy,
            ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
            take: 300,
        });
        batchNum++;
        const kabDiBatch = [...new Set(batch.map((b) => b.kabupatenKota))];
        console.log(`4) Batch #${batchNum}: ${batch.length} row | kabupaten: ${kabDiBatch.join(", ")}`);
        if (batch.length === 0) break;
        totalLooped += batch.length;
        cursorId = batch[batch.length - 1].id;
    }
    console.log("4) Total row hasil loop cursor:", totalLooped);
}

main()
    .catch((e) => console.error(e))
    .finally(() => prisma.$disconnect());