import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductDto } from './dto/query-product.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateProductDto, userId: string) {
    await this.ensureUnique(dto.sku, dto.barcode);

    return this.prisma.product.create({
      data: {
        name: dto.name,
        sku: dto.sku,
        categoryId: dto.categoryId,
        description: dto.description,
        designCode: dto.designCode,
        brand: dto.brand,
        collectionName: dto.collectionName,
        gender: dto.gender as any,
        occasion: dto.occasion as any,
        status: dto.status as any,
        barcode: dto.barcode,
        metalType: dto.metalType as any,
        purity: dto.purity as any,
        metalColor: dto.metalColor as any,
        hallmarkNumber: dto.hallmarkNumber,
        grossWeight: dto.grossWeight,
        netWeight: dto.netWeight,
        stoneWeight: dto.stoneWeight,
        wastagePercentage: dto.wastagePercentage,
        hasStones: dto.hasStones ?? false,
        stoneType: dto.stoneType,
        stonePrice: dto.stonePrice,
        length: dto.length,
        width: dto.width,
        height: dto.height,
        thickness: dto.thickness,
        ringSize: dto.ringSize,
        makingChargeType: dto.makingChargeType as any,
        makingChargeRate: dto.makingChargeRate,
        fixedMakingCharge: dto.fixedMakingCharge,
        wastageChargePercentage: dto.wastageChargePercentage,
        taxPercentage: dto.taxPercentage,
        discountPercentage: dto.discountPercentage,
        priceOverride: dto.priceOverride,
        imageUrl: dto.imageUrl,
        thumbnailUrl: dto.thumbnailUrl,
        createdBy: userId,
        updatedBy: userId,
      },
      include: { category: true },
    });
  }

  async findAll(query: QueryProductDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.ProductWhereInput = {
      deletedAt: null,
      ...(query.categoryId && { categoryId: query.categoryId }),
      ...(query.metalType && { metalType: query.metalType as any }),
      ...(query.search && {
        OR: [
          { name: { contains: query.search, mode: 'insensitive' } },
          { sku: { contains: query.search, mode: 'insensitive' } },
          { barcode: { contains: query.search, mode: 'insensitive' } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take: limit,
        include: { category: true },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(id: number) {
    const product = await this.prisma.product.findFirst({
      where: { id, deletedAt: null },
      include: {
        category: true,
        _count: { select: { inventoryItems: true } },
      },
    });

    if (!product) throw new NotFoundException(`Product #${id} not found`);
    return product;
  }

  async update(id: number, dto: UpdateProductDto, userId: string) {
    await this.findOne(id);

    if (dto.sku || dto.barcode) {
      await this.ensureUnique(dto.sku, dto.barcode, id);
    }

    return this.prisma.product.update({
      where: { id },
      data: {
        ...dto,
        gender: dto.gender as any,
        occasion: dto.occasion as any,
        status: dto.status as any,
        metalType: dto.metalType as any,
        purity: dto.purity as any,
        metalColor: dto.metalColor as any,
        makingChargeType: dto.makingChargeType as any,
        updatedBy: userId,
      },
      include: { category: true },
    });
  }

  async softDelete(id: number) {
    await this.findOne(id);
    return this.prisma.product.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async ensureUnique(
    sku?: string,
    barcode?: string,
    excludeId?: number,
  ) {
    if (sku) {
      const skuExists = await this.prisma.product.findFirst({
        where: { sku, deletedAt: null, NOT: excludeId ? { id: excludeId } : undefined },
      });
      if (skuExists) throw new ConflictException(`SKU "${sku}" is already taken`);
    }

    if (barcode) {
      const bcExists = await this.prisma.product.findFirst({
        where: { barcode, deletedAt: null, NOT: excludeId ? { id: excludeId } : undefined },
      });
      if (bcExists) throw new ConflictException(`Barcode "${barcode}" is already taken`);
    }
  }
}
