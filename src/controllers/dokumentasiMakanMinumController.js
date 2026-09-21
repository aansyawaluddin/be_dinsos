import fs from "fs";
import path from "path";
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import { dedupeEnumeratorByNama } from "../utils/uangMakan.js";

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");
const MIN_FOTO_DOKUMENTASI = 4;
const MAX_FOTO_DOKUMENTASI = 10;

const WITA_OFFSET_MS = 8 * 60 * 60 * 1000;
const BULAN_INDONESIA = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

function toTanggalWita(date) {
    return new Date(date.getTime() + WITA_OFFSET_MS);
}

function formatRentangTanggal(tanggalMulai, tanggalSelesai) {
    const mulai = toTanggalWita(new Date(tanggalMulai));
    const selesai = toTanggalWita(new Date(tanggalSelesai));

    const hariMulai = mulai.getUTCDate();
    const bulanMulai = BULAN_INDONESIA[mulai.getUTCMonth()];
    const hariSelesai = selesai.getUTCDate();
    const bulanSelesai = BULAN_INDONESIA[selesai.getUTCMonth()];

    return bulanMulai === bulanSelesai
        ? `${hariMulai} - ${hariSelesai} ${bulanSelesai}`
        : `${hariMulai} ${bulanMulai} - ${hariSelesai} ${bulanSelesai}`;
}

function unlinkSafe(filePath) {
    if (filePath) fs.unlink(filePath, () => { });
}

export async function listEnumerator(req, res) {
    const { search } = req.query;

    const where = { role: "ENUMERATOR", aktif: true };
    if (search) where.nama = { contains: search };

    const rows = await prisma.user.findMany({
        where,
        select: { id: true, nama: true },
        orderBy: [{ nama: "asc" }, { id: "asc" }],
    });

    return success(res, { items: dedupeEnumeratorByNama(rows) });
}

export async function listPeriode(req, res) {
    const rows = await prisma.periodeUangMakan.findMany({
        orderBy: { tanggalMulai: "asc" },
        select: { id: true, nama: true, tanggalMulai: true, tanggalSelesai: true },
    });

    const items = rows.map((p) => ({
        id: p.id,
        nama: p.nama,
        rentangTanggal: formatRentangTanggal(p.tanggalMulai, p.tanggalSelesai),
    }));

    return success(res, { items });
}

export async function cekStatusDokumentasi(req, res) {
    const enumeratorId = Number(req.query.enumeratorId);
    const periodeId = Number(req.query.periodeId);

    if (!Number.isInteger(enumeratorId) || enumeratorId <= 0 || !Number.isInteger(periodeId) || periodeId <= 0) {
        return error(res, "enumeratorId dan periodeId wajib diisi dengan benar", 400);
    }

    const bukti = await prisma.buktiUangMakan.findUnique({
        where: { periodeId_enumeratorId: { periodeId, enumeratorId } },
        include: { foto: { select: { id: true } } },
    });

    return success(res, {
        sudahUpload: Boolean(bukti),
        jumlahFoto: bukti?.foto.length ?? 0,
    });
}

export async function uploadDokumentasi(req, res) {
    const enumeratorId = Number(req.body.enumeratorId);
    const periodeId = Number(req.body.periodeId);
    const files = req.files || [];

    if (!Number.isInteger(enumeratorId) || enumeratorId <= 0) {
        return error(res, "Enumerator wajib dipilih", 400);
    }
    if (!Number.isInteger(periodeId) || periodeId <= 0) {
        return error(res, "Periode wajib dipilih", 400);
    }
    if (files.length < MIN_FOTO_DOKUMENTASI) {
        return error(res, `Minimal ${MIN_FOTO_DOKUMENTASI} foto wajib diupload`, 400);
    }
    if (files.length > MAX_FOTO_DOKUMENTASI) {
        return error(res, `Maksimal ${MAX_FOTO_DOKUMENTASI} foto per upload`, 400);
    }

    const [enumerator, periode] = await Promise.all([
        prisma.user.findFirst({ where: { id: enumeratorId, role: "ENUMERATOR", aktif: true } }),
        prisma.periodeUangMakan.findUnique({ where: { id: periodeId } }),
    ]);

    if (!enumerator) return error(res, "Data enumerator tidak ditemukan", 404);
    if (!periode) return error(res, "Periode tidak ditemukan", 404);

    const sudahAda = await prisma.buktiUangMakan.findUnique({
        where: { periodeId_enumeratorId: { periodeId, enumeratorId } },
    });
    if (sudahAda) {
        return error(res, "Dokumentasi untuk periode ini sudah pernah diupload sebelumnya", 400);
    }

    const folder = path.join(UPLOAD_ROOT, "uang-makan", String(periodeId), String(enumeratorId));
    fs.mkdirSync(folder, { recursive: true });

    const fileNames = [];
    for (const file of files) {
        const timestamp = Date.now();
        const random = Math.round(Math.random() * 1e6);
        const ext = path.extname(file.originalname) || ".jpg";
        const fileName = `makan_${timestamp}_${random}${ext}`;
        fs.writeFileSync(path.join(folder, fileName), file.buffer);
        fileNames.push(path.relative(UPLOAD_ROOT, path.join(folder, fileName)));
    }

    try {
        const bukti = await prisma.buktiUangMakan.create({
            data: {
                periodeId,
                enumeratorId,
                foto: { createMany: { data: fileNames.map((fn) => ({ fileName: fn })) } },
            },
            include: { foto: true },
        });

        return success(
            res,
            {
                id: bukti.id,
                enumerator: enumerator.nama,
                periode: periode.nama,
                jumlahFoto: bukti.foto.length,
                foto: bukti.foto.map((f) => ({ id: f.id, url: `/uploads/${f.fileName}` })),
            },
            "Dokumentasi berhasil diupload"
        );
    } catch (err) {
        fileNames.forEach((fn) => unlinkSafe(path.join(UPLOAD_ROOT, fn)));
        if (err.code === "P2002") {
            return error(res, "Dokumentasi untuk periode ini sudah pernah diupload sebelumnya", 400);
        }
        console.error("Error uploadDokumentasi:", err);
        return error(res, "Terjadi kesalahan sistem saat menyimpan dokumentasi", 500);
    }
}