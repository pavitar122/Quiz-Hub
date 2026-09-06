import fs from "fs";
import path from "path";

const DATA_ROOT = path.join(process.cwd(), "data");

// group mapping — a short mono "code" is used in the UI instead of emoji icons
const GROUP_META = [
  { id: "civil1", code: "C1", label: "Civil Engineering 1", blurb: "Construction planning, estimating & costing, surveying and core civil subjects." },
  { id: "civil2", code: "C2", label: "Civil Engineering 2", blurb: "Building materials, engineering drawing and allied subjects." },
  { id: "nontechnical", code: "NT", label: "Non-Technical / General Studies", blurb: "Computer awareness, Punjab GK, Punjabi grammar and general sections." },
];

const GROUP_MAP = {
  "cpm": "civil1",
  "ecv": "civil1",
  "building-construction": "civil1",
  "materials": "civil1",
  "sur": "civil1",
  "railway-engineering": "civil1",
  "highway-engineering": "civil1",
  "irrigation-engineering": "civil1",
  "concrete-technology": "civil1",
  "sewage-pollution": "civil1",
  "water_supply": "civil1",
  "hyd": "civil1",
  "rcc-complete": "civil1",
  "steel_design": "civil1",
  "fluid_mechanics": "civil1",
  "geotech2": "civil1",
  "cmrm": "civil2",
  "engg_drawing_ch01": "civil2",
  "computer_awareness": "nontechnical",
  "punjab-gk": "nontechnical",
  "punjabi-grammar": "nontechnical",
};

let cachedCategories = null;
let categoryMap = null;
let cachedSummaries = null;

export function invalidateCache() {
  cachedCategories = null;
  categoryMap = null;
  cachedSummaries = null;
}

export function getGroups() {
  return GROUP_META;
}

export function loadAllCategories() {
  if (cachedCategories) return cachedCategories;

  const folders = ["civil-engineering-1", "civil-engineering-2", "non-technical"];
  let cats = [];
  for (const folder of folders) {
    const dir = path.join(DATA_ROOT, folder);
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith(".json"));
    for (const file of files) {
      const full = path.join(dir, file);
      try {
        const raw = JSON.parse(fs.readFileSync(full, "utf8"));
        cats.push({
          ...raw,
          group: raw.group || GROUP_MAP[raw.id] || folderToGroup(folder),
          _file: path.join(folder, file),
        });
      } catch (e) {
        console.error("Failed to load", full, e.message);
      }
    }
  }

  cachedCategories = cats;
  categoryMap = new Map(cats.map(c => [c.id, c]));
  return cachedCategories;
}

export function loadCategorySummaries() {
  if (cachedSummaries) return cachedSummaries;
  const cats = loadAllCategories();
  cachedSummaries = cats.map(cat => ({
    id: cat.id,
    title: cat.title,
    description: cat.description || "",
    group: cat.group,
    subcats: (cat.subcats || []).map(sc => ({
      name: sc.name,
      questionCount: sc.questions?.length || 0,
      questions: new Array(sc.questions?.length || 0).fill(null),
    })),
  }));
  return cachedSummaries;
}

function folderToGroup(folder) {
  if (folder.includes("civil-engineering-1")) return "civil1";
  if (folder.includes("civil-engineering-2")) return "civil2";
  return "nontechnical";
}

export function getCategoryById(id) {
  if (!categoryMap) {
    loadAllCategories();
  }
  return categoryMap.get(id) || null;
}

export function saveCategory(category) {
  // find file path for id
  const cats = loadAllCategories();
  const existing = cats.find(c => c.id === category.id);
  let filePath;
  if (existing) {
    filePath = path.join(DATA_ROOT, existing._file);
  } else {
    // decide folder by group
    let folder = "civil-engineering-1";
    if (category.group === "civil2") folder = "civil-engineering-2";
    if (category.group === "nontechnical") folder = "non-technical";
    const safe = category.id.replace(/[^a-z0-9-_]/gi, "-").toLowerCase();
    filePath = path.join(DATA_ROOT, folder, `${safe}.json`);
  }
  const toSave = {
    id: category.id,
    title: category.title,
    description: category.description || "",
    subcats: category.subcats,
    group: category.group,
  };
  fs.writeFileSync(filePath, JSON.stringify(toSave, null, 2));
  invalidateCache();
  return filePath;
}

export function deleteCategoryFile(id) {
  const cat = getCategoryById(id);
  if (!cat) return false;
  const fp = path.join(DATA_ROOT, cat._file);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  invalidateCache();
  return true;
}
