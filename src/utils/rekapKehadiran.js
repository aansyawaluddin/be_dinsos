import ExcelJS from "exceljs";
import prisma from "../lib/prisma.js";

const STATUS_SURVEY_ROWS = [
    { key: "SURVEY_WARGA", label: "Selesai Wawancara", isTotal: true },
    { key: "SUDAH_DIWAWANCARA", label: "Menunggu Disetujui" },
    { key: "DISETUJUI", label: "Di setujui" },
    { key: "DITOLAK", label: "Ditolak" },
];

const STATUS_KEYS_DIWAWANCARA = ["SUDAH_DIWAWANCARA", "DISETUJUI", "DITOLAK"];

const FONT_NAME = "Bahnschrift";
const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFBDD7EE" } };
const THIN = { style: "thin" };
const ALL_BORDERS = { top: THIN, left: THIN, bottom: THIN, right: THIN };

const BULAN_LABEL = [
    "JANUARI", "FEBRUARI", "MARET", "APRIL", "MEI", "JUNI",
    "JULI", "AGUSTUS", "SEPTEMBER", "OKTOBER", "NOVEMBER", "DESEMBER",
];

const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;

function getTanggalWita(date) {
    return new Date(date.getTime() + WITA_OFFSET_MS).getUTCDate();
}

function getRentangBulanWitaUtc(tahun, bulan) {
    const awalBulanUtc = new Date(Date.UTC(tahun, bulan - 1, 1, -8, 0, 0, 0));
    const akhirBulanUtc = new Date(Date.UTC(tahun, bulan, 1, -8, 0, 0, 0));
    return { awalBulanUtc, akhirBulanUtc };
}

export async function buildRekapKehadiranWorkbook({ bulan, tahun, kabupatenKota }) {
    const jumlahHari = new Date(tahun, bulan, 0).getDate();
    const { awalBulanUtc, akhirBulanUtc } = getRentangBulanWitaUtc(tahun, bulan);

    const whereEnumerator = { role: "ENUMERATOR" };
    if (kabupatenKota) whereEnumerator.kabupatenKota = kabupatenKota;

    const enumerators = await prisma.user.findMany({
        where: whereEnumerator,
        select: { id: true, nama: true, kelurahanTugas: true, kecamatanTugas: true, kabupatenKota: true },
        orderBy: [{ kabupatenKota: "asc" }, { nama: "asc" }],
    });

    const enumeratorIds = enumerators.map((e) => e.id);
    const wargaList = enumeratorIds.length
        ? await prisma.warga.findMany({
            where: {
                diwawancaraOlehId: { in: enumeratorIds },
                tanggalWawancara: { gte: awalBulanUtc, lt: akhirBulanUtc },
            },
            select: { diwawancaraOlehId: true, statusWawancara: true, tanggalWawancara: true },
        })
        : [];

    const rekapMap = {};
    for (const w of wargaList) {
        const day = getTanggalWita(w.tanggalWawancara);
        rekapMap[w.diwawancaraOlehId] ??= {};
        rekapMap[w.diwawancaraOlehId][w.statusWawancara] ??= {};
        rekapMap[w.diwawancaraOlehId][w.statusWawancara][day] =
            (rekapMap[w.diwawancaraOlehId][w.statusWawancara][day] || 0) + 1;
    }

    const totalKolom = 4 + jumlahHari + 1;

    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Rekap Kehadiran");

    sheet.mergeCells(1, 1, 1, totalKolom);
    const titleCell = sheet.getCell(1, 1);
    titleCell.value = "DATA REKAP KEHADIRAN DAN CAPAIAN KINERJA ENUMERATOR";
    titleCell.font = { name: FONT_NAME, size: 14, bold: true };
    titleCell.alignment = { horizontal: "center", vertical: "center" };
    sheet.getRow(1).height = 18;

    sheet.mergeCells(3, 1, 5, 1);
    sheet.mergeCells(3, 2, 5, 2);
    sheet.mergeCells(3, 3, 5, 3);
    sheet.mergeCells(3, 4, 5, 4);
    sheet.mergeCells(3, 5, 3, totalKolom - 1);
    sheet.mergeCells(4, 5, 4, totalKolom - 1);

    sheet.getCell(3, 1).value = "NO";
    sheet.getCell(3, 2).value = "NAMA ENUMERATOR";
    sheet.getCell(3, 3).value = "LOKUS";
    sheet.getCell(3, 4).value = "STATUS SURVEY";
    sheet.getCell(3, 5).value = `${BULAN_LABEL[bulan - 1]} ${tahun}`;
    sheet.getCell(4, 5).value = "TANGGAL";
    for (let d = 1; d <= jumlahHari; d++) {
        sheet.getCell(5, 4 + d).value = d;
    }
    sheet.getCell(5, totalKolom).value = "JUMLAH";

    for (let r = 3; r <= 5; r++) {
        for (let c = 1; c <= totalKolom; c++) {
            const cell = sheet.getCell(r, c);
            cell.font = { name: FONT_NAME, size: 11, bold: true };
            cell.alignment = { horizontal: "center", vertical: "center" };
            cell.fill = HEADER_FILL;
            cell.border = ALL_BORDERS;
        }
    }

    let currentRow = 6;
    let no = 0;
    for (const e of enumerators) {
        no += 1;
        const startRow = currentRow;
        for (let idx = 0; idx < STATUS_SURVEY_ROWS.length; idx++) {
            const status = STATUS_SURVEY_ROWS[idx];
            const r = currentRow;
            if (idx === 0) {
                sheet.getCell(r, 1).value = no;
                sheet.getCell(r, 2).value = e.nama;
                sheet.getCell(r, 3).value = e.kelurahanTugas || "-";
            }
            sheet.getCell(r, 4).value = status.label;

            let dayMap;
            if (status.isTotal) {
                dayMap = {};
                for (const k of STATUS_KEYS_DIWAWANCARA) {
                    const m = rekapMap[e.id]?.[k] || {};
                    for (const d of Object.keys(m)) {
                        dayMap[d] = (dayMap[d] || 0) + m[d];
                    }
                }
            } else {
                dayMap = rekapMap[e.id]?.[status.key] || {};
            }

            let total = 0;
            for (let d = 1; d <= jumlahHari; d++) {
                const jumlahHariIni = dayMap[d] || 0;
                if (jumlahHariIni) sheet.getCell(r, 4 + d).value = jumlahHariIni;
                total += jumlahHariIni;
            }
            sheet.getCell(r, totalKolom).value = total;

            for (let c = 1; c <= totalKolom; c++) {
                const cell = sheet.getCell(r, c);
                cell.font = { name: FONT_NAME, size: 11, bold: !!status.isTotal };
                cell.alignment = {
                    horizontal: c === 4 ? "left" : "center",
                    vertical: "center",
                    wrapText: c === 2 || c === 3,
                };
                cell.border = ALL_BORDERS;
                if (status.isTotal && c >= 4) {
                    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF1DD" } };
                }
            }
            sheet.getRow(r).height = 35.25;
            currentRow += 1;
        }
        const endRow = currentRow - 1;
        sheet.mergeCells(startRow, 1, endRow, 1);
        sheet.mergeCells(startRow, 2, endRow, 2);
        sheet.mergeCells(startRow, 3, endRow, 3);
    }

    const namaMaxLen = Math.max(22, ...enumerators.map((e) => (e.nama || "").length + 2));
    const lokusMaxLen = Math.max(18, ...enumerators.map((e) => (e.kelurahanTugas || "-").length + 2));

    sheet.getColumn(1).width = 6;
    sheet.getColumn(2).width = namaMaxLen;
    sheet.getColumn(3).width = lokusMaxLen;
    sheet.getColumn(4).width = 20;
    for (let d = 1; d <= jumlahHari; d++) sheet.getColumn(4 + d).width = 4.5;
    sheet.getColumn(totalKolom).width = 10;

    return workbook;
}