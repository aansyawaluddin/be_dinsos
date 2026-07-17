import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import {
    mapKabupaten,
    mapJenisKelamin,
    mapJenisKelaminLabel,
    parseTanggalLahir,
    formatTanggalLahir,
    statusBansos,
    extractDesil,
    clean,
} from "../utils/wargaMapper.js";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");


function readAndMapRows(filePath) {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    return rawRows.map((row, idx) => {
        const rowNumber = idx + 2;
        const kabupatenLabel = clean(row["KABUPATEN"]);
        const kabupatenKota = mapKabupaten(row["KABUPATEN"]);
        const kecamatan = clean(row["KECAMATAN"]);
        const desaKelurahan = clean(row["DESA_KELURAHAN"]);
        const nomorKK = clean(row["nomor kartu keluarga"]);
        const nik = clean(row["nomor induk kependudukan"]);
        const nama = clean(row["nama"]);

        const fieldErrors = [];
        if (!kabupatenKota) fieldErrors.push(`KABUPATEN "${row["KABUPATEN"] ?? ""}" tidak dikenali`);
        if (!kecamatan) fieldErrors.push("Kecamatan kosong");
        if (!desaKelurahan) fieldErrors.push("Desa/Kelurahan kosong");
        if (!nomorKK) fieldErrors.push("Nomor KK kosong");
        if (!nama) fieldErrors.push("Nama kosong");

        return {
            rowNumber,
            kabupatenLabel,
            fieldErrors,
            dbData: {
                kabupatenKota,
                kecamatan,
                desaKelurahan,
                alamat: clean(row["alamat"]),
                rw: clean(row["rw"]),
                rt: clean(row["rt"]),
                desilTerbaru: clean(row["desil terbaru"]),
                nomorKK,
                nik,
                nama,
                jenisKelamin: mapJenisKelamin(row["jenis kelamin"]),
                tanggalLahir: parseTanggalLahir(row["tanggal lahir"]),
                tempatLahir: clean(row["tempat lahir"]),
                statusPerkawinan: clean(row["status perkawinan"]),
                hubunganKeluarga: clean(row["hubungan keluarga"]),
                keberadaanAnggotaKeluarga: clean(row["keberadaan anggota keluarga"]),
                disabilitas: clean(row["disabilitas"]),
                keteranganDisabilitas: clean(row["keterangan disabilitas"]),
                pbiJk: clean(row["PBI-JK"]),
                bansosPkh: clean(row["BANSOS PKH"]),
                bansosSembako: clean(row["BANSOS SEMBAKO"]),
            },
        };
    });
}


async function analyzeRows(mappedRows) {
    const nikCount = {};
    mappedRows.forEach((r) => {
        if (r.dbData.nik) nikCount[r.dbData.nik] = (nikCount[r.dbData.nik] || 0) + 1;
    });

    const niksInFile = [...new Set(mappedRows.map((r) => r.dbData.nik).filter(Boolean))];
    const existing = niksInFile.length
        ? await prisma.warga.findMany({
            where: { nik: { in: niksInFile } },
            select: { nik: true },
        })
        : [];
    const existingNikSet = new Set(existing.map((w) => w.nik));

    let siapDiimpor = 0;
    let duplikatNik = 0;
    let nikKosong = 0;
    let tidakValid = 0;

    const preview = mappedRows.map((r) => {
        const { rowNumber, dbData, kabupatenLabel, fieldErrors } = r;
        const isNikKosong = !dbData.nik;
        const isDuplicateInFile = dbData.nik ? nikCount[dbData.nik] > 1 : false;
        const isDuplicateInDb = dbData.nik ? existingNikSet.has(dbData.nik) : false;
        const isDuplicate = isDuplicateInFile || isDuplicateInDb;
        const hasFieldErrors = fieldErrors.length > 0;

        const bisaDiimpor = !isNikKosong && !isDuplicate && !hasFieldErrors;

        let status = "SIAP";
        let alasan = null;
        if (isNikKosong) {
            status = "NIK_KOSONG";
            alasan = "NIK kosong";
            nikKosong++;
        } else if (isDuplicate) {
            status = "DUPLIKAT";
            alasan = isDuplicateInDb
                ? "NIK sudah terdaftar di database"
                : "NIK duplikat dengan baris lain di file ini";
            duplikatNik++;
        } else if (hasFieldErrors) {
            status = "TIDAK_VALID";
            alasan = fieldErrors.join("; ");
            tidakValid++;
        } else {
            siapDiimpor++;
        }

        return {
            rowNumber,
            nik: dbData.nik,
            nama: dbData.nama,
            kelDesa: dbData.desaKelurahan,
            kecamatan: dbData.kecamatan,
            kabupaten: kabupatenLabel,
            jenisKelamin: mapJenisKelaminLabel(dbData.jenisKelamin),
            tanggalLahir: formatTanggalLahir(dbData.tanggalLahir),
            hubunganKeluarga: dbData.hubunganKeluarga,
            desil: extractDesil(dbData.desilTerbaru),
            pkh: statusBansos(dbData.bansosPkh),
            sembako: statusBansos(dbData.bansosSembako),
            bisaDiimpor,
            status,
            alasan,
        };
    });

    return {
        preview,
        stats: {
            totalBaris: mappedRows.length,
            siapDiimpor,
            duplikatNik,
            nikKosong,
            tidakValid,
        },
    };
}


export async function previewUpload(req, res) {
    if (!req.file) {
        return error(res, "File Excel wajib diupload (field: file)", 400);
    }

    let mappedRows;
    try {
        mappedRows = readAndMapRows(req.file.path);
    } catch (err) {
        fs.unlink(req.file.path, () => { });
        return error(res, "Gagal membaca file Excel, pastikan formatnya sesuai template", 400);
    }

    if (mappedRows.length === 0) {
        fs.unlink(req.file.path, () => { });
        return error(res, "File Excel kosong atau format tidak sesuai", 400);
    }

    const { preview, stats } = await analyzeRows(mappedRows);

    return success(
        res,
        {
            uploadId: req.file.filename,
            namaFile: req.file.originalname,
            stats,
            preview,
        },
        "Preview data warga berhasil dibuat"
    );
}


export async function importWarga(req, res) {
    const { uploadId } = req.params;
    const safeName = path.basename(uploadId || "");
    const filePath = path.join(UPLOAD_DIR, safeName);

    if (!safeName || !fs.existsSync(filePath)) {
        return error(res, "File upload tidak ditemukan atau sudah kedaluwarsa, silakan upload ulang", 404);
    }

    const mappedRows = readAndMapRows(filePath);
    const { preview, stats } = await analyzeRows(mappedRows);

    const rowsToImport = mappedRows.filter((_, idx) => preview[idx].bisaDiimpor);

    let berhasil = 0;
    const gagalImport = [];

    for (const r of rowsToImport) {
        try {
            await prisma.warga.create({
                data: {
                    ...r.dbData,
                    createdById: req.user.id,
                },
            });
            berhasil++;
        } catch (err) {
            gagalImport.push({ rowNumber: r.rowNumber, reason: err.message });
        }
    }

    fs.unlink(filePath, () => { });

    return success(
        res,
        {
            totalBaris: stats.totalBaris,
            diproses: rowsToImport.length,
            berhasil,
            gagal: gagalImport.length,
            dilewati: stats.duplikatNik + stats.nikKosong + stats.tidakValid,
            errors: gagalImport,
        },
        "Import data warga selesai",
        201
    );
}


export async function cancelUpload(req, res) {
    const { uploadId } = req.params;
    const safeName = path.basename(uploadId || "");
    const filePath = path.join(UPLOAD_DIR, safeName);

    if (safeName && fs.existsSync(filePath)) {
        fs.unlink(filePath, () => { });
    }

    return success(res, null, "Upload dibatalkan");
}

export async function listWarga(req, res) {
    const { page = 1, limit = 20, kabupatenKota, statusWawancara, search } = req.query;

    const where = {};
    if (kabupatenKota) where.kabupatenKota = kabupatenKota;
    if (statusWawancara) where.statusWawancara = statusWawancara;
    if (search) {
        where.OR = [
            { nama: { contains: search } },
            { nik: { contains: search } },
        ];
    }

    const [items, total] = await Promise.all([
        prisma.warga.findMany({
            where,
            select: {
                id: true,
                nama: true,
                nik: true,
                statusWawancara: true,
            },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit),
            orderBy: { id: "asc" },
        }),
        prisma.warga.count({ where }),
    ]);

    return success(res, {
        items,
        pagination: { page: Number(page), limit: Number(limit), total },
    });
}