import XLSX from "xlsx";
import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { hashPassword } from "../utils/hash.js";
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { buildRekapKehadiranWorkbook } from "../utils/rekapKehadiran.js";
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

const STATUS_LABEL = {
    BELUM_DIWAWANCARA: "Belum Disurvei",
    SUDAH_DIWAWANCARA: "Menunggu Validasi",
    DISETUJUI: "Disetujui",
    DITOLAK: "Ditolak",
    TIDAK_DAPAT_DIWAWANCARA: "Tidak Dapat Diwawancara",
};

function requireRegion(req, res) {
    if (!req.user.kabupatenKota) {
        error(res, "Akun Anda belum diset wilayahnya, hubungi Admin Provinsi", 400);
        return null;
    }
    return req.user.kabupatenKota;
}

export async function listWarga(req, res) {
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    const { page = 1, limit = 20, statusWawancara, search } = req.query;

    const where = { kabupatenKota };
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
                desaKelurahan: true,
                kecamatan: true,
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
        ringkasan: { total, sudahDisurvei, belumDisurvei },
        pagination: { page: Number(page), limit: Number(limit), total },
    });
}

export async function getWargaDetail(req, res) {
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID warga tidak valid", 400);
    }

    const warga = await prisma.warga.findUnique({
        where: { id },
        include: {
            diwawancaraOleh: { select: { nama: true } },
            kendalaSurvei: { orderBy: { createdAt: "asc" } },
        },
    });

    if (!warga) {
        return error(res, "Data warga tidak ditemukan", 404);
    }
    if (warga.kabupatenKota !== kabupatenKota) {
        return error(res, "Data warga ini di luar wilayah Anda", 403);
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
        statusLabel: STATUS_LABEL[warga.statusWawancara] ?? warga.statusWawancara,
        keteranganValidasi: warga.keteranganValidasi,
        surveyor: warga.diwawancaraOleh?.nama ?? null,
        kendalaSurvei: warga.kendalaSurvei.map((k) => ({
            id: k.id,
            keterangan: k.keterangan,
            foto: k.foto ? `/uploads/${k.foto}` : null,
            createdAt: k.createdAt,
        })),
    });
}

export async function getHasilWawancara(req, res) {
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

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
    if (warga.kabupatenKota !== kabupatenKota) {
        return error(res, "Warga ini di luar wilayah Anda", 403);
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
        foto: warga.fotoDokumentasi ? `/uploads/${warga.fotoDokumentasi}` : null,
        fotoRumah: warga.fotoRumah ? `/uploads/${warga.fotoRumah}` : null,
        tandaTanganResponden: warga.tandaTanganResponden ? `/uploads/${warga.tandaTanganResponden}` : null,
        tandaTanganEnumerator: warga.tandaTanganEnumerator ? `/uploads/${warga.tandaTanganEnumerator}` : null,
        ringkasanJawaban,
    });
}

export async function validasiWawancara(req, res) {
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    const id = Number(req.params.id);
    const { statusValidasi, keterangan } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID warga tidak valid", 400);
    }

    if (!["DISETUJUI", "DITOLAK"].includes(statusValidasi)) {
        return error(res, "Status validasi harus DISETUJUI atau DITOLAK", 400);
    }

    if (statusValidasi === "DITOLAK" && (!keterangan || keterangan.trim() === "")) {
        return error(res, "Keterangan/alasan penolakan wajib diisi", 400);
    }

    const warga = await prisma.warga.findUnique({ where: { id } });

    if (!warga) {
        return error(res, "Data warga tidak ditemukan", 404);
    }

    if (warga.kabupatenKota !== kabupatenKota) {
        return error(res, "Warga ini di luar wilayah tugas Anda", 403);
    }

    if (["BELUM_DIWAWANCARA", "TIDAK_DAPAT_DIWAWANCARA"].includes(warga.statusWawancara)) {
        return error(res, "Warga belum disurvei, tidak dapat divalidasi", 400);
    }

    const cleanKeterangan = keterangan ? clean(keterangan) : null;

    const updated = await prisma.warga.update({
        where: { id },
        data: {
            statusWawancara: statusValidasi,
            keteranganValidasi: statusValidasi === "DITOLAK" ? cleanKeterangan : null,
        },
    });

    return success(
        res,
        {
            id: updated.id,
            statusWawancara: updated.statusWawancara,
            statusLabel: STATUS_LABEL[updated.statusWawancara],
            keteranganValidasi: updated.keteranganValidasi,
        },
        `Wawancara berhasil ${statusValidasi === "DISETUJUI" ? "disetujui" : "ditolak"}`
    );
}

export async function getCharts(req, res) {
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    const whereRegional = { kabupatenKota };

    const [groupedDesil, groupedStatus] = await Promise.all([
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

    const sumJumlah = (items) => items.reduce((sum, item) => sum + item.jumlah, 0);

    return success(res, {
        desilAwal: { items: desilAwalItems, total: sumJumlah(desilAwalItems) },
        status: { items: statusItems, total: sumJumlah(statusItems) },
    });
}
const DEFAULT_SURVEYOR_PASSWORD = "12345";
const USERNAME_REGEX = /^[a-zA-Z0-9._]+$/;

export async function createSurveyor(req, res) {
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    const nama = clean(req.body.nama);
    const usernameRaw = clean(req.body.username);
    const kecamatanTugas = clean(req.body.kecamatanTugas);
    const kelurahanTugas = clean(req.body.kelurahanTugas);
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

    const username = usernameRaw.toLowerCase();
    if (!USERNAME_REGEX.test(username)) {
        return error(res, "Username hanya boleh huruf, angka, titik, dan underscore (tanpa spasi)", 400);
    }

    const existingUser = await prisma.user.findUnique({ where: { username } });
    if (existingUser) {
        return error(res, "Username sudah digunakan, silakan pilih yang lain", 400);
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
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    const { search } = req.query;

    const where = { role: "ENUMERATOR", kabupatenKota };
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

    return success(res, { items, total: items.length });
}

export async function resetPasswordSurveyor(req, res) {
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID surveyor tidak valid", 400);
    }

    const surveyor = await prisma.user.findUnique({ where: { id } });

    if (!surveyor || surveyor.role !== "ENUMERATOR") {
        return error(res, "Surveyor tidak ditemukan", 404);
    }

    if (surveyor.kabupatenKota !== kabupatenKota) {
        return error(res, "Surveyor ini di luar wilayah Anda", 403);
    }

    const hashedPassword = await hashPassword(DEFAULT_SURVEYOR_PASSWORD);

    await prisma.user.update({
        where: { id },
        data: {
            password: hashedPassword,
            tokenVersion: { increment: 1 },
        },
    });

    return success(
        res,
        { id: surveyor.id, nama: surveyor.nama, username: surveyor.username },
        `Password berhasil direset ke default (${DEFAULT_SURVEYOR_PASSWORD})`
    );
}

export async function getSebaranWilayah(req, res) {
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    const { desil } = req.query;
    const whereGlobal = { kabupatenKota };

    const [totalResponden, sudahTersinkron, enumeratorAktif] = await Promise.all([
        prisma.warga.count({ where: whereGlobal }),
        prisma.warga.count({ where: { ...whereGlobal, statusWawancara: "DISETUJUI" } }),
        prisma.user.count({ where: { role: "ENUMERATOR", aktif: true, kabupatenKota } }),
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
        desil: extractDesil(w.desilTerbaru),
        desilLabel: formatDesilLabel(w.desilTerbaru),
        statusWawancara: w.statusWawancara,
    }));

    return success(res, {
        ringkasan: {
            wilayah: mapKabupatenLabel(kabupatenKota),
            totalResponden,
            sudahTersinkron,
            persentaseSinkron,
            menungguSync,
            enumeratorAktif,
        },
        peta,
    });
}


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

function readAndMapRows(filePath, kabupatenKotaAdmin) {
    const workbook = XLSX.readFile(filePath, { cellDates: true });

    const allRows = [];

    for (const sheetName of workbook.SheetNames) {
        const sheet = workbook.Sheets[sheetName];
        const headerRowIdx = findHeaderRow(sheet);

        if (headerRowIdx === null) continue;

        const rawRows = XLSX.utils.sheet_to_json(sheet, {
            defval: null,
            range: headerRowIdx,
        });

        rawRows.forEach((row, idx) => {
            const rowNumber = headerRowIdx + 2 + idx;
            const kabupatenKotaExcel = resolveKabupatenKota(row["KABUPATEN"]);
            const kabupatenLabel = clean(row["KABUPATEN"]);
            const kecamatan = clean(row["KECAMATAN"]);
            const desaKelurahan = clean(row["DESA_KELURAHAN"]);
            const nomorKK = clean(row["nomor kartu keluarga"]);
            const nik = clean(row["nomor induk kependudukan"]);
            const nama = clean(row["nama"]);

            const fieldErrors = [];
            if (!kabupatenKotaExcel) {
                fieldErrors.push(`KABUPATEN "${row["KABUPATEN"] ?? ""}" tidak dikenali`);
            } else if (kabupatenKotaExcel !== kabupatenKotaAdmin) {
                fieldErrors.push(
                    `Baris ini untuk wilayah "${kabupatenLabel}", di luar wilayah Anda (${mapKabupatenLabel(kabupatenKotaAdmin)})`
                );
            }
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
                    kabupatenKota: kabupatenKotaAdmin,
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
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    if (!req.file) {
        return error(res, "File Excel wajib diupload (field: file)", 400);
    }

    let mappedRows;
    try {
        mappedRows = readAndMapRows(req.file.path, kabupatenKota);
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
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    const { uploadId } = req.params;
    const safeName = path.basename(uploadId || "");
    const filePath = path.join(UPLOAD_DIR, safeName);

    if (!safeName || !fs.existsSync(filePath)) {
        return error(res, "File upload tidak ditemukan atau sudah kedaluwarsa, silakan upload ulang", 404);
    }

    const mappedRows = readAndMapRows(filePath, kabupatenKota);
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

async function* iterDataSurveiRows(whereWarga, batchSize = 300) {
    let cursorId;
    while (true) {
        const batch = await prisma.warga.findMany({
            where: whereWarga,
            select: {
                id: true,
                nik: true,
                nama: true,
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
                statusWawancara: w.statusWawancara,
                namaEnumerator: w.diwawancaraOleh?.nama ?? "-",
                tanggalWawancara: formatTanggalWawancara(w.tanggalWawancara) ?? "-",
                jawabanMap,
            };
        }

        cursorId = batch[batch.length - 1].id;
    }
}

const SEMUA_STATUS_ALIASES = ["semua", "semua status", "semua_status", "all"];
const STATUS_UNTUK_SEMUA = ["SUDAH_DIWAWANCARA", "DISETUJUI", "DITOLAK"];
const STATUS_LABEL_EXPORT = {
    SUDAH_DIWAWANCARA: "Menunggu Validasi",
    DISETUJUI: "Disetujui",
    DITOLAK: "Ditolak",
};

export async function exportExcel(req, res) {
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    const waktuMulaiExport = new Date(); // kunci snapshot titik waktu export

    const { statusWawancara: statusWawancaraRaw } = req.query;
    const isSemuaStatus = statusWawancaraRaw && SEMUA_STATUS_ALIASES.includes(String(statusWawancaraRaw).trim().toLowerCase());

    let statusWawancara;
    if (isSemuaStatus) {
        statusWawancara = "SEMUA";
    } else {
        statusWawancara = statusWawancaraRaw ? resolveStatusValidasi(statusWawancaraRaw) : "DISETUJUI";
        if (!statusWawancara) {
            return error(
                res,
                `Status "${statusWawancaraRaw}" tidak dikenali. Gunakan salah satu: Menunggu Validasi, Sudah Divalidasi, Ditolak, atau Semua Status`,
                400
            );
        }
    }

    const whereWarga = {
        kabupatenKota,
        statusWawancara: isSemuaStatus ? { in: STATUS_UNTUK_SEMUA } : statusWawancara,
        createdAt: { lte: waktuMulaiExport }, // biar konsisten walau ada data baru masuk pas export jalan
    };

    const semuaPertanyaan = await prisma.pertanyaanWawancara.findMany({
        orderBy: [{ blok: { urutan: "asc" } }, { urutan: "asc" }],
        select: { kode: true, variabel: true },
    });

    const rowIterator = iterDataSurveiRows(whereWarga);
    const first = await rowIterator.next();

    if (first.done) {
        const statusLabel = isSemuaStatus ? "Semua Status" : mapStatusValidasiLabel(statusWawancara);
        return error(res, `Belum ada data warga dengan status "${statusLabel}" untuk wilayah ini`, 404);
    }

    const kolomMetaAwal = ["Nama Enumerator", "Tanggal Wawancara"];
    if (isSemuaStatus) kolomMetaAwal.push("Status");
    kolomMetaAwal.push("NIK", "Nama");
    const headers = [...kolomMetaAwal, ...semuaPertanyaan.map((p) => `${p.kode} - ${p.variabel}`)];

    const labelWilayah = mapKabupatenLabel(kabupatenKota) ?? kabupatenKota;
    const statusSlug = isSemuaStatus ? "semua-status" : statusWawancara.toLowerCase();

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="data-survei-${statusSlug}-${labelWilayah}-${Date.now()}.xlsx"`);

    const workbook = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: res, useStyles: false, useSharedStrings: false });
    const worksheet = workbook.addWorksheet("Data Survei");
    worksheet.columns = headers.map((h, i) => ({ header: h, width: i < kolomMetaAwal.length ? 22 : 28 }));

    const writeRow = (r) => {
        worksheet.addRow([
            r.namaEnumerator,
            r.tanggalWawancara,
            ...(isSemuaStatus ? [STATUS_LABEL_EXPORT[r.statusWawancara] ?? r.statusWawancara] : []),
            r.nik,
            r.nama,
            ...semuaPertanyaan.map((p) => r.jawabanMap[p.kode] ?? "-"),
        ]).commit();
    };

    writeRow(first.value);
    for await (const r of rowIterator) {
        writeRow(r);
    }

    worksheet.commit();
    await workbook.commit();
}

export async function exportRekapKehadiran(req, res) {
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    const { bulan, tahun } = req.query;

    const now = new Date();
    const bulanNum = bulan ? Number(bulan) : now.getMonth() + 1;
    const tahunNum = tahun ? Number(tahun) : now.getFullYear();

    if (!Number.isInteger(bulanNum) || bulanNum < 1 || bulanNum > 12) {
        return error(res, "Parameter bulan harus antara 1-12", 400);
    }
    if (!Number.isInteger(tahunNum) || tahunNum < 2000) {
        return error(res, "Parameter tahun tidak valid", 400);
    }

    const workbook = await buildRekapKehadiranWorkbook({ bulan: bulanNum, tahun: tahunNum, kabupatenKota });
    const buffer = await workbook.xlsx.writeBuffer();

    const labelWilayah = mapKabupatenLabel(kabupatenKota) ?? kabupatenKota;
    res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
        "Content-Disposition",
        `attachment; filename="rekap-kehadiran-${labelWilayah}-${tahunNum}-${String(bulanNum).padStart(2, "0")}-${Date.now()}.xlsx"`
    );
    return res.send(buffer);
}