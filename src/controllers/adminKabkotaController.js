import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import {
    mapKabupatenLabel,
    extractDesil,
    getInitials,
    hitungUsia,
    formatDesilLabel,
    formatRtRw,
    formatSkor,
} from "../utils/wargaMapper.js";

const STATUS_WAWANCARA_LABEL = {
    SUDAH_DIWAWANCARA: "Sudah Disurvei",
    BELUM_DIWAWANCARA: "Belum Disurvei",
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
        kelurahan: w.desaKelurahan,
        usia: hitungUsia(w.tanggalLahir),
        desilAwal: formatDesilLabel(w.desilTerbaru),
        statusWawancara: w.statusWawancara,
        statusLabel: STATUS_WAWANCARA_LABEL[w.statusWawancara] ?? w.statusWawancara,
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
        include: { diwawancaraOleh: { select: { nama: true } } },
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
        statusLabel: STATUS_WAWANCARA_LABEL[warga.statusWawancara] ?? warga.statusWawancara,
        klasifikasi: warga.klasifikasi,
        skorLabel: formatSkor(warga.skorSurvei, warga.skorMaksimal),
        surveyor: warga.diwawancaraOleh?.nama ?? null,
    });
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

    const sumJumlah = (items) => items.reduce((sum, item) => sum + item.jumlah, 0);

    return success(res, {
        desilAwal: { items: desilAwalItems, total: sumJumlah(desilAwalItems) },
        status: { items: statusItems, total: sumJumlah(statusItems) },
    });
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

    return success(res, { items, total: items.length });
}

export async function getSebaranWilayah(req, res) {
    const kabupatenKota = requireRegion(req, res);
    if (!kabupatenKota) return;

    const { statusWawancara, desil } = req.query;
    const whereGlobal = { kabupatenKota };

    const [totalResponden, sudahTersinkron, enumeratorAktif] = await Promise.all([
        prisma.warga.count({ where: whereGlobal }),
        prisma.warga.count({ where: { ...whereGlobal, statusWawancara: "SUDAH_DIWAWANCARA" } }),
        prisma.user.count({ where: { role: "ENUMERATOR", aktif: true, kabupatenKota } }),
    ]);

    const menungguSync = totalResponden - sudahTersinkron;
    const persentaseSinkron = totalResponden > 0 ? Math.round((sudahTersinkron / totalResponden) * 100) : 0;

    const wherePeta = {
        ...whereGlobal,
        latitude: { not: null },
        longitude: { not: null },
    };
    if (statusWawancara) wherePeta.statusWawancara = statusWawancara;

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