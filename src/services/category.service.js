import Category from '../models/Category.js';
import Product from '../models/Product.js';
import ApiError from '../utils/ApiError.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const COLLATION = { locale: 'en', strength: 2 };

const getParentOrThrow = async (parentId) => {
  const parent = await Category.findById(parentId);
  if (!parent) throw ApiError.notFound('Parent category not found');
  return parent;
};

const assertUniqueName = async (parentId, name, excludeId) => {
  const filter = { parent: parentId ?? null, name };
  if (excludeId) filter._id = { $ne: excludeId };
  if (await Category.exists(filter).collation(COLLATION)) {
    throw ApiError.conflict('A category with this name already exists under the same parent');
  }
};

// Rewrites `ancestors` of every descendant when a category is moved
const moveSubtree = async (category, newAncestors) => {
  const descendants = await Category.find({ ancestors: category._id })
    .select('ancestors')
    .lean();

  const ops = descendants.map((d) => {
    const idx = d.ancestors.findIndex((a) => a.equals(category._id));
    return {
      updateOne: {
        filter: { _id: d._id },
        update: {
          $set: {
            ancestors: [...newAncestors, category._id, ...d.ancestors.slice(idx + 1)],
          },
        },
      },
    };
  });

  if (ops.length) await Category.bulkWrite(ops);
};

// ---------- Admin ----------

export const createCategory = async ({ name, description, parent = null, isActive = true }) => {
  let ancestors = [];

  if (parent) {
    const parentDoc = await getParentOrThrow(parent);
    if (!parentDoc.isActive && isActive) {
      throw ApiError.badRequest('Cannot create an active category under an inactive parent');
    }
    ancestors = [...parentDoc.ancestors, parentDoc._id];
  }

  await assertUniqueName(parent, name);
  return Category.create({ name, description, parent, ancestors, isActive });
};

export const updateCategory = async (id, data) => {
  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');

  const parentChanged =
    data.parent !== undefined && String(data.parent ?? '') !== String(category.parent ?? '');
  const nextParentId = parentChanged ? data.parent : category.parent;
  const nextName = data.name ?? category.name;
  const nextActive = data.isActive ?? category.isActive;

  const parentDoc = nextParentId ? await getParentOrThrow(nextParentId) : null;

  if (parentChanged && parentDoc) {
    if (parentDoc._id.equals(category._id)) {
      throw ApiError.badRequest('A category cannot be its own parent');
    }
    // New parent sits inside this category's own subtree -> circular
    if (parentDoc.ancestors.some((a) => a.equals(category._id))) {
      throw ApiError.badRequest('Invalid parent: a category cannot be moved under its own descendant');
    }
  }

  if (nextActive && parentDoc && !parentDoc.isActive) {
    throw ApiError.badRequest('Cannot have an active category under an inactive parent');
  }

  if (data.name !== undefined || parentChanged) {
    await assertUniqueName(nextParentId, nextName, category._id);
  }

  if (parentChanged) {
    const newAncestors = parentDoc ? [...parentDoc.ancestors, parentDoc._id] : [];
    await moveSubtree(category, newAncestors);
    category.parent = nextParentId;
    category.ancestors = newAncestors;
  }

  if (data.name !== undefined) category.name = data.name;
  if (data.description !== undefined) category.description = data.description;

  // Deactivating a category also deactivates its whole subtree
  if (data.isActive === false && category.isActive) {
    await Category.updateMany({ ancestors: category._id }, { isActive: false });
  }
  if (data.isActive !== undefined) category.isActive = data.isActive;

  await category.save();
  return category;
};

export const deleteCategory = async (id) => {
  const category = await Category.findById(id);
  if (!category) throw ApiError.notFound('Category not found');

  if (await Category.exists({ parent: id })) {
    throw ApiError.conflict('Category has sub-categories. Delete or move them first');
  }
 
  if (await Product.exists({ category: id })) {
    throw ApiError.conflict('Category has products. Move or delete them first');
  }

  await category.deleteOne();
};

export const listCategories = async ({ page, limit, parent, isActive, search }) => {
  const filter = {};
  if (parent === 'null') filter.parent = null;
  else if (parent) filter.parent = parent;
  if (isActive !== undefined) filter.isActive = isActive;
  if (search) filter.name = new RegExp(escapeRegex(search), 'i');

  const [categories, total] = await Promise.all([
    Category.find(filter)
      .sort({ name: 1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Category.countDocuments(filter),
  ]);

  return {
    categories,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getCategoryById = async (id) => {
  const category = await Category.findById(id).populate('ancestors', 'name');
  if (!category) throw ApiError.notFound('Category not found');
  const children = await Category.find({ parent: id }).sort({ name: 1 });
  return { category, children };
};

// ---------- Public ----------

export const getCategoryTree = async ({ includeInactive = false } = {}) => {
  const filter = includeInactive ? {} : { isActive: true };
  const categories = await Category.find(filter)
    .select('name description parent isActive')
    .sort({ name: 1 })
    .lean();

  // One query + one pass: O(n), any depth
  const nodes = new Map(categories.map((c) => [String(c._id), { ...c, children: [] }]));
  const roots = [];
  for (const node of nodes.values()) {
    if (!node.parent) roots.push(node);
    else nodes.get(String(node.parent))?.children.push(node);
  }
  return roots;
};

// Reusable in the product module: category + all its sub-categories
export const getCategoryWithDescendantIds = async (id) => {
  const descendants = await Category.find({ ancestors: id }).select('_id').lean();
  return [id, ...descendants.map((d) => d._id)];
};