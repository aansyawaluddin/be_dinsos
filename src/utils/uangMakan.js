import ExcelJS from "exceljs";
import prisma from "../lib/prisma.js";
import { mapKabupatenLabel } from "./wargaMapper.js";

export const MIN_FOTO_UANG_MAKAN = 4;
export const MAX_FOTO_UANG_MAKAN = 10;

export const STATUS_BUKTI_LABEL = {
    LENGKAP: "Lengkap",
    BELUM_UPLOAD: "Belum Upload",
};

const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
const BULAN_INDONESIA = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

export function formatRentangTanggal(tanggalMulai, tanggalSelesai) {
    const mulai = new Date(new Date(tanggalMulai).getTime() + WITA_OFFSET_MS);
    const selesai = new Date(new Date(tanggalSelesai).getTime() + WITA_OFFSET_MS);

    const hariMulai = mulai.getUTCDate();
    const bulanMulai = BULAN_INDONESIA[mulai.getUTCMonth()];
    const hariSelesai = selesai.getUTCDate();
    const bulanSelesai = BULAN_INDONESIA[selesai.getUTCMonth()];

    return bulanMulai === bulanSelesai
        ? `${hariMulai} - ${hariSelesai} ${bulanSelesai}`
        : `${hariMulai} ${bulanMulai} - ${hariSelesai} ${bulanSelesai}`;
}

export function dedupeEnumeratorByNama(rows) {
    const map = new Map();
    for (const u of rows) {
        if (!map.has(u.nama)) {
            map.set(u.nama, u);
        }
    }
    return Array.from(map.values());
}

export function buildWhereBukti({ periodeId, enumeratorId, kabupatenKota }) {
    const where = {};
    if (periodeId) where.periodeId = Number(periodeId);
    if (enumeratorId) where.enumeratorId = Number(enumeratorId);
    if (kabupatenKota) where.enumerator = { kabupatenKota };
    return where;
}

export function mapBuktiRow(b) {
    return {
        id: b.id,
        periode: {
            id: b.periode.id,
            nama: b.periode.nama,
            rentangTanggal: formatRentangTanggal(b.periode.tanggalMulai, b.periode.tanggalSelesai),
        },
        enumerator: {
            id: b.enumerator.id,
            nama: b.enumerator.nama,
            kabupatenKota: b.enumerator.kabupatenKota,
            kabupatenKotaLabel: mapKabupatenLabel(b.enumerator.kabupatenKota) ?? b.enumerator.kabupatenKota,
        },
        status: "LENGKAP",
        statusLabel: STATUS_BUKTI_LABEL.LENGKAP,
        jumlahFoto: b.foto?.length ?? 0,
        minimalFoto: MIN_FOTO_UANG_MAKAN,
        createdAt: b.createdAt,
    };
}

export async function getRingkasanEnumeratorPeriode({ periodeId, kabupatenKota, status, search }) {
    const whereEnumerator = { role: "ENUMERATOR", aktif: true };
    if (kabupatenKota) whereEnumerator.kabupatenKota = kabupatenKota;
    if (search) whereEnumerator.nama = { contains: search };

    const rows = await prisma.user.findMany({
        where: whereEnumerator,
        select: { id: true, nama: true, kabupatenKota: true },
        orderBy: [{ nama: "asc" }, { id: "asc" }],
    });

    const enumerators = dedupeEnumeratorByNama(rows);

    const enumeratorIds = enumerators.map((e) => e.id);
    const buktiList = enumeratorIds.length
        ? await prisma.buktiUangMakan.findMany({
            where: { periodeId, enumeratorId: { in: enumeratorIds } },
            include: { foto: { select: { id: true } } },
        })
        : [];

    const buktiMap = new Map(buktiList.map((b) => [b.enumeratorId, b]));

    const semuaItem = enumerators.map((e) => {
        const bukti = buktiMap.get(e.id);
        const statusEnum = bukti ? "LENGKAP" : "BELUM_UPLOAD";
        return {
            id: e.id,
            nama: e.nama,
            kabupatenKota: e.kabupatenKota,
            kabupatenKotaLabel: mapKabupatenLabel(e.kabupatenKota) ?? e.kabupatenKota,
            status: statusEnum,
            statusLabel: STATUS_BUKTI_LABEL[statusEnum],
            jumlahFoto: bukti?.foto.length ?? 0,
            buktiId: bukti?.id ?? null,
        };
    });

    const totalEnumerator = semuaItem.length;
    const lengkap = semuaItem.filter((i) => i.status === "LENGKAP").length;
    const belumUpload = totalEnumerator - lengkap;

    const items = status ? semuaItem.filter((i) => i.status === status) : semuaItem;

    return { ringkasan: { totalEnumerator, lengkap, belumUpload }, items };
}
export async function buildRekapUangMakanWorkbook({ kabupatenKota } = {}) {
    const whereEnumerator = { role: "ENUMERATOR" };
    if (kabupatenKota) whereEnumerator.kabupatenKota = kabupatenKota;

    const [enumerators, periodeList] = await Promise.all([
        prisma.user.findMany({
            where: whereEnumerator,
            select: { id: true, nama: true, kabupatenKota: true },
            orderBy: [{ kabupatenKota: "asc" }, { nama: "asc" }],
        }),
        prisma.periodeUangMakan.findMany({ orderBy: { tanggalMulai: "asc" } }),
    ]);

    const enumeratorIds = enumerators.map((e) => e.id);
    const buktiList = enumeratorIds.length
        ? await prisma.buktiUangMakan.findMany({
            where: { enumeratorId: { in: enumeratorIds } },
            include: { foto: { select: { id: true } } },
        })
        : [];

    const buktiMap = {};
    for (const b of buktiList) {
        buktiMap[b.enumeratorId] ??= {};
        buktiMap[b.enumeratorId][b.periodeId] = b;
    }

    const FONT_NAME = "Bahnschrift";
    const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBDD7EE" } };
    const THIN = { style: "thin" };
    const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN };

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Rekap Uang Makan");
    const totalKolom = 3 + periodeList.length;

    sheet.mergeCells(1, 1, 1, totalKolom);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = "REKAP DOKUMENTASI UANG MAKAN MINUM ENUMERATOR";
    titleCell.font = { name: FONT_NAME, size: 14, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "center" };
    sheet.getRow(1).height = 18;

    const headerRow = 3;
    sheet.getCell(headerRow, 1).value = "NO";
    sheet.getCell(headerRow, 2).value = "NAMA ENUMERATOR";
    sheet.getCell(headerRow, 3).value = "KABUPATEN/KOTA";
    periodeList.forEach((p, idx) => {
        sheet.getCell(headerRow, 4 + idx).value = p.nama;
    });
    for (let c = 1; c <= totalKolom; c++) {
        const cell = sheet.getCell(headerRow, c);
        cell.font = { name: FONT_NAME, size: 11, bold: true };
        cell.alignment = { horizontal: "center", vertical: "center", wrapText: true };
        cell.fill = HEADER_FILL;
        cell.border = ALL_BORDERS;
    }

    let currentRow = headerRow + 1;
    enumerators.forEach((e, idx) => {
        sheet.getCell(currentRow, 1).value = idx + 1;
        sheet.getCell(currentRow, 2).value = e.nama;
        sheet.getCell(currentRow, 3).value = mapKabupatenLabel(e.kabupatenKota) ?? e.kabupatenKota ?? "-";

        periodeList.forEach((p, pIdx) => {
            const b = buktiMap[e.id]?.[p.id];
            sheet.getCell(currentRow, 4 + pIdx).value = b ? `${b.foto.length} foto (Lengkap)` : "Belum Upload";
        });

        for (let c = 1; c <= totalKolom; c++) {
            const cell = sheet.getCell(currentRow, c);
            cell.font = { name: FONT_NAME, size: 10 };
            cell.alignment = { horizontal: c <= 3 ? "left" : "center", vertical: "center", wrapText: true };
            cell.border = ALL_BORDERS;
        }
        currentRow += 1;
    });

    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = 28;
    sheet.getColumn(3).width = 20;
    for (let i = 0; i < periodeList.length; i++) sheet.getColumn(4 + i).width = 20;

    return workbook;
}