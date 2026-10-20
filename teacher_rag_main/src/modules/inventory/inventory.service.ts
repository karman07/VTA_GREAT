import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInventoryItemDto, ItemStatus } from './dto/create-inventory-item.dto';
import { UpdateInventoryStatusDto } from './dto/update-inventory-status.dto';
import { AdjustInventoryDto } from './dto/adjust-inventory.dto';
import { BulkCreateInventoryDto } from './dto/bulk-create-inventory.dto';
import { QueryInventoryDto } from './dto/query-inventory.dto';
import { Prisma } from '@prisma/client';

// Valid status transitions
const ALLOWED_TRANSITIONS: Record<string, string[]> = {
  available: ['reserved', 'sold'],
  reserved: ['sold', 'available'],
  sold: ['returned'],
  returned: ['available'],
  damaged: [],
};

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateInventoryItemDto, userId: string) {
    // Verify product exists
    const product = await this.prisma.product.findFirst({
      where: { id: dto.productId, deletedAt: null },
    });
    if (!product) {
      throw new NotFoundException(`Product #${dto.productId} not found`);
    }

    const barcode = dto.barcode ?? this.generateBarcode();
    const uniqueItemCode = dto.uniqueItemCode ?? this.generateItemCode(product.sku);

    // Ensure barcode uniqueness
    await this.ensureBarcodeUnique(barcode);

    return this.prisma.inventoryItem.create({
      data: {
        productId: dto.productId,
        uniqueItemCode,
        barcode,
        location: dto.location as any ?? 'store',
        status: 'available',
        grossWeight: dto.grossWeight,
        netWeight: dto.netWeight,
        stoneWeight: dto.stoneWeight,
        purchasePrice: dto.purchasePrice,
        sellingPrice: dto.sellingPrice,
        goldRateAtPurchase: dto.goldRateAtPurchase,
        supplierId: dto.supplierId,
        purchaseDate: dto.purchaseDate ? new Date(dto.purchaseDate) : undefined,
        invoiceNumber: dto.invoiceNumber,
      },
      include: { product: true },
    });
  }

  async findAll(query: QueryInventoryDto) {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.InventoryItemWhereInput = {
      ...(query.productId && { productId: query.productId }),
      ...(query.status && { status: query.status as any }),
      ...(query.location && { location: query.location as any }),
    };

    const [data, total] = await Promise.all([
      this.prisma.inventoryItem.findMany({
        where,
        skip,
        take: limit,
        include: { product: { select: { id: true, name: true, sku: true } } },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.inventoryItem.count({ where }),
    ]);

    return {
      data,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findByBarcode(barcode: string) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { barcode },
      include: { product: { include: { category: true } } },
    });
    if (!item) throw new NotFoundException(`No inventory item with barcode "${barcode}"`);
    return item;
  }

  async findOne(id: number) {
    const item = await this.prisma.inventoryItem.findUnique({
      where: { id },
      include: { product: true },
    });
    if (!item) throw new NotFoundException(`Inventory item #${id} not found`);
    return item;
  }

  async updateStatus(id: number, dto: UpdateInventoryStatusDto) {
    const item = await this.findOne(id);
    const currentStatus = item.status as string;
    const newStatus = dto.status as string;

    const allowed = ALLOWED_TRANSITIONS[currentStatus] ?? [];
    if (!allowed.includes(newStatus)) {
      throw new BadRequestException(
        `Cannot transition from "${currentStatus}" to "${newStatus}". Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const lifecycleFields: Prisma.InventoryItemUpdateInput = {};
    if (newStatus === 'sold') lifecycleFields.soldAt = new Date();
    if (newStatus === 'reserved') lifecycleFields.reservedAt = new Date();
    if (newStatus === 'returned') lifecycleFields.returnedAt = new Date();

    return this.prisma.inventoryItem.update({
      where: { id },
      data: { status: newStatus as any, ...lifecycleFields },
      include: { product: { select: { id: true, name: true, sku: true } } },
    });
  }

  async adjust(dto: AdjustInventoryDto, userId: string) {
    const item = await this.findOne(dto.inventoryItemId);

    const newQty = item.quantity + dto.change;
    if (newQty < 0) {
      throw new BadRequestException('Adjustment would result in negative quantity');
    }

    const [updatedItem, log] = await this.prisma.$transaction([
      this.prisma.inventoryItem.update({
        where: { id: dto.inventoryItemId },
        data: { quantity: newQty },
      }),
      this.prisma.inventoryAdjustment.create({
        data: {
          inventoryItemId: dto.inventoryItemId,
          change: dto.change,
          reason: dto.reason,
          performedBy: userId,
        },
      }),
    ]);

    return { item: updatedItem, adjustment: log };
  }

  async bulkCreate(dto: BulkCreateInventoryDto, userId: string) {
    const results = await Promise.all(
      dto.items.map((item) => this.create(item, userId)),
    );
    return { created: results.length, items: results };
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private generateBarcode(): string {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 7).toUpperCase();
    return `INV-${ts}-${rand}`;
  }

  private generateItemCode(sku: string): string {
    const ts = Date.now();
    const rand = Math.random().toString(36).substring(2, 5).toUpperCase();
    return `${sku}-${ts}-${rand}`;
  }

  private async ensureBarcodeUnique(barcode: string) {
    const existing = await this.prisma.inventoryItem.findUnique({
      where: { barcode },
    });
    if (existing) {
      throw new ConflictException(`Barcode "${barcode}" is already in use`);
    }
  }
}
