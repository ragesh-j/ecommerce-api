import mongoose from 'mongoose';

export const PRODUCT_STATUS = Object.freeze({
  ACTIVE: 'active',
  INACTIVE: 'inactive',
  OUT_OF_STOCK: 'out_of_stock',
});

const productSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    sku: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },
    description: { type: String, trim: true, maxlength: 2000 },
    price: { type: Number, required: true, min: 0 },
    salePrice: { type: Number, min: 0, default: null },
    // What the customer actually pays. Always derived, never sent by the client.
    finalPrice: { type: Number, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      required: true,
    },
    status: {
      type: String,
      enum: Object.values(PRODUCT_STATUS),
      default: PRODUCT_STATUS.ACTIVE,
    },
  },
  { timestamps: true }
);

// Runs on every save(), including when only `price` changes
productSchema.pre('validate', function () {
  if (this.salePrice != null && this.salePrice > this.price) {
    this.invalidate('salePrice', 'Sale price cannot exceed price');
  }
  this.finalPrice = this.salePrice ?? this.price;
});

productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ category: 1, status: 1, finalPrice: 1 });
productSchema.index({ finalPrice: 1 });

export default mongoose.model('Product', productSchema);