import fs from "fs";
import path from "path";
import prisma from "../lib/prisma.js";
import { success, error } from "../utils/response.js";
import {
    getInitials,
    hitungUsia,
    formatRtRw,
    hitungPersentase,
    clean,
} from "../utils/wargaMapper.js";

const STATUS_LABEL = {
    BELUM_DIWAWANCARA: "Belum Disurvei",
    SUDAH_DIWAWANCARA: "Menunggu Validasi",
    DISETUJUI: "Disetujui",
    DITOLAK: "Ditolak",
};

const BULAN_INDONESIA = [
    "Januari", "Februari", "Maret", "April", "Mei", "Juni",
    "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

function formatTanggalIndonesia(date) {
    const d = date instanceof Date ? date : new Date(date);
    return `${d.getDate()} ${BULAN_INDONESIA[d.getMonth()]} ${d.getFullYear()}`;
}

async function getSurveyorRegion(userId) {
    return prisma.user.findUnique({
        where: { id: userId },
        select: {
            nama: true,
            kecamatanTugas: true,
            kabupatenKota: true,
            fotoProfil: true
        },
    });
}

function wilayahLengkap(surveyor) {
    return Boolean(surveyor?.kabupatenKota && surveyor?.kecamatanTugas);
}

function unlinkSafe(filePath) {
    if (filePath) fs.unlink(filePath, () => { });
}

export async function uploadFotoProfile(req, res) {
    const userId = req.user.id;
    const fotoFile = req.file;

    if (!fotoFile) {
        return error(res, "Foto profil wajib diupload", 400);
    }

    try {
        const userLama = await prisma.user.findUnique({
            where: { id: userId },
            select: { fotoProfil: true }
        });

        const fotoPathBaru = path.relative(UPLOAD_ROOT, fotoFile.path);

        const updated = await prisma.user.update({
            where: { id: userId },
            data: { fotoProfil: fotoPathBaru },
        });

        if (userLama?.fotoProfil && userLama.fotoProfil !== fotoPathBaru) {
            unlinkSafe(path.join(UPLOAD_ROOT, userLama.fotoProfil));
        }

        return success(
            res,
            { fotoProfil: updated.fotoProfil },
            "Foto profil berhasil diperbarui"
        );
    } catch (err) {
        unlinkSafe(fotoFile.path);
        return error(res, "Gagal memperbarui foto profil", 500);
    }
}

export async function getDashboard(req, res) {
    const surveyor = await getSurveyorRegion(req.user.id);

    const fotoProfilUrl = surveyor?.fotoProfil ? `/uploads/${surveyor.fotoProfil}` : null;

    if (!wilayahLengkap(surveyor)) {
        return success(
            res,
            {
                nama: surveyor?.nama ?? null,
                fotoProfil: fotoProfilUrl,
                kabupatenKota: surveyor?.kabupatenKota ?? null,
                kecamatanTugas: null,
                tanggal: formatTanggalIndonesia(new Date()),
                progress: { totalTugas: 0, selesai: 0, belum: 0, persentase: 0 },
            },
            "Wilayah tugas belum diset, hubungi Admin Provinsi"
        );
    }

    const where = {
        kabupatenKota: surveyor.kabupatenKota,
        kecamatan: surveyor.kecamatanTugas,
    };

    const [total, selesai] = await Promise.all([
        prisma.warga.count({ where }),
        prisma.warga.count({ where: { ...where, statusWawancara: "DISETUJUI" } }),
    ]);

    const belum = total - selesai;
    const persentase = hitungPersentase(selesai, total);

    return success(res, {
        nama: surveyor.nama,
        fotoProfil: fotoProfilUrl,
        kabupatenKota: surveyor.kabupatenKota,
        kecamatanTugas: surveyor.kecamatanTugas,
        tanggal: formatTanggalIndonesia(new Date()),
        progress: { totalTugas: total, selesai, belum, persentase },
    });
}

export async function createWargaBaru(req, res) {
    const surveyorId = req.user.id;

    const surveyor = await getSurveyorRegion(surveyorId);

    if (!wilayahLengkap(surveyor)) {
        return error(res, "Wilayah tugas belum diset, hubungi Admin Provinsi", 403);
    }

    const {
        desaKelurahan,
        alamat,
        rw,
        rt,
        desilTerbaru,
        nomorKK,
        nik,
        nama,
        jenisKelamin,
        tanggalLahir,
        tempatLahir,
        statusPerkawinan,
        hubunganKeluarga,
        keberadaanAnggotaKeluarga,
        disabilitas,
        keteranganDisabilitas,
        pbiJk,
        bansosPkh,
        bansosSembako
    } = req.body;

    if (!nik || !nomorKK || !nama || !desaKelurahan) {
        return error(res, "NIK, Nomor KK, Nama, dan Desa/Kelurahan wajib diisi", 400);
    }
    const existingWarga = await prisma.warga.findUnique({
        where: { nik }
    });

    if (existingWarga) {
        return error(res, "Data warga dengan NIK tersebut sudah terdaftar di sistem", 400);
    }

    try {
        const wargaBaru = await prisma.warga.create({
            data: {
                nik,
                nomorKK,
                nama,
                desaKelurahan,
                alamat: alamat || null,
                rt: rt ? String(rt) : null,
                rw: rw ? String(rw) : null,
                desilTerbaru: desilTerbaru || null,
                jenisKelamin: jenisKelamin || null,
                tanggalLahir: tanggalLahir ? new Date(tanggalLahir) : null,
                tempatLahir: tempatLahir || null,
                statusPerkawinan: statusPerkawinan || null,
                hubunganKeluarga: hubunganKeluarga || null,
                keberadaanAnggotaKeluarga: keberadaanAnggotaKeluarga || null,
                disabilitas: disabilitas || null,
                keteranganDisabilitas: keteranganDisabilitas || null,
                pbiJk: pbiJk || null,
                bansosPkh: bansosPkh || null,
                bansosSembako: bansosSembako || null,
                kabupatenKota: surveyor.kabupatenKota,
                kecamatan: surveyor.kecamatanTugas,

                createdById: surveyorId,
                statusWawancara: "BELUM_DIWAWANCARA"
            }
        });

        return success(
            res,
            {
                id: wargaBaru.id,
                nik: wargaBaru.nik,
                nama: wargaBaru.nama,
                desaKelurahan: wargaBaru.desaKelurahan
            },
            "Data warga baru berhasil ditambahkan ke daftar survei"
        );
    } catch (err) {
        console.error("Error createWargaBaru:", err);
        return error(res, "Terjadi kesalahan sistem saat menyimpan data", 500);
    }
}

export async function listTugasWarga(req, res) {
    const surveyor = await getSurveyorRegion(req.user.id);
    if (!wilayahLengkap(surveyor)) {
        return error(res, "Wilayah tugas belum diset, hubungi Admin Provinsi", 400);
    }

    const { search, status } = req.query;
    const where = {
        kabupatenKota: surveyor.kabupatenKota,
        kecamatan: surveyor.kecamatanTugas,
    };

    if (status === "selesai") {
        where.statusWawancara = {
            in: ["SUDAH_DIWAWANCARA", "DISETUJUI", "DITOLAK"]
        };
    }
    if (status === "belum") {
        where.statusWawancara = "BELUM_DIWAWANCARA";
    }

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
            kendalaSurvei: true,
            keteranganValidasi: true,
        },
        orderBy: { id: "asc" },
    });

    const items = rows.map((w) => ({
        id: w.id,
        nik: w.nik,
        nama: w.nama,
        inisial: getInitials(w.nama),
        kendalaSurvei: w.kendalaSurvei,
        statusLabel: STATUS_LABEL[w.statusWawancara] ?? w.statusWawancara,
        keteranganValidasi: w.keteranganValidasi,
    }));

    return success(res, { items, total: items.length });
}

export async function reportKendalaSurvei(req, res) {
    const surveyorId = req.user.id;
    const id = Number(req.params.id);
    const { kendalaSurvei } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID warga tidak valid", 400);
    }
    if (!kendalaSurvei || kendalaSurvei.trim() === "") {
        return error(res, "Keterangan kendala wajib diisi", 400);
    }

    const [surveyor, warga] = await Promise.all([
        getSurveyorRegion(surveyorId),
        prisma.warga.findUnique({ where: { id } }),
    ]);

    if (!warga) {
        return error(res, "Data warga tidak ditemukan", 404);
    }
    if (
        !wilayahLengkap(surveyor) ||
        warga.kabupatenKota !== surveyor.kabupatenKota ||
        warga.kecamatan !== surveyor.kecamatanTugas
    ) {
        return error(res, "Warga ini di luar wilayah tugas Anda", 403);
    }

    const updated = await prisma.warga.update({
        where: { id },
        data: {
            kendalaSurvei: kendalaSurvei.trim(),
        },
    });

    return success(
        res,
        {
            id: updated.id,
            nama: updated.nama,
            statusWawancara: updated.statusWawancara,
            kendalaSurvei: updated.kendalaSurvei,
        },
        "Kendala survei berhasil dilaporkan"
    );
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
    if (
        !wilayahLengkap(surveyor) ||
        warga.kabupatenKota !== surveyor.kabupatenKota ||
        warga.kecamatan !== surveyor.kecamatanTugas
    ) {
        return error(res, "Warga ini di luar wilayah tugas Anda", 403);
    }

    return success(res, {
        id: warga.id,
        kk: warga.nomorKK,
        nik: warga.nik,
        nama: warga.nama,
        inisial: getInitials(warga.nama),
        kelurahan: warga.desaKelurahan,
        kecamatan: warga.kecamatan,
        alamat: warga.alamat,
        rtRw: formatRtRw(warga.rt, warga.rw),
        usia: hitungUsia(warga.tanggalLahir),
        posisiDalamKeluarga: warga.hubunganKeluarga,
        kendalaSurvei: warga.kendalaSurvei,
        keteranganValidasi: warga.keteranganValidasi,
        statusLabel: STATUS_LABEL[warga.statusWawancara] ?? warga.statusWawancara,
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

    const PENJELASAN_KELOMPOK = {
        "I1": "Apa kebutuhan paling mendesak yang belum terpenuhi saat ini? (pilih maksimal 3, urutkan 1=paling mendesak)",
        "I2": "Seberapa mudah akses ke fasilitas berikut dari tempat tinggal Anda?"
    };

    const data = bloks.map((blok) => {
        const listData = [];
        let currentPrefix = "";

        blok.pertanyaan.forEach((p) => {
            const match = p.kode.match(/^[A-Z]\d+/);
            const prefix = match ? match[0] : p.kode;

            if (prefix !== currentPrefix) {
                currentPrefix = prefix;

                if (PENJELASAN_KELOMPOK[prefix]) {
                    listData.push({
                        tipe: "penjelasan",
                        kode: prefix,
                        teks: PENJELASAN_KELOMPOK[prefix],
                    });
                }
            }

            listData.push({
                tipe: "pertanyaan",
                id: p.id,
                kode: p.kode,
                variabel: p.variabel,
                jenis: p.jenis,
                wajib: p.wajib,
                aturan: p.aturan,
                opsi: p.opsi.map((o) => ({ kode: o.kode, label: o.label })),
            });
        });

        return {
            kode: blok.kode,
            judul: blok.judul,
            pertanyaan: listData,
        };
    });

    return success(res, { blok: data });
}

export async function submitWawancara(req, res) {
    const surveyorId = req.user.id;
    const id = Number(req.params.id);

    if (!Number.isInteger(id) || id <= 0) {
        return error(res, "ID warga tidak valid", 400);
    }

    const fotoFile = req.files?.foto?.[0];
    const fotoRumahFile = req.files?.fotoRumah?.[0];
    const ttdRespondenFile = req.files?.tandaTanganResponden?.[0];
    const ttdEnumeratorFile = req.files?.tandaTanganEnumerator?.[0];

    const semuaFileUploaded = [fotoFile, fotoRumahFile, ttdRespondenFile, ttdEnumeratorFile];
    function unlinkSemuaFile() {
        semuaFileUploaded.forEach((f) => unlinkSafe(f?.path));
    }

    if (!fotoFile) {
        unlinkSemuaFile();
        return error(res, "Foto dokumentasi wawancara wajib diupload", 400);
    }
    if (!fotoRumahFile) {
        unlinkSemuaFile();
        return error(res, "Foto rumah wajib diupload", 400);
    }
    if (!ttdRespondenFile) {
        unlinkSemuaFile();
        return error(res, "Tanda tangan responden wajib diupload", 400);
    }
    if (!ttdEnumeratorFile) {
        unlinkSemuaFile();
        return error(res, "Tanda tangan enumerator wajib diupload", 400);
    }

    let jawaban;
    try {
        jawaban = typeof req.body.jawaban === "string" ? JSON.parse(req.body.jawaban) : req.body.jawaban;
    } catch (err) {
        unlinkSemuaFile();
        return error(res, 'Field "jawaban" harus berupa JSON string yang valid', 400);
    }

    if (!jawaban || typeof jawaban !== "object" || Array.isArray(jawaban)) {
        unlinkSemuaFile();
        return error(res, "Jawaban wawancara wajib diisi", 400);
    }

    const { latitude, longitude } = req.body;

    const [surveyor, warga] = await Promise.all([
        getSurveyorRegion(surveyorId),
        prisma.warga.findUnique({ where: { id } }),
    ]);

    if (!warga) {
        unlinkSemuaFile();
        return error(res, "Data warga tidak ditemukan", 404);
    }
    if (
        !wilayahLengkap(surveyor) ||
        warga.kabupatenKota !== surveyor.kabupatenKota ||
        warga.kecamatan !== surveyor.kecamatanTugas
    ) {
        unlinkSemuaFile();
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

        if (soal.jenis === "TEKS" || soal.jenis === "ANGKA") {
            if (Array.isArray(nilai)) {
                errors.push(`${soal.kode}: harus berupa nilai tunggal, bukan daftar`);
                continue;
            }

            if (soal.jenis === "ANGKA") {
                const angka = Number(nilai);
                if (Number.isNaN(angka)) {
                    errors.push(`${soal.kode}: harus berupa angka yang valid`);
                    continue;
                }
                jawabanValid.push({
                    pertanyaanId: soal.id,
                    kodePertanyaan: soal.kode,
                    tipe: "NILAI",
                    nilaiTeks: String(angka),
                });
            } else {
                jawabanValid.push({
                    pertanyaanId: soal.id,
                    kodePertanyaan: soal.kode,
                    tipe: "NILAI",
                    nilaiTeks: String(nilai),
                });
            }
            continue;
        }

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
            tipe: "OPSI",
            opsiIds: soal.opsi.filter((o) => nilaiArray.includes(o.kode)).map((o) => o.id),
        });
    }

    if (errors.length > 0) {
        unlinkSemuaFile();
        return error(res, "Jawaban tidak valid", 400, errors);
    }

    await prisma.$transaction(async (tx) => {
        for (const jv of jawabanValid) {
            const existing = await tx.jawabanWawancara.findUnique({
                where: { wargaId_pertanyaanId: { wargaId: id, pertanyaanId: jv.pertanyaanId } },
            });

            if (jv.tipe === "NILAI") {
                if (existing) {
                    await tx.jawabanOpsiDipilih.deleteMany({ where: { jawabanId: existing.id } });
                    await tx.jawabanWawancara.update({
                        where: { id: existing.id },
                        data: { nilaiTeks: jv.nilaiTeks },
                    });
                } else {
                    await tx.jawabanWawancara.create({
                        data: { wargaId: id, pertanyaanId: jv.pertanyaanId, nilaiTeks: jv.nilaiTeks },
                    });
                }
                continue;
            }

            const jawabanRecord = existing
                ? existing
                : await tx.jawabanWawancara.create({ data: { wargaId: id, pertanyaanId: jv.pertanyaanId } });

            if (existing) {
                await tx.jawabanOpsiDipilih.deleteMany({ where: { jawabanId: existing.id } });
                if (existing.nilaiTeks !== null) {
                    await tx.jawabanWawancara.update({ where: { id: existing.id }, data: { nilaiTeks: null } });
                }
            }

            await tx.jawabanOpsiDipilih.createMany({
                data: jv.opsiIds.map((opsiId) => ({ jawabanId: jawabanRecord.id, opsiId })),
            });
        }
    });

    const hasLatitude = latitude !== undefined && latitude !== null && latitude !== "";
    const hasLongitude = longitude !== undefined && longitude !== null && longitude !== "";

    // Path relatif terhadap folder uploads/, otomatis "warga/{nik}/foto_....jpg" dsb
    const fotoPathBaru = path.relative(UPLOAD_ROOT, fotoFile.path);
    const fotoRumahPathBaru = path.relative(UPLOAD_ROOT, fotoRumahFile.path);
    const ttdRespondenPathBaru = path.relative(UPLOAD_ROOT, ttdRespondenFile.path);
    const ttdEnumeratorPathBaru = path.relative(UPLOAD_ROOT, ttdEnumeratorFile.path);

    const updated = await prisma.warga.update({
        where: { id },
        data: {
            statusWawancara: "SUDAH_DIWAWANCARA",
            tanggalWawancara: new Date(),
            diwawancaraOlehId: surveyorId,
            fotoDokumentasi: fotoPathBaru,
            fotoRumah: fotoRumahPathBaru,
            tandaTanganResponden: ttdRespondenPathBaru,
            tandaTanganEnumerator: ttdEnumeratorPathBaru,
            ...(hasLatitude ? { latitude: Number(latitude) } : {}),
            ...(hasLongitude ? { longitude: Number(longitude) } : {}),
        },
    });

    // Hapus file lama kalau diganti dengan yang baru
    if (warga.fotoDokumentasi && warga.fotoDokumentasi !== fotoPathBaru) {
        unlinkSafe(path.join(UPLOAD_ROOT, warga.fotoDokumentasi));
    }
    if (warga.fotoRumah && warga.fotoRumah !== fotoRumahPathBaru) {
        unlinkSafe(path.join(UPLOAD_ROOT, warga.fotoRumah));
    }
    if (warga.tandaTanganResponden && warga.tandaTanganResponden !== ttdRespondenPathBaru) {
        unlinkSafe(path.join(UPLOAD_ROOT, warga.tandaTanganResponden));
    }
    if (warga.tandaTanganEnumerator && warga.tandaTanganEnumerator !== ttdEnumeratorPathBaru) {
        unlinkSafe(path.join(UPLOAD_ROOT, warga.tandaTanganEnumerator));
    }

    return success(
        res,
        {
            id: updated.id,
            nama: updated.nama,
            statusWawancara: updated.statusWawancara,
            statusLabel: STATUS_LABEL[updated.statusWawancara],
            fotoDokumentasi: updated.fotoDokumentasi,
            fotoRumah: updated.fotoRumah,
            tandaTanganResponden: updated.tandaTanganResponden,
            tandaTanganEnumerator: updated.tandaTanganEnumerator,
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
            select: {
                id: true,
                nik: true,
                nama: true,
                kabupatenKota: true,
                kecamatan: true,
                fotoDokumentasi: true,
                fotoRumah: true,
                tandaTanganResponden: true,
                tandaTanganEnumerator: true,
            },
        }),
    ]);

    if (!warga) {
        return error(res, "Data warga tidak ditemukan", 404);
    }
    if (
        !wilayahLengkap(surveyor) ||
        warga.kabupatenKota !== surveyor.kabupatenKota ||
        warga.kecamatan !== surveyor.kecamatanTugas
    ) {
        return error(res, "Warga ini di luar wilayah tugas Anda", 403);
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

    const ringkasanJawaban = jawabanList.map((j) => ({
        kode: j.pertanyaan.kode,
        pertanyaan: j.pertanyaan.variabel,
        jawaban:
            j.opsiDipilih.length > 0
                ? j.opsiDipilih.map((od) => od.opsi.label).join(", ")
                : j.nilaiTeks ?? "-",
    }));

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