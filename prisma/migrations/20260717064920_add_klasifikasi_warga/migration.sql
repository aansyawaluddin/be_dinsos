-- CreateTable
CREATE TABLE `user` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `nama` VARCHAR(191) NOT NULL,
    `email` VARCHAR(191) NOT NULL,
    `password` VARCHAR(191) NOT NULL,
    `role` ENUM('ADMIN_PROVINSI', 'ADMIN_KABKOTA', 'ENUMERATOR') NOT NULL,
    `kabupatenKota` ENUM('KOTA_PALU', 'DONGGALA', 'SIGI', 'PARIGI_MOUTONG', 'POSO', 'TOJO_UNA_UNA', 'MOROWALI', 'MOROWALI_UTARA', 'BANGGAI', 'BANGGAI_KEPULAUAN', 'BANGGAI_LAUT', 'BUOL', 'TOLITOLI') NULL,
    `aktif` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `user_email_key`(`email`),
    INDEX `user_role_idx`(`role`),
    INDEX `user_kabupatenKota_idx`(`kabupatenKota`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `warga` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `kabupatenKota` ENUM('KOTA_PALU', 'DONGGALA', 'SIGI', 'PARIGI_MOUTONG', 'POSO', 'TOJO_UNA_UNA', 'MOROWALI', 'MOROWALI_UTARA', 'BANGGAI', 'BANGGAI_KEPULAUAN', 'BANGGAI_LAUT', 'BUOL', 'TOLITOLI') NOT NULL,
    `kecamatan` VARCHAR(191) NOT NULL,
    `desaKelurahan` VARCHAR(191) NOT NULL,
    `alamat` VARCHAR(191) NULL,
    `rw` VARCHAR(191) NULL,
    `rt` VARCHAR(191) NULL,
    `desilTerbaru` VARCHAR(191) NULL,
    `nomorKK` VARCHAR(191) NOT NULL,
    `nik` VARCHAR(191) NOT NULL,
    `nama` VARCHAR(191) NOT NULL,
    `jenisKelamin` ENUM('LAKI_LAKI', 'PEREMPUAN') NULL,
    `tanggalLahir` DATETIME(3) NULL,
    `tempatLahir` VARCHAR(191) NULL,
    `statusPerkawinan` VARCHAR(191) NULL,
    `hubunganKeluarga` VARCHAR(191) NULL,
    `keberadaanAnggotaKeluarga` VARCHAR(191) NULL,
    `disabilitas` VARCHAR(191) NULL,
    `keteranganDisabilitas` VARCHAR(191) NULL,
    `pbiJk` VARCHAR(191) NULL,
    `bansosPkh` VARCHAR(191) NULL,
    `bansosSembako` VARCHAR(191) NULL,
    `statusWawancara` ENUM('BELUM_DIWAWANCARA', 'SUDAH_DIWAWANCARA') NOT NULL DEFAULT 'BELUM_DIWAWANCARA',
    `tanggalWawancara` DATETIME(3) NULL,
    `diwawancaraOlehId` INTEGER NULL,
    `klasifikasi` VARCHAR(191) NULL,
    `createdById` INTEGER NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `warga_nik_key`(`nik`),
    INDEX `warga_kabupatenKota_idx`(`kabupatenKota`),
    INDEX `warga_statusWawancara_idx`(`statusWawancara`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `warga` ADD CONSTRAINT `warga_createdById_fkey` FOREIGN KEY (`createdById`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `warga` ADD CONSTRAINT `warga_diwawancaraOlehId_fkey` FOREIGN KEY (`diwawancaraOlehId`) REFERENCES `user`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
