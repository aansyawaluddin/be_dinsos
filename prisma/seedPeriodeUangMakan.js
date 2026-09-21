import prisma from "../src/lib/prisma.js";

function awalHariWita(tahun, bulan, tanggal) {
    return new Date(Date.UTC(tahun, bulan - 1, tanggal, -8, 0, 0, 0));
}
function akhirHariWita(tahun, bulan, tanggal) {
    return new Date(Date.UTC(tahun, bulan - 1, tanggal, 15, 59, 59, 999));
}

const TAHUN = 2026;

const DAFTAR_PERIODE = [
    { nama: "PERIODE I", mulai: [8, 18], selesai: [8, 27] },
    { nama: "PERIODE II", mulai: [8, 28], selesai: [9, 6] },
    { nama: "PERIODE III", mulai: [9, 7], selesai: [9, 16] },
    { nama: "PERIODE IV", mulai: [9, 17], selesai: [9, 26] },
    { nama: "PERIODE V", mulai: [9, 27], selesai: [10, 6] },
    { nama: "PERIODE VI", mulai: [10, 7], selesai: [10, 16] },
    { nama: "PERIODE VII", mulai: [10, 17], selesai: [10, 26] },
    { nama: "PERIODE VIII", mulai: [10, 27], selesai: [11, 5] },
    { nama: "PERIODE IX", mulai: [11, 6], selesai: [11, 15] },
];

async function main() {
    for (const p of DAFTAR_PERIODE) {
        const tanggalMulai = awalHariWita(TAHUN, p.mulai[0], p.mulai[1]);
        const tanggalSelesai = akhirHariWita(TAHUN, p.selesai[0], p.selesai[1]);

        await prisma.periodeUangMakan.upsert({
            where: { nama: p.nama },
            update: { tanggalMulai, tanggalSelesai },
            create: { nama: p.nama, tanggalMulai, tanggalSelesai },
        });
        console.log(`OK: ${p.nama}`);
    }
}

main()
    .catch((err) => {
        console.error(err);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());