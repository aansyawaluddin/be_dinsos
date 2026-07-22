import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import {
    getInitials,
    hitungUsia,
    formatRtRw,
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

export async function getInstrumen(req, res) {
    const bloks = await prisma.blokWawancara.findMany({
        orderBy: { urutan: "asc" },
        include: {
            pertanyaan: {
                orderBy: { urutan: "asc" },
                include: {
                    opsi: { orderBy: { urutan: "asc" } },
                },
            },
        },
    });

    const data = bloks.map((blok) => ({
        kode: blok.kode,
        judul: blok.judul,
        pertanyaan: blok.pertanyaan.map((p) => ({
            id: p.id,
            kode: p.kode,
            variabel: p.variabel,
            jenis: p.jenis,
            wajib: p.wajib,
            aturan: p.aturan,
            opsi: p.opsi.map((o) => ({ kode: o.kode, label: o.label })),
        })),
    }));

    return success(res, { blok: data });
}

export async function submitWawancara(req, res) {
    const surveyorId = req.user.id;
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID warga tidak valid", 400);
    }

    if (!req.file) {
        return error(res, "Foto dokumentasi wajib diupload", 400);
    }

    let jawaban;
    try {
        jawaban = typeof req.body.jawaban === "string" ? JSON.parse(req.body.jawaban) : req.body.jawaban;
    } catch (err) {
        fs.unlink(req.file.path, () => { });
        return error(res, 'Field "jawaban" harus berupa JSON string yang valid', 400);
    }

    if (!jawaban || typeof jawaban !== "object" || Array.isArray(jawaban)) {
        fs.unlink(req.file.path, () => { });
        return error(res, "Jawaban wawancara wajib diisi", 400);
    }

    const { latitude, longitude } = req.body;

    const [surveyor, warga] = await Promise.all([
        getSurveyorRegion(surveyorId),
        prisma.warga.findUnique({ where: { id } }),
    ]);

    if (!warga) {
        fs.unlink(req.file.path, () => { });
        return error(res, "Data warga tidak ditemukan", 404);
    }
    if (!surveyor?.kabupatenKota || warga.kabupatenKota !== surveyor.kabupatenKota) {
        fs.unlink(req.file.path, () => { });
        return error(res, "Warga ini di luar wilayah tugas Anda", 403);
    }

    const semuaPertanyaan = await prisma.pertanyaanWawancara.findMany({
        include: { opsi: true },
    });

    const errors = [];
    const jawabanValid = [];

    for (const soal of semuaPertanyaan) {
        const nilai = jawaban[soal.kode];
        const kosong =
            nilai === undefined ||
            nilai === null ||
            nilai === "" ||
            (Array.isArray(nilai) && nilai.length === 0);

        if (soal.wajib && kosong) {
            errors.push(`${soal.kode} (${soal.variabel}) wajib diisi`);
            continue;
        }
        if (kosong) continue;

        const nilaiArray = Array.isArray(nilai) ? nilai.map(String) : [String(nilai)];

        if (soal.jenis === "PILIHAN_TUNGGAL" && nilaiArray.length > 1) {
            errors.push(`${soal.kode}: cuma boleh pilih 1 jawaban`);
            continue;
        }

        const kodeOpsiValid = soal.opsi.map((o) => o.kode);
        const tidakValid = nilaiArray.filter((v) => !kodeOpsiValid.includes(v));
        if (tidakValid.length > 0) {
            errors.push(`${soal.kode}: pilihan tidak valid (${tidakValid.join(", ")})`);
            continue;
        }

        jawabanValid.push({
            pertanyaanId: soal.id,
            kodePertanyaan: soal.kode,
            opsiIds: soal.opsi.filter((o) => nilaiArray.includes(o.kode)).map((o) => o.id),
        });
    }

    if (errors.length > 0) {
        fs.unlink(req.file.path, () => { });
        return error(res, "Jawaban tidak valid", 400, errors);
    }

    await prisma.$transaction(async (tx) => {
        for (const jv of jawabanValid) {
            const existing = await tx.jawabanWawancara.findUnique({
                where: { wargaId_pertanyaanId: { wargaId: id, pertanyaanId: jv.pertanyaanId } },
            });

            const jawabanRecord = existing
                ? existing
                : await tx.jawabanWawancara.create({ data: { wargaId: id, pertanyaanId: jv.pertanyaanId } });

            if (existing) {
                await tx.jawabanOpsiDipilih.deleteMany({ where: { jawabanId: existing.id } });
            }

            await tx.jawabanOpsiDipilih.createMany({
                data: jv.opsiIds.map((opsiId) => ({ jawabanId: jawabanRecord.id, opsiId })),
            });
        }
    });

    const hasLatitude = latitude !== undefined && latitude !== null && latitude !== "";
    const hasLongitude = longitude !== undefined && longitude !== null && longitude !== "";
    const fotoPathBaru = `foto-wawancara/${req.file.filename}`;

    const updated = await prisma.warga.update({
        where: { id },
        data: {
            statusWawancara: "SUDAH_DIWAWANCARA",
            tanggalWawancara: new Date(),
            diwawancaraOlehId: surveyorId,
            fotoDokumentasi: fotoPathBaru,
            ...(hasLatitude ? { latitude: Number(latitude) } : {}),
            ...(hasLongitude ? { longitude: Number(longitude) } : {}),
        },
    });

    if (warga.fotoDokumentasi && warga.fotoDokumentasi !== fotoPathBaru) {
        const fotoLamaPath = path.join(process.cwd(), "uploads", warga.fotoDokumentasi);
        fs.unlink(fotoLamaPath, () => { });
    }

    return success(
        res,
        {
            id: updated.id,
            nama: updated.nama,
            statusWawancara: updated.statusWawancara,
            statusLabel: STATUS_LABEL[updated.statusWawancara],
            fotoDokumentasi: updated.fotoDokumentasi,
            latitude: updated.latitude,
            longitude: updated.longitude,
        },
        "Wawancara berhasil disimpan"
    );
}

export async function getHasilWawancara(req, res) {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID warga tidak valid", 400);
    }

    const [surveyor, warga] = await Promise.all([
        getSurveyorRegion(req.user.id),
        prisma.warga.findUnique({
            where: { id },
            select: { id: true, nik: true, nama: true, kabupatenKota: true, fotoDokumentasi: true },
        }),
    ]);

    if (!warga) {
        return error(res, "Data warga tidak ditemukan", 404);
    }
    if (!surveyor?.kabupatenKota || warga.kabupatenKota !== surveyor.kabupatenKota) {
        return error(res, "Warga ini di luar wilayah tugas Anda", 403);
    }

    const jawabanList = await prisma.jawabanWawancara.findMany({
        where: { wargaId: id },
        include: {
            pertanyaan: true,
            opsiDipilih: { include: { opsi: true } },
        },
        orderBy: { pertanyaan: { urutan: "asc" } },
    });

    const ringkasanJawaban = jawabanList.map((j) => ({
        kode: j.pertanyaan.kode,
        pertanyaan: j.pertanyaan.variabel,
        jawaban: j.opsiDipilih.map((od) => od.opsi.label).join(", "),
    }));

    return success(res, {
        nik: warga.nik,
        nama: warga.nama,
        foto: warga.fotoDokumentasi ? `/uploads/${warga.fotoDokumentasi}` : null,
        ringkasanJawaban,
    });
}