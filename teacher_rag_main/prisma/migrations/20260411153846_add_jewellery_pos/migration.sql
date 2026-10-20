-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('men', 'women', 'unisex');

-- CreateEnum
CREATE TYPE "Occasion" AS ENUM ('wedding', 'daily', 'party', 'festival', 'office', 'other');

-- CreateEnum
CREATE TYPE "ProductStatus" AS ENUM ('active', 'inactive');

-- CreateEnum
CREATE TYPE "MetalType" AS ENUM ('gold', 'silver', 'platinum');

-- CreateEnum
CREATE TYPE "Purity" AS ENUM ('K18', 'K22', 'K24');

-- CreateEnum
CREATE TYPE "MetalColor" AS ENUM ('yellow', 'white', 'rose');

-- CreateEnum
CREATE TYPE "MakingChargeType" AS ENUM ('per_gram', 'fixed');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('available', 'sold', 'reserved', 'damaged', 'returned');

-- CreateEnum
CREATE TYPE "ItemLocation" AS ENUM ('store', 'warehouse');

-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'manager';

-- CreateTable
CREATE TABLE "categories" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "categoryId" INTEGER NOT NULL,
    "description" TEXT,
    "designCode" TEXT,
    "brand" TEXT,
    "collectionName" TEXT,
    "gender" "Gender",
    "occasion" "Occasion",
    "status" "ProductStatus" NOT NULL DEFAULT 'active',
    "barcode" TEXT NOT NULL,
    "metalType" "MetalType",
    "purity" "Purity",
    "metalColor" "MetalColor",
    "hallmarkNumber" TEXT,
    "grossWeight" DECIMAL(10,3),
    "netWeight" DECIMAL(10,3),
    "stoneWeight" DECIMAL(10,3),
    "wastagePercentage" DECIMAL(5,2),
    "hasStones" BOOLEAN NOT NULL DEFAULT false,
    "stoneType" TEXT,
    "stonePrice" DECIMAL(12,2),
    "length" DECIMAL(8,2),
    "width" DECIMAL(8,2),
    "height" DECIMAL(8,2),
    "thickness" DECIMAL(8,2),
    "ringSize" TEXT,
    "makingChargeType" "MakingChargeType",
    "makingChargeRate" DECIMAL(10,2),
    "fixedMakingCharge" DECIMAL(10,2),
    "wastageChargePercentage" DECIMAL(5,2),
    "taxPercentage" DECIMAL(5,2),
    "discountPercentage" DECIMAL(5,2),
    "priceOverride" DECIMAL(12,2),
    "imageUrl" TEXT,
    "thumbnailUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdBy" TEXT,
    "updatedBy" TEXT,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_items" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "uniqueItemCode" TEXT NOT NULL,
    "barcode" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "location" "ItemLocation" NOT NULL DEFAULT 'store',
    "status" "ItemStatus" NOT NULL DEFAULT 'available',
    "grossWeight" DECIMAL(10,3),
    "netWeight" DECIMAL(10,3),
    "stoneWeight" DECIMAL(10,3),
    "purchasePrice" DECIMAL(12,2),
    "sellingPrice" DECIMAL(12,2),
    "goldRateAtPurchase" DECIMAL(10,2),
    "supplierId" TEXT,
    "purchaseDate" TIMESTAMP(3),
    "invoiceNumber" TEXT,
    "soldAt" TIMESTAMP(3),
    "reservedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "inventory_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_adjustments" (
    "id" SERIAL NOT NULL,
    "inventoryItemId" INTEGER NOT NULL,
    "change" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "performedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "categories_name_key" ON "categories"("name");

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_barcode_key" ON "products"("barcode");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_uniqueItemCode_key" ON "inventory_items"("uniqueItemCode");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_items_barcode_key" ON "inventory_items"("barcode");

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_items" ADD CONSTRAINT "inventory_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "inventory_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
