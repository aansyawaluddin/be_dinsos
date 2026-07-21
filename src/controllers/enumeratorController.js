import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import {
    getInitials,
    hitungUsia,
    formatRtRw,
    formatSkor,
    clean,
} from "../utils/wargaMapper.js";

const STATUS_LABEL = {
    SUDAH_DIWAWANCARA: "Selesai",
    BELUM_DIWAWANCARA: "Survei",
};

const STATUS_DETAIL_LABEL = {
    SUDAH_DIWAWANCARA: "Sudah Disurvei",
    BELUM_DIWAWANCARA: "Belum Disurvei",
};

const BULAN_INDONESIA = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function formatTanggalIndonesia(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getDate()} ${BULAN_INDONESIA[d.getMonth()]} ${d.getFullYear()}`;
}

async function getSurveyorRegion(userId) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: { nama: true, wilayahTugas: true, kabupatenKota: true },
    });
}

export async function getDashboard(req, res) {
    const surveyor = await getSurveyorRegion(req.user.id);

    if (!surveyor?.kabupatenKota) {
        return success(
            res,
            {
                nama: surveyor?.nama ?? null,
                wilayahTugas: null,
                tanggal: formatTanggalIndonesia(new Date()),
                progress: { totalTugas: 0, selesai: 0, belum: 0, persentase: 0 },
            },
            "Wilayah tugas belum diset, hubungi Admin Provinsi"
        );
    }

    const where = { kabupatenKota: surveyor.kabupatenKota };
    const [total, selesai] = await Promise.all([
        prisma.warga.count({ where }),
        prisma.warga.count({ where: { ...where, statusWawancara: "SUDAH_DIWAWANCARA" } }),
    ]);

    const belum = total - selesai;
    const persentase = total > 0 ? Math.round((selesai / total) * 100) : 0;

    return success(res, {
        nama: surveyor.nama,
        wilayahTugas: surveyor.wilayahTugas,
        tanggal: formatTanggalIndonesia(new Date()),
        progress: { totalTugas: total, selesai, belum, persentase },
    });
}

export async function listTugasWarga(req, res) {
    const surveyor = await getSurveyorRegion(req.user.id);
    if (!surveyor?.kabupatenKota) {
        return error(res, "Wilayah tugas belum diset, hubungi Admin Provinsi", 400);
    }

    const { search, status } = req.query;
    const where = { kabupatenKota: surveyor.kabupatenKota };
    if (status === "selesai") where.statusWawancara = "SUDAH_DIWAWANCARA";
    if (status === "belum") where.statusWawancara = "BELUM_DIWAWANCARA";
    if (search) {
        where.OR = [
            { nama: { contains: search } },
            { nik: { contains: search } },
        ];
    }

    const rows = await prisma.warga.findMany({
        where,
        select: {
            id: true,
            nik: true,
            nama: true,
            statusWawancara: true,
        },
        orderBy: { nama: "asc" },
    });

    const items = rows.map((w) => ({
        id: w.id,
        nik: w.nik,
        nama: w.nama,
        inisial: getInitials(w.nama),
        statusWawancara: w.statusWawancara,
        statusLabel: STATUS_LABEL[w.statusWawancara] ?? w.statusWawancara,
    }));

    return success(res, { items, total: items.length });
}

export async function getTugasWargaDetail(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID warga tidak valid", 400);
    }

    const [surveyor, warga] = await Promise.all([
        getSurveyorRegion(req.user.id),
        prisma.warga.findUnique({ where: { id } }),
    ]);

    if (!warga) {
        return error(res, "Data warga tidak ditemukan", 404);
    }
    if (!surveyor?.kabupatenKota || warga.kabupatenKota !== surveyor.kabupatenKota) {
        return error(res, "Warga ini di luar wilayah tugas Anda", 403);
    }

    return success(res, {
        id: warga.id,
        nik: warga.nik,
        nama: warga.nama,
        inisial: getInitials(warga.nama),
        kelurahan: warga.desaKelurahan,
        kecamatan: warga.kecamatan,
        alamat: warga.alamat,
        rtRw: formatRtRw(warga.rt, warga.rw),
        usia: hitungUsia(warga.tanggalLahir),
        statusWawancara: warga.statusWawancara,
        statusLabel: STATUS_DETAIL_LABEL[warga.statusWawancara] ?? warga.statusWawancara,
    });
}