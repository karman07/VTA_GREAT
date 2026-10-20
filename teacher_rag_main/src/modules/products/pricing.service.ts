import { Injectable } from '@nestjs/common';
import { MakingChargeType } from './dto/create-product.dto';

export interface PricingInput {
  netWeight: number;
  currentGoldRate: number;
  makingChargeType?: MakingChargeType;
  makingChargeRate?: number;
  fixedMakingCharge?: number;
  stonePrice?: number;
  taxPercentage?: number;
  discountPercentage?: number;
  priceOverride?: number;
}

export interface PricingResult {
  goldPrice: number;
  makingCharges: number;
  stonePrice: number;
  subtotal: number;
  tax: number;
  discount: number;
  finalPrice: number;
  priceOverrideApplied: boolean;
}

@Injectable()
export class PricingService {
  calculate(input: PricingInput): PricingResult {
    const {
      netWeight,
      currentGoldRate,
      makingChargeType,
      makingChargeRate = 0,
      fixedMakingCharge = 0,
      stonePrice = 0,
      taxPercentage = 0,
      discountPercentage = 0,
      priceOverride,
    } = input;

    const goldPrice = netWeight * currentGoldRate;

    let makingCharges = 0;
    if (makingChargeType === MakingChargeType.PER_GRAM) {
      makingCharges = netWeight * makingChargeRate;
    } else if (makingChargeType === MakingChargeType.FIXED) {
      makingCharges = fixedMakingCharge;
    }

    const subtotal = goldPrice + makingCharges + stonePrice;
    const tax = (subtotal * taxPercentage) / 100;
    const discount = (subtotal * discountPercentage) / 100;

    const calculated = subtotal + tax - discount;
    const priceOverrideApplied = priceOverride !== undefined && priceOverride > 0;
    const finalPrice = priceOverrideApplied ? priceOverride! : calculated;

    return {
      goldPrice: this.round(goldPrice),
      makingCharges: this.round(makingCharges),
      stonePrice: this.round(stonePrice),
      subtotal: this.round(subtotal),
      tax: this.round(tax),
      discount: this.round(discount),
      finalPrice: this.round(finalPrice),
      priceOverrideApplied,
    };
  }

  private round(value: number): number {
    return Math.round(value * 100) / 100;
  }
}
