import {
  DeliveryDiscountSelectionStrategy,
  Input,
  CartDeliveryOptionsDiscountsGenerateRunResult,
  CartDeliveryOption,
} from "../generated/api";

type TierConfig = {
  customerTag: string;
  minimumSubtotal: number;
  shippingDiscountPercent: number;
};

type LoyaltyShippingConfig = {
  tiers: TierConfig[];
};

export function cartDeliveryOptionsDiscountsGenerateRun(
  input: Input,
): CartDeliveryOptionsDiscountsGenerateRunResult {
  const firstDeliveryGroup = input.cart.deliveryGroups[0];
  if (!firstDeliveryGroup) {
    return {operations: []};
  }

  const metafield = input.discount.metafield;
  if (!metafield || !metafield.jsonValue) {
    return {operations: []};
  }

  const config = metafield.jsonValue as LoyaltyShippingConfig;
  const tiers = config.tiers ?? [];

  const customer = input.cart.buyerIdentity?.customer;
  const hasTags = customer?.hasTags ?? [];
  const subtotal = input.cart.cost.subtotalAmount.amount;


  const applicableTiers: TierConfig[] = tiers.filter(tier => {
    const tagMatch = hasTags.find(
      (t: { tag: string; hasTag: boolean }) => t.tag === tier.customerTag && t.hasTag === true,
    );
    if (!tagMatch) {
      return false;
    }
    return subtotal >= tier.minimumSubtotal;
  });

  if (applicableTiers.length === 0) {
    return {operations: []};
  }

  const bestTier = applicableTiers.reduce((currentBest, candidate) => {
    if (!currentBest) return candidate;
    return candidate.shippingDiscountPercent > currentBest.shippingDiscountPercent
      ? candidate
      : currentBest;
  });

  const discountPercent = bestTier.shippingDiscountPercent ?? 0;
  if (discountPercent <= 0) {
    return {operations: []};
  }

  const standardShippingOptions = firstDeliveryGroup.deliveryOptions.filter(
    (option: CartDeliveryOption) => option.title === "Standard Shipping",
  );

  if (standardShippingOptions.length === 0) {
    return {operations: []};
  }

  return {
    operations: [
      {
        deliveryDiscountsAdd: {
          candidates: [
            {
              message:
                discountPercent === 100
                  ? "Free Shipping"
                  : `${discountPercent}% off shipping`,
              targets: standardShippingOptions.map((option: CartDeliveryOption) => ({
                deliveryOption: {
                  handle: option.handle,
                },
              })),
              value: {
                percentage: {
                  value: discountPercent,
                },
              },
            },
          ],
          selectionStrategy: DeliveryDiscountSelectionStrategy.All,
        },
      },
    ],
  };
}