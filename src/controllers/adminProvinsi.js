import XLSX from "xlsx";
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { hashPassword } from "../utils/hash.js";
import {
    mapKabupaten,
    mapKabupatenLabel,
    resolveKabupatenKota,
    mapJenisKelamin,
    mapJenisKelaminLabel,
    parseTanggalLahir,
    formatTanggalLahir,
    statusBansos,
    extractDesil,
    getInitials,
    hitungUsia,
    formatDesilLabel,
    formatRtRw,
    formatSkor,
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

    const preview = mappedRows.map((r, idx) => {
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
            nomor: idx + 1,
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

const STATUS_WAWANCARA_LABEL = {
    SUDAH_DIWAWANCARA: "Sudah Disurvei",
    BELUM_DIWAWANCARA: "Belum Disurvei",
};

export async function listWarga(req, res) {
    const { page = 1, limit = 20, kabupatenKota, statusWawancara, search } = req.query;

    const where = {};
    if (kabupatenKota) where.kabupatenKota = kabupatenKota;
    if (statusWawancara) where.statusWawancara = statusWawancara;
    if (search) {
        where.OR = [
            { nama: { contains: search } },
            { nik: { contains: search } },
            { desaKelurahan: { contains: search } },
        ];
    }

    const [rows, total, sudahDisurvei, belumDisurvei] = await Promise.all([
        prisma.warga.findMany({
            where,
            select: {
                id: true,
                nik: true,
                nama: true,
                kabupatenKota: true,
                desaKelurahan: true,
                tanggalLahir: true,
                desilTerbaru: true,
                statusWawancara: true,
            },
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit),
            orderBy: { id: "asc" },
        }),
        prisma.warga.count({ where }),
        prisma.warga.count({ where: { ...where, statusWawancara: "SUDAH_DIWAWANCARA" } }),
        prisma.warga.count({ where: { ...where, statusWawancara: "BELUM_DIWAWANCARA" } }),
    ]);

    const items = rows.map((w) => ({
        id: w.id,
        nik: w.nik,
        nama: w.nama,
        inisial: getInitials(w.nama),
        kabupatenKota: mapKabupatenLabel(w.kabupatenKota),
        kelurahan: w.desaKelurahan,
        usia: hitungUsia(w.tanggalLahir),
        desilAwal: formatDesilLabel(w.desilTerbaru),
        statusWawancara: w.statusWawancara,
        statusLabel: STATUS_WAWANCARA_LABEL[w.statusWawancara] ?? w.statusWawancara,
    }));

    return success(res, {
        items,
        ringkasan: {
            total,
            sudahDisurvei,
            belumDisurvei,
        },
        pagination: { page: Number(page), limit: Number(limit), total },
    });
}

export async function getWargaDetail(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID warga tidak valid", 400);
    }

    const warga = await prisma.warga.findUnique({
        where: { id },
        include: {
            diwawancaraOleh: { select: { nama: true } },
        },
    });

    if (!warga) {
        return error(res, "Data warga tidak ditemukan", 404);
    }

    return success(res, {
        id: warga.id,
        nik: warga.nik,
        nama: warga.nama,
        inisial: getInitials(warga.nama),
        alamat: warga.alamat,
        rtRw: formatRtRw(warga.rt, warga.rw),
        kelurahan: warga.desaKelurahan,
        kecamatan: warga.kecamatan,
        usia: hitungUsia(warga.tanggalLahir),
        statusLabel: STATUS_WAWANCARA_LABEL[warga.statusWawancara] ?? warga.statusWawancara,
        klasifikasi: warga.klasifikasi,
        skorLabel: formatSkor(warga.skorSurvei, warga.skorMaksimal),
        surveyor: warga.diwawancaraOleh?.nama ?? null,
    });
}

export async function getCharts(req, res) {
    const { kabupatenKota } = req.query;

    const whereRegional = {};
    if (kabupatenKota) whereRegional.kabupatenKota = kabupatenKota;

    const [groupedDesil, groupedStatus, groupedWilayah] = await Promise.all([
        prisma.warga.groupBy({
            by: ["desilTerbaru"],
            where: { ...whereRegional, desilTerbaru: { not: null } },
            _count: { _all: true },
        }),
        prisma.warga.groupBy({
            by: ["statusWawancara"],
            where: whereRegional,
            _count: { _all: true },
        }),
        prisma.warga.groupBy({
            by: ["kabupatenKota"],
            _count: { _all: true },
        }),
    ]);

    const desilAwalItems = groupedDesil
        .map((g) => ({
            label: formatDesilLabel(g.desilTerbaru) ?? g.desilTerbaru,
            urutan: extractDesil(g.desilTerbaru) ?? 999,
            jumlah: g._count._all,
        }))
        .sort((a, b) => a.urutan - b.urutan)
        .map(({ label, jumlah }) => ({ label, jumlah }));

    const statusCountMap = Object.fromEntries(groupedStatus.map((g) => [g.statusWawancara, g._count._all]));
    const statusItems = [
        { label: "Sudah Disurvei", jumlah: statusCountMap.SUDAH_DIWAWANCARA || 0 },
        { label: "Belum Disurvei", jumlah: statusCountMap.BELUM_DIWAWANCARA || 0 },
    ];

    const wilayahItems = groupedWilayah
        .map((g) => ({ label: mapKabupatenLabel(g.kabupatenKota) ?? g.kabupatenKota, jumlah: g._count._all }))
        .sort((a, b) => b.jumlah - a.jumlah);

    const sumJumlah = (items) => items.reduce((sum, item) => sum + item.jumlah, 0);

    return success(res, {
        desilAwal: { items: desilAwalItems, total: sumJumlah(desilAwalItems) },
        status: { items: statusItems, total: sumJumlah(statusItems) },
        wilayah: { items: wilayahItems, total: sumJumlah(wilayahItems) },
    });
}

const DEFAULT_SURVEYOR_PASSWORD = "12345";
const USERNAME_REGEX = /^[a-zA-Z0-9._]+$/;

export async function createSurveyor(req, res) {
    const nama = clean(req.body.nama);
    const usernameRaw = clean(req.body.username);
    const wilayahTugasRaw = clean(req.body.wilayahTugas);
    const nomorHp = clean(req.body.nomorHp);

    if (!nama) {
        return error(res, "Nama lengkap wajib diisi", 400);
    }
    if (!usernameRaw) {
        return error(res, "Username login wajib diisi", 400);
    }

    const username = usernameRaw.toLowerCase();
    if (!USERNAME_REGEX.test(username)) {
        return error(res, "Username hanya boleh huruf, angka, titik, dan underscore (tanpa spasi)", 400);
    }

    let kabupatenKota = null;
    let wilayahTugas = null;
    if (wilayahTugasRaw) {
        kabupatenKota = resolveKabupatenKota(wilayahTugasRaw);
        if (!kabupatenKota) {
            return error(res, `Wilayah tugas "${wilayahTugasRaw}" tidak dikenali`, 400);
        }
        wilayahTugas = mapKabupatenLabel(kabupatenKota);
    }

    const hashedPassword = await hashPassword(DEFAULT_SURVEYOR_PASSWORD);

    const surveyor = await prisma.user.create({
        data: {
            nama,
            username,
            wilayahTugas,
            kabupatenKota,
            nomorHp,
            password: hashedPassword,
            role: "ENUMERATOR",
        },
    });

    return success(
        res,
        {
            id: surveyor.id,
            nama: surveyor.nama,
            username: surveyor.username,
            wilayahTugas: surveyor.wilayahTugas,
            kabupatenKota: surveyor.kabupatenKota,
            nomorHp: surveyor.nomorHp,
            aktif: surveyor.aktif,
        },
        `Surveyor berhasil didaftarkan (password default: ${DEFAULT_SURVEYOR_PASSWORD})`,
        201
    );
}

export async function listSurveyor(req, res) {
    const { search } = req.query;

    const where = { role: "ENUMERATOR" };
    if (search) {
        where.OR = [
            { nama: { contains: search } },
            { username: { contains: search } },
        ];
    }

    const surveyors = await prisma.user.findMany({
        where,
        select: {
            id: true,
            nama: true,
            username: true,
            wilayahTugas: true,
            nomorHp: true,
            aktif: true,
        },
        orderBy: { nama: "asc" },
    });

    const ids = surveyors.map((s) => s.id);
    const counts = ids.length
        ? await prisma.warga.groupBy({
            by: ["diwawancaraOlehId"],
            where: { diwawancaraOlehId: { in: ids } },
            _count: { _all: true },
        })
        : [];
    const countMap = Object.fromEntries(counts.map((c) => [c.diwawancaraOlehId, c._count._all]));

    const items = surveyors.map((s) => ({
        id: s.id,
        nama: s.nama,
        username: s.username,
        inisial: getInitials(s.nama),
        wilayahTugas: s.wilayahTugas,
        nomorHp: s.nomorHp,
        aktif: s.aktif,
        statusLabel: s.aktif ? "Aktif" : "Nonaktif",
        totalSurvei: countMap[s.id] || 0,
    }));

    return success(res, {
        items,
        total: items.length,
    });
}