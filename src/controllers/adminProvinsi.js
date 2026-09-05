import XLSX from "xlsx";
import ExcelJS from "exceljs"
import path from "path";
import fs from "fs";
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { hashPassword } from "../utils/hash.js";
import { buildRekapKehadiranWorkbook } from "../utils/rekapKehadiran.js";
import { FOTO_FIELDS_EXPORT, buildFotoUrl } from "../utils/exportFotoExcel.js";
import {
    mapKabupaten,
    mapKabupatenLabel,
    resolveKabupatenKota,
    resolveStatusValidasi,
    mapStatusValidasiLabel,
    mapJenisKelamin,
    mapJenisKelaminLabel,
    parseTanggalLahir,
    formatTanggalLahir,
    formatTanggalWawancara,
    statusBansos,
    extractDesil,
    getInitials,
    hitungUsia,
    hitungPersentase,
    formatDesilLabel,
    formatRtRw,
    formatSkor,
    clean,
} from "../utils/wargaMapper.js";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

function findHeaderRow(sheet, maxScan = 10) {
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    const lastRow = Math.min(maxScan, range.e.r);
    for (let r = 0; r <= lastRow; r++) {
        for (let c = range.s.c; c <= range.e.c; c++) {
            const cell = sheet[XLSX.utils.encode_cell({ r, c })];
            if (cell && String(cell.v).trim().toUpperCase() === "KABUPATEN") {
                return r;
            }
        }
    }
    return null;
}

function readAndMapRows(filePath) {
    const workbook = XLSX.readFile(filePath, { cellDates: true });

    const allRows = [];

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const headerRowIdx = findHeaderRow(sheet);

        if (headerRowIdx === null) {
            continue;
        }

        const rawRows = XLSX.utils.sheet_to_json(sheet, {
            defval: null,
            range: headerRowIdx,
        });

        rawRows.forEach((row, idx) => {
            const rowNumber = headerRowIdx + 2 + idx;
            const kabupatenLabel = clean(row["KABUPATEN"]);
            const kabupatenKota = resolveKabupatenKota(row["KABUPATEN"]);
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

            allRows.push({
                sheetName,
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
                    desilTerbaru: clean(row["desil_nasional"]),
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
            });
        });
    }

    return allRows;
}

async function analyzeRows(mappedRows) {
    const firstOccurrence = {};
    mappedRows.forEach((r) => {
        const nik = r.dbData.nik;
        if (nik && !firstOccurrence[nik]) {
            firstOccurrence[nik] = {
                rowNumber: r.rowNumber,
                nama: r.dbData.nama,
                kelDesa: r.dbData.desaKelurahan,
                kecamatan: r.dbData.kecamatan,
            };
        }
    });

    const nikCount = {};
    mappedRows.forEach((r) => {
        if (r.dbData.nik) nikCount[r.dbData.nik] = (nikCount[r.dbData.nik] || 0) + 1;
    });

    const niksInFile = [...new Set(mappedRows.map((r) => r.dbData.nik).filter(Boolean))];
    const existing = niksInFile.length
        ? await prisma.warga.findMany({
            where: { nik: { in: niksInFile } },
            select: { nik: true, nama: true, desaKelurahan: true, kecamatan: true },
        })
        : [];
    const existingMap = new Map(existing.map((w) => [w.nik, w]));

    let siapDiimpor = 0;
    let duplikatNik = 0;
    let nikKosong = 0;
    let tidakValid = 0;

    const preview = mappedRows.map((r, idx) => {
        const { rowNumber, dbData, kabupatenLabel, fieldErrors } = r;
        const isNikKosong = !dbData.nik;
        const isDuplicateInFile = dbData.nik ? nikCount[dbData.nik] > 1 : false;
        const existingDb = dbData.nik ? existingMap.get(dbData.nik) : null;
        const isDuplicateInDb = Boolean(existingDb);
        const isDuplicate = isDuplicateInFile || isDuplicateInDb;
        const hasFieldErrors = fieldErrors.length > 0;

        const bisaDiimpor = !isNikKosong && !isDuplicate && !hasFieldErrors;

        let status = "SIAP";
        let alasan = null;
        let duplikatDari = null;

        if (isNikKosong) {
            status = "NIK_KOSONG";
            alasan = "NIK kosong";
            nikKosong++;
        } else if (isDuplicate) {
            status = "DUPLIKAT";
            if (isDuplicateInDb) {
                alasan = "NIK sudah terdaftar di database";
                duplikatDari = {
                    sumber: "DATABASE",
                    nik: dbData.nik,
                    nama: existingDb.nama,
                    kelurahan: existingDb.desaKelurahan,
                    kecamatan: existingDb.kecamatan,
                };
            } else {
                alasan = "NIK duplikat dengan baris lain di file ini";
                const asal = firstOccurrence[dbData.nik];
                const iniBarisAsli = asal?.rowNumber === rowNumber;
                duplikatDari = iniBarisAsli
                    ? null
                    : {
                        sumber: "FILE",
                        baris: asal?.rowNumber,
                        nik: dbData.nik,
                        nama: asal?.nama,
                        kelurahan: asal?.kelDesa,
                        kecamatan: asal?.kecamatan,
                    };
            }
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
            sheet: r.sheetName,
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
            duplikatDari,
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

    const CHUNK_SIZE = 500;
    let berhasil = 0;
    const gagalImport = [];

    for (let i = 0; i < rowsToImport.length; i += CHUNK_SIZE) {
        const chunk = rowsToImport.slice(i, i + CHUNK_SIZE);
        const chunkData = chunk.map((r) => ({ ...r.dbData, createdById: req.user.id }));

        try {
            const result = await prisma.warga.createMany({ data: chunkData });
            berhasil += result.count;
        } catch (err) {
            // Ada baris di batch ini yang bentrok (misal NIK duplikat) -> fallback satu-satu cuma buat chunk ini
            for (const r of chunk) {
                try {
                    await prisma.warga.create({
                        data: { ...r.dbData, createdById: req.user.id },
                    });
                    berhasil++;
                } catch (rowErr) {
                    gagalImport.push({ rowNumber: r.rowNumber, reason: rowErr.message });
                }
            }
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

const STATUS_LABEL = {
    BELUM_DIWAWANCARA: "Belum Disurvei",
    SUDAH_DIWAWANCARA: "Menunggu Validasi",
    DISETUJUI: "Disetujui",
    DITOLAK: "Ditolak",
    TIDAK_DAPAT_DIWAWANCARA: "Tidak Dapat Diwawancara",
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
                kecamatan: true,
                desaKelurahan: true,
                tanggalLahir: true,
                desilTerbaru: true,
                statusWawancara: true,
                kendalaSurvei: {
                    orderBy: { createdAt: "desc" },
                    select: { id: true, keterangan: true, foto: true, createdAt: true },
                },
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
        kecamatan: w.kecamatan,
        kelurahan: w.desaKelurahan,
        usia: hitungUsia(w.tanggalLahir),
        desilAwal: formatDesilLabel(w.desilTerbaru),
        statusLabel: STATUS_LABEL[w.statusWawancara] ?? w.statusWawancara,
        kendalaTerakhir: w.kendalaSurvei[0]
            ? {
                id: w.kendalaSurvei[0].id,
                keterangan: w.kendalaSurvei[0].keterangan,
                foto: w.kendalaSurvei[0].foto ? `/uploads/${w.kendalaSurvei[0].foto}` : null,
                createdAt: w.kendalaSurvei[0].createdAt,
            }
            : null,
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
            kendalaSurvei: {
                orderBy: { createdAt: "asc" },
                include: { reportedBy: { select: { nama: true } } },
            },
        },
    });

    if (!warga) {
        return error(res, "Data warga tidak ditemukan", 404);
    }

    const kendalaTerakhir = warga.kendalaSurvei[warga.kendalaSurvei.length - 1];

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
        statusLabel: STATUS_LABEL[warga.statusWawancara] ?? warga.statusWawancara,
        keteranganValidasi: warga.keteranganValidasi,
        surveyor: warga.diwawancaraOleh?.nama ?? kendalaTerakhir?.reportedBy?.nama ?? null,
        kendalaSurvei: warga.kendalaSurvei.map((k) => ({
            id: k.id,
            keterangan: k.keterangan,
            foto: k.foto ? `/uploads/${k.foto}` : null,
            createdAt: k.createdAt,
        })),
    });
}

export async function getHasilWawancara(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID warga tidak valid", 400);
    }

    const warga = await prisma.warga.findUnique({
        where: { id },
        select: {
            id: true,
            nik: true,
            nama: true,
            kabupatenKota: true,
            fotoDokumentasi: true,
            fotoRumah: true,
            tandaTanganResponden: true,
            tandaTanganEnumerator: true,
            fotoKtp: true,
            fotoKk: true,
        },
    });

    if (!warga) {
        return error(res, "Data warga tidak ditemukan", 404);
    }

    const jawabanList = await prisma.jawabanWawancara.findMany({
        where: { wargaId: id },
        include: {
            pertanyaan: true,
            opsiDipilih: { include: { opsi: true } },
        },
        orderBy: [
            { pertanyaan: { blok: { urutan: "asc" } } },
            { pertanyaan: { urutan: "asc" } }
        ],
    });

    const ringkasanJawaban = jawabanList.map((j) => {
        const item = {
            kode: j.pertanyaan.kode,
            pertanyaan: j.pertanyaan.variabel,
            jawaban: j.opsiDipilih.length > 0
                ? j.opsiDipilih.map((od) => od.opsi.label).join(", ")
                : (j.nilaiTeks ?? "-"),
        };

        if (j.pertanyaan.kode === "A4a") {
            item.fotoKtp = warga.fotoKtp ? `/uploads/${warga.fotoKtp}` : null;
            item.fotoKk = warga.fotoKk ? `/uploads/${warga.fotoKk}` : null;
        }

        return item;
    });

    return success(res, {
        nik: warga.nik,
        nama: warga.nama,
        kabupatenKota: mapKabupatenLabel(warga.kabupatenKota),
        foto: warga.fotoDokumentasi ? `/uploads/${warga.fotoDokumentasi}` : null,
        fotoRumah: warga.fotoRumah ? `/uploads/${warga.fotoRumah}` : null,
        tandaTanganResponden: warga.tandaTanganResponden ? `/uploads/${warga.tandaTanganResponden}` : null,
        tandaTanganEnumerator: warga.tandaTanganEnumerator ? `/uploads/${warga.tandaTanganEnumerator}` : null,
        ringkasanJawaban,
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

    const desilMap = new Map();
    groupedDesil.forEach((g) => {
        const urutan = extractDesil(g.desilTerbaru) ?? 999;
        const label = formatDesilLabel(g.desilTerbaru) ?? g.desilTerbaru;
        const existing = desilMap.get(urutan);
        if (existing) {
            existing.jumlah += g._count._all;
        } else {
            desilMap.set(urutan, { label, urutan, jumlah: g._count._all });
        }
    });

    const desilAwalItems = [...desilMap.values()]
        .sort((a, b) => a.urutan - b.urutan)
        .map(({ label, jumlah }) => ({ label, jumlah }));

    const statusCountMap = Object.fromEntries(groupedStatus.map((g) => [g.statusWawancara, g._count._all]));
    const statusItems = [
        { label: "Belum Disurvei", jumlah: statusCountMap.BELUM_DIWAWANCARA || 0 },
        { label: "Sudah Disurvei", jumlah: statusCountMap.SUDAH_DIWAWANCARA || 0 },
        { label: "Disetujui", jumlah: statusCountMap.DISETUJUI || 0 },
        { label: "Ditolak", jumlah: statusCountMap.DITOLAK || 0 },
        { label: "Tidak Dapat Diwawancara", jumlah: statusCountMap.TIDAK_DAPAT_DIWAWANCARA || 0 },
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
const DEFAULT_ADMIN_PASSWORD = "12345";

export async function createAdminKabKota(req, res) {
    const nama = clean(req.body.nama);
    const usernameRaw = clean(req.body.username);
    const kabupatenKotaRaw = clean(req.body.kabupatenKota);
    const nomorHp = clean(req.body.nomorHp);

    if (!nama) {
        return error(res, "Nama lengkap wajib diisi", 400);
    }
    if (!usernameRaw) {
        return error(res, "Username login wajib diisi", 400);
    }
    if (!kabupatenKotaRaw) {
        return error(res, "Kabupaten/Kota wajib diisi", 400);
    }

    const username = usernameRaw.toLowerCase();
    if (!USERNAME_REGEX.test(username)) {
        return error(res, "Username hanya boleh huruf, angka, titik, dan underscore (tanpa spasi)", 400);
    }

    const kabupatenKota = resolveKabupatenKota(kabupatenKotaRaw);
    if (!kabupatenKota) {
        return error(res, `Kabupaten/Kota "${kabupatenKotaRaw}" tidak dikenali`, 400);
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
        return error(res, "Username sudah digunakan, silakan pilih yang lain", 400);
    }

    const existingAdmin = await prisma.user.findFirst({
        where: {
            role: "ADMIN_KABKOTA",
            kabupatenKota: kabupatenKota,
        },
    });

    if (existingAdmin) {
        return error(res, `Wilayah ${mapKabupatenLabel(kabupatenKota) || kabupatenKota} sudah memiliki Admin Kab/Kota, pendaftaran dibatalkan.`, 400);
    }

    const hashedPassword = await hashPassword(DEFAULT_ADMIN_PASSWORD);

    const admin = await prisma.user.create({
        data: {
            nama,
            username,
            kabupatenKota,
            nomorHp,
            password: hashedPassword,
            role: "ADMIN_KABKOTA",
        },
    });

    return success(
        res,
        {
            id: admin.id,
            nama: admin.nama,
            username: admin.username,
            kabupatenKota: mapKabupatenLabel(admin.kabupatenKota),
            nomorHp: admin.nomorHp,
            aktif: admin.aktif,
        },
        `Admin Kab/Kota berhasil didaftarkan (password default: ${DEFAULT_ADMIN_PASSWORD})`,
        201
    );
}
export async function listAdminKabKota(req, res) {
    const { search } = req.query;

    const where = { role: "ADMIN_KABKOTA" };
    if (search) {
        where.OR = [
            { nama: { contains: search } },
            { username: { contains: search } },
        ];
    }

    const admins = await prisma.user.findMany({
        where,
        select: {
            id: true,
            nama: true,
            username: true,
            kabupatenKota: true,
            nomorHp: true,
            aktif: true,
            fotoProfil: true,
        },
        orderBy: { nama: "asc" },
    });

    const items = admins.map((a) => ({
        id: a.id,
        nama: a.nama,
        username: a.username,
        inisial: getInitials(a.nama),
        fotoProfil: a.fotoProfil ? `/uploads/${a.fotoProfil}` : null,
        kabupatenKota: a.kabupatenKota,
        kabupatenKotaLabel: mapKabupatenLabel(a.kabupatenKota),
        nomorHp: a.nomorHp,
        aktif: a.aktif,
        statusLabel: a.aktif ? "Aktif" : "Nonaktif",
    }));

    return success(res, {
        items,
        total: items.length,
    });
}

export async function setAdminKabKotaStatus(req, res) {
    const id = Number(req.params.id);
    const { aktif } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID admin tidak valid", 400);
    }
    if (typeof aktif !== "boolean") {
        return error(res, "Field aktif wajib diisi (true/false)", 400);
    }

    const admin = await prisma.user.findUnique({ where: { id } });
    if (!admin || admin.role !== "ADMIN_KABKOTA") {
        return error(res, "Admin Kab/Kota tidak ditemukan", 404);
    }

    const updated = await prisma.user.update({
        where: { id },
        data: { aktif },
    });

    return success(
        res,
        { id: updated.id, aktif: updated.aktif, statusLabel: updated.aktif ? "Aktif" : "Nonaktif" },
        updated.aktif ? "Admin Kab/Kota diaktifkan" : "Admin Kab/Kota dinonaktifkan"
    );
}

const DEFAULT_SURVEYOR_PASSWORD = "12345";
const USERNAME_REGEX = /^[a-zA-Z0-9._]+$/;

export async function createSurveyor(req, res) {
    const nama = clean(req.body.nama);
    const usernameRaw = clean(req.body.username);
    const kecamatanTugas = clean(req.body.kecamatanTugas);
    const kelurahanTugas = clean(req.body.kelurahanTugas);
    const kabupatenKotaRaw = clean(req.body.kabupatenKota);
    const nomorHp = clean(req.body.nomorHp);

    if (!nama) {
        return error(res, "Nama lengkap wajib diisi", 400);
    }
    if (!usernameRaw) {
        return error(res, "Username login wajib diisi", 400);
    }
    if (!kecamatanTugas) {
        return error(res, "Kecamatan tugas wajib diisi", 400);
    }
    if (!kelurahanTugas) {
        return error(res, "Kelurahan tugas wajib diisi", 400);
    }
    if (!kabupatenKotaRaw) {
        return error(res, "Kabupaten/Kota wajib diisi", 400);
    }

    const username = usernameRaw.toLowerCase();
    if (!USERNAME_REGEX.test(username)) {
        return error(res, "Username hanya boleh huruf, angka, titik, dan underscore (tanpa spasi)", 400);
    }

    const kabupatenKota = resolveKabupatenKota(kabupatenKotaRaw);
    if (!kabupatenKota) {
        return error(res, `Kabupaten/Kota "${kabupatenKotaRaw}" tidak dikenali`, 400);
    }

    const hashedPassword = await hashPassword(DEFAULT_SURVEYOR_PASSWORD);

    const surveyor = await prisma.user.create({
        data: {
            nama,
            username,
            kecamatanTugas,
            kelurahanTugas,
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
            kecamatanTugas: surveyor.kecamatanTugas,
            kelurahanTugas: surveyor.kelurahanTugas,
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
            kecamatanTugas: true,
            kelurahanTugas: true,
            kabupatenKota: true,
            nomorHp: true,
            aktif: true,
            fotoProfil: true,
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

    const wilayahCombos = [];
    const seenWilayah = new Set();
    for (const s of surveyors) {
        if (!s.kabupatenKota || !s.kecamatanTugas || !s.kelurahanTugas) continue;
        const key = `${s.kabupatenKota}|${s.kecamatanTugas}|${s.kelurahanTugas}`;
        if (seenWilayah.has(key)) continue;
        seenWilayah.add(key);
        wilayahCombos.push({
            kabupatenKota: s.kabupatenKota,
            kecamatan: s.kecamatanTugas,
            desaKelurahan: s.kelurahanTugas,
        });
    }
    const wargaTugasGroups = wilayahCombos.length
        ? await prisma.warga.groupBy({
            by: ["kabupatenKota", "kecamatan", "desaKelurahan", "statusWawancara"],
            where: { OR: wilayahCombos },
            _count: { _all: true },
        })
        : [];
    const wargaTugasStatusMap = new Map();
    for (const g of wargaTugasGroups) {
        const key = `${g.kabupatenKota}|${g.kecamatan}|${g.desaKelurahan}`;
        if (!wargaTugasStatusMap.has(key)) wargaTugasStatusMap.set(key, {});
        wargaTugasStatusMap.get(key)[g.statusWawancara] = g._count._all;
    }

    const items = surveyors.map((s) => {
        const wilayahKey =
            s.kabupatenKota && s.kecamatanTugas && s.kelurahanTugas
                ? `${s.kabupatenKota}|${s.kecamatanTugas}|${s.kelurahanTugas}`
                : null;
        const statusCounts = (wilayahKey && wargaTugasStatusMap.get(wilayahKey)) || {};
        const totalWargaTugas = Object.values(statusCounts).reduce((a, b) => a + b, 0);

        return {
            id: s.id,
            nama: s.nama,
            username: s.username,
            inisial: getInitials(s.nama),
            fotoProfil: s.fotoProfil ? `/uploads/${s.fotoProfil}` : null,
            kecamatanTugas: s.kecamatanTugas,
            kelurahanTugas: s.kelurahanTugas,
            kabupatenKota: s.kabupatenKota,
            nomorHp: s.nomorHp,
            aktif: s.aktif,
            statusLabel: s.aktif ? "Aktif" : "Nonaktif",
            totalSurvei: countMap[s.id] || 0,
            totalWargaTugas,
            statusWargaTugas: {
                disetujui: statusCounts.DISETUJUI || 0,
                menungguValidasi: statusCounts.SUDAH_DIWAWANCARA || 0,
                ditolak: statusCounts.DITOLAK || 0,
                kendala: statusCounts.TIDAK_DAPAT_DIWAWANCARA || 0,
            },
        };
    });

    return success(res, {
        items,
        total: items.length,
    });
}

export async function setSurveyorStatus(req, res) {
    const id = Number(req.params.id);
    const { aktif } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID surveyor tidak valid", 400);
    }
    if (typeof aktif !== "boolean") {
        return error(res, "Field aktif wajib diisi (true/false)", 400);
    }

    const surveyor = await prisma.user.findUnique({ where: { id } });
    if (!surveyor || surveyor.role !== "ENUMERATOR") {
        return error(res, "Surveyor tidak ditemukan", 404);
    }

    const updated = await prisma.user.update({
        where: { id },
        data: { aktif },
    });

    return success(
        res,
        { id: updated.id, aktif: updated.aktif, statusLabel: updated.aktif ? "Aktif" : "Nonaktif" },
        updated.aktif ? "Surveyor diaktifkan" : "Surveyor dinonaktifkan"
    );
}

export async function deleteSurveyor(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID surveyor tidak valid", 400);
    }

    const surveyor = await prisma.user.findUnique({ where: { id } });
    if (!surveyor || surveyor.role !== "ENUMERATOR") {
        return error(res, "Surveyor tidak ditemukan", 404);
    }

    const jumlahWawancara = await prisma.warga.count({ where: { diwawancaraOlehId: id } });
    if (jumlahWawancara > 0) {
        return error(
            res,
            `Surveyor ini sudah mewawancarai ${jumlahWawancara} warga, tidak bisa dihapus. Nonaktifkan saja kalau sudah tidak bertugas.`,
            409
        );
    }

    await prisma.user.delete({ where: { id } });

    return success(res, null, "Surveyor berhasil dihapus");
}

export async function getSebaranWilayah(req, res) {
    const { kabupatenKota, desil } = req.query;

    const whereGlobal = {};
    if (kabupatenKota) whereGlobal.kabupatenKota = kabupatenKota;

    const uniqueKabKota = await prisma.warga.findMany({
        where: whereGlobal,
        distinct: ['kabupatenKota'],
        select: { kabupatenKota: true },
    });
    const totalKabupatenKotaDinamis = uniqueKabKota.length;

    const [totalResponden, sudahTersinkron, enumeratorAktif] = await Promise.all([
        prisma.warga.count({ where: whereGlobal }),
        prisma.warga.count({ where: { ...whereGlobal, statusWawancara: "DISETUJUI" } }),
        prisma.user.count({
            where: { role: "ENUMERATOR", aktif: true, ...(kabupatenKota ? { kabupatenKota } : {}) },
        }),
    ]);

    const menungguSync = totalResponden - sudahTersinkron;
    const persentaseSinkron = hitungPersentase(sudahTersinkron, totalResponden);

    const wherePeta = {
        ...whereGlobal,
        latitude: { not: null },
        longitude: { not: null },
        statusWawancara: "DISETUJUI",
    };

    let rows = await prisma.warga.findMany({
        where: wherePeta,
        select: {
            id: true,
            nama: true,
            latitude: true,
            longitude: true,
            kabupatenKota: true,
            desilTerbaru: true,
            statusWawancara: true,
        },
    });

    const desilFilter = desil ? extractDesil(desil) : null;
    if (desilFilter) {
        rows = rows.filter((w) => extractDesil(w.desilTerbaru) === desilFilter);
    }

    const peta = rows.map((w) => ({
        id: w.id,
        nama: w.nama,
        latitude: w.latitude,
        longitude: w.longitude,
        kabupatenKota: mapKabupatenLabel(w.kabupatenKota),
        desil: extractDesil(w.desilTerbaru),
        desilLabel: formatDesilLabel(w.desilTerbaru),
        statusWawancara: w.statusWawancara,
    }));

    return success(res, {
        ringkasan: {
            totalResponden,
            totalKabupatenKota: totalKabupatenKotaDinamis,
            sudahTersinkron,
            persentaseSinkron,
            menungguSync,
            enumeratorAktif,
        },
        peta,
    });
}

async function* iterDataSurveiRows(whereWarga, batchSize = 300) {
    let cursorId;
    while (true) {
        const batch = await prisma.warga.findMany({
            where: whereWarga,
            select: {
                id: true,
                nik: true,
                nama: true,
                kabupatenKota: true,
                statusWawancara: true,
                tanggalWawancara: true,
                diwawancaraOleh: { select: { nama: true } },
                jawabanWawancara: {
                    select: {
                        nilaiTeks: true,
                        pertanyaan: { select: { kode: true } },
                        opsiDipilih: { select: { opsi: { select: { label: true } } } },
                    },
                },
                fotoDokumentasi: true,
                fotoRumah: true,
                fotoKtp: true,
                fotoKk: true,
                tandaTanganResponden: true,
                tandaTanganEnumerator: true,
            },
            orderBy: [{ tanggalWawancara: "asc" }, { id: "asc" }],
            ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
            take: batchSize,
        });

        if (batch.length === 0) return;

        for (const w of batch) {
            const jawabanMap = {};
            w.jawabanWawancara.forEach((j) => {
                jawabanMap[j.pertanyaan.kode] = j.opsiDipilih.length > 0
                    ? j.opsiDipilih.map((od) => od.opsi.label).join(", ")
                    : (j.nilaiTeks ?? "-");
            });
            yield {
                nik: w.nik,
                nama: w.nama,
                kabupatenKota: mapKabupatenLabel(w.kabupatenKota) ?? w.kabupatenKota,
                statusWawancara: w.statusWawancara,
                namaEnumerator: w.diwawancaraOleh?.nama ?? "-",
                tanggalWawancara: formatTanggalWawancara(w.tanggalWawancara) ?? "-",
                jawabanMap,
                fotoPaths: {
                    fotoDokumentasi: w.fotoDokumentasi,
                    fotoRumah: w.fotoRumah,
                    fotoKtp: w.fotoKtp,
                    fotoKk: w.fotoKk,
                    tandaTanganResponden: w.tandaTanganResponden,
                    tandaTanganEnumerator: w.tandaTanganEnumerator,
                },
            };
        }

        cursorId = batch[batch.length - 1].id;
    }
}

const KABUPATEN_KOTA_URUTAN = [
    "KOTA_PALU", "DONGGALA", "SIGI", "PARIGI_MOUTONG", "POSO",
    "TOJO_UNA_UNA", "MOROWALI", "MOROWALI_UTARA", "BANGGAI",
    "BANGGAI_KEPULAUAN", "BANGGAI_LAUT", "BUOL", "TOLITOLI",
];

async function* iterSemuaKabupatenRows(whereDasar, batchSize = 300) {
    for (const kab of KABUPATEN_KOTA_URUTAN) {
        yield* iterDataSurveiRows({ ...whereDasar, kabupatenKota: kab }, batchSize);
    }
}

async function* sisipkanKembali(nilaiPertama, iteratorSisa) {
    yield nilaiPertama;
    yield* iteratorSisa;
}

const SEMUA_STATUS_ALIASES = ["semua", "semua status", "semua_status", "all"];
const TIDAK_DAPAT_ALIASES = ["tidak_dapat_diwawancara", "tidak dapat diwawancara", "kendala", "kendala survei"];
const STATUS_UNTUK_SEMUA = ["SUDAH_DIWAWANCARA", "DISETUJUI", "DITOLAK"];
const STATUS_LABEL_EXPORT = {
    SUDAH_DIWAWANCARA: "Menunggu Validasi",
    DISETUJUI: "Disetujui",
    DITOLAK: "Ditolak",
};

export async function exportExcel(req, res) {
    const waktuMulaiExport = new Date();

    const { kabupatenKota: kabupatenKotaRaw, statusWawancara: statusWawancaraRaw } = req.query;

    const rawStatusLower = statusWawancaraRaw ? String(statusWawancaraRaw).trim().toLowerCase() : null;

    const isSemuaStatus = rawStatusLower && SEMUA_STATUS_ALIASES.includes(rawStatusLower);
    const isTidakDapat = TIDAK_DAPAT_ALIASES.includes(rawStatusLower);

    let statusWawancara;
    if (isSemuaStatus) {
        statusWawancara = "SEMUA";
    } else if (isTidakDapat) {
        statusWawancara = "TIDAK_DAPAT_DIWAWANCARA";
    } else {
        statusWawancara = statusWawancaraRaw ? resolveStatusValidasi(statusWawancaraRaw) : "DISETUJUI";
        if (!statusWawancara) {
            return error(
                res,
                `Status "${statusWawancaraRaw}" tidak dikenali. Gunakan salah satu: Menunggu Validasi, Sudah Divalidasi, Ditolak, Tidak Dapat Diwawancara, atau Semua Status`,
                400
            );
        }
    }

    let kabupatenKota = null;
    if (kabupatenKotaRaw) {
        kabupatenKota = resolveKabupatenKota(kabupatenKotaRaw);
        if (!kabupatenKota) {
            return error(res, `Kabupaten/Kota "${kabupatenKotaRaw}" tidak dikenali`, 400);
        }
    }

    const whereDasar = {
        statusWawancara: isSemuaStatus ? { in: STATUS_UNTUK_SEMUA } : statusWawancara,
        createdAt: { lte: waktuMulaiExport },
    };

    const semuaPertanyaan = await prisma.pertanyaanWawancara.findMany({
        orderBy: [{ blok: { urutan: "asc" } }, { urutan: "asc" }],
        select: { kode: true, variabel: true },
    });

    const rowIterator = kabupatenKota
        ? iterDataSurveiRows({ ...whereDasar, kabupatenKota })
        : iterSemuaKabupatenRows(whereDasar);

    const first = await rowIterator.next();

    if (first.done) {
        const statusLabel = isSemuaStatus
            ? "Semua Status"
            : (STATUS_LABEL[statusWawancara] ?? mapStatusValidasiLabel(statusWawancara));
        return error(res, `Belum ada data warga dengan status "${statusLabel}" untuk wilayah ini`, 404);
    }

    const kolomMetaAwal = ["Nama Enumerator", "Tanggal Wawancara"];
    if (isSemuaStatus) kolomMetaAwal.push("Status");
    kolomMetaAwal.push("NIK", "Nama", "Kabupaten/Kota");
    const kolomFoto = FOTO_FIELDS_EXPORT.map((f) => f.label);
    const headers = [...kolomMetaAwal, ...kolomFoto, ...semuaPertanyaan.map((p) => `${p.kode} - ${p.variabel}`)];

    const statusSlug = isSemuaStatus ? "semua-status" : statusWawancara.toLowerCase();
    const namaFile = kabupatenKota
        ? `data-survei-${statusSlug}-${kabupatenKota}-${Date.now()}.xlsx`
        : `data-survei-${statusSlug}-semua-kabupaten-${Date.now()}.xlsx`;

    const semuaBaris = sisipkanKembali(first.value, rowIterator);

    const buatNilaiBaris = (r) => [
        r.namaEnumerator,
        r.tanggalWawancara,
        ...(isSemuaStatus ? [STATUS_LABEL_EXPORT[r.statusWawancara] ?? r.statusWawancara] : []),
        r.nik,
        r.nama,
        r.kabupatenKota,
        ...FOTO_FIELDS_EXPORT.map((f) => {
            const url = buildFotoUrl(req, r.fotoPaths?.[f.key]);
            return url ? { text: "Lihat Foto", hyperlink: url } : "-";
        }),
        ...semuaPertanyaan.map((p) => r.jawabanMap[p.kode] ?? "-"),
    ];

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${namaFile}"`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: true, useSharedStrings: false });
    const worksheet = workbook.addWorksheet("Data Survei");
    worksheet.columns = headers.map((h, i) => ({
        header: h,
        width: i < kolomMetaAwal.length ? 22 : i < kolomMetaAwal.length + kolomFoto.length ? 14 : 28,
    }));

    const kolomFotoMulai = kolomMetaAwal.length;
    const HYPERLINK_FONT = { color: { argb: "FF0563C1" }, underline: true };

    for await (const r of semuaBaris) {
        const nilaiBaris = buatNilaiBaris(r);
        const row = worksheet.addRow(nilaiBaris);
        for (let i = 0; i < kolomFoto.length; i++) {
            const nilaiSel = nilaiBaris[kolomFotoMulai + i];
            if (nilaiSel && typeof nilaiSel === "object" && nilaiSel.hyperlink) {
                row.getCell(kolomFotoMulai + i + 1).font = HYPERLINK_FONT;
            }
        }
        row.commit();
    }

    worksheet.commit();
    await workbook.commit();
}
export async function exportRekapKehadiran(req, res) {
    const { bulan, tahun, kabupatenKota } = req.query;

    const now = new Date();
    const bulanNum = bulan ? Number(bulan) : now.getMonth() + 1;
    const tahunNum = tahun ? Number(tahun) : now.getFullYear();

    if (!Number.isInteger(bulanNum) || bulanNum < 1 || bulanNum > 12) {
        return error(res, "Parameter bulan harus antara 1-12", 400);
    }
    if (!Number.isInteger(tahunNum) || tahunNum < 2000) {
        return error(res, "Parameter tahun tidak valid", 400);
    }

    let kabupatenKotaResolved = null;
    if (kabupatenKota) {
        kabupatenKotaResolved = resolveKabupatenKota(kabupatenKota);
        if (!kabupatenKotaResolved) {
            return error(res, `Kabupaten/Kota "${kabupatenKota}" tidak dikenali`, 400);
        }
    }

    const workbook = await buildRekapKehadiranWorkbook({
        bulan: bulanNum,
        tahun: tahunNum,
        kabupatenKota: kabupatenKotaResolved,
    });

    const buffer = await workbook.xlsx.writeBuffer();
    const namaFile = `rekap-kehadiran-${kabupatenKotaResolved || "semua-kabupaten"}-${tahunNum}-${String(bulanNum).padStart(2, "0")}-${Date.now()}.xlsx`;

    res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${namaFile}"`);
    return res.send(buffer);
}