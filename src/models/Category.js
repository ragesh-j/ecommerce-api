import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
    description: { type: String, trim: true, maxlength: 500 },
    parent: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Category',
      default: null,
    },
    ancestors: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Category' }],
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Same name allowed under different parents, not under the same parent (case-insensitive)
categorySchema.index(
  { parent: 1, name: 1 },
  { unique: true, collation: { locale: 'en', strength: 2 } }
);
// Fast "all descendants of X" lookups
categorySchema.index({ ancestors: 1 });

categorySchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Category', categorySchema);