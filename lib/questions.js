import { Category } from "@/models/Category";
import { connectDB } from "@/lib/db";

// group mapping — a short mono "code" is used in the UI instead of emoji icons
const GROUP_META = [
  { id: "civil1", code: "C1", label: "Civil Engineering 1", blurb: "Construction planning, estimating & costing, surveying and core civil subjects." },
  { id: "civil2", code: "C2", label: "Civil Engineering 2", blurb: "Building materials, engineering drawing and allied subjects." },
  { id: "nontechnical", code: "NT", label: "Non-Technical / General Studies", blurb: "Computer awareness, Punjab GK, Punjabi grammar and general sections." },
];

export function getGroups() {
  return GROUP_META;
}

export async function loadAllCategories() {
  await connectDB();
  const categories = await Category.find({}).lean();
  return categories;
}

export async function loadAllCategoriesMeta() {
  await connectDB();
  return Category.aggregate([
    {
      $project: {
        id: 1,
        title: 1,
        description: { $ifNull: ["$description", ""] },
        group: { $ifNull: ["$group", "civil1"] },
        subcats: {
          $map: {
            input: { $ifNull: ["$subcats", []] },
            as: "subcat",
            in: {
              name: "$$subcat.name",
              count: { $size: { $ifNull: ["$$subcat.questions", []] } },
            },
          },
        },
      },
    },
  ]);
}

export async function getCategoryById(id) {
  await connectDB();
  const cat = await Category.findOne({ id }).lean();
  return cat || null;
}

export async function saveCategory(category) {
  await connectDB();
  return await Category.findOneAndUpdate(
    { id: category.id },
    { $set: category },
    { upsert: true, new: true }
  ).lean();
}

export async function deleteCategory(id) {
  await connectDB();
  return await Category.findOneAndDelete({ id }).lean();
}
