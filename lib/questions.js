import fs from "fs";
import path from "path";

const DATA_ROOT = path.join(process.cwd(), "data");

// icon & group mapping — keep same as original app but fix missing
const GROUP_META = [
  { id: "civil1", label: "Civil Engineering 1", icon: "🏗️", blurb: "Construction planning, estimating & costing, surveying and core civil subjects." },
  { id: "civil2", label: "Civil Engineering 2", icon: "🧱", blurb: "Building materials, engineering drawing and allied subjects." },
  { id: "nontechnical", label: "Non-Technical / General Studies", icon: "📘", blurb: "Computer awareness, Punjab GK, Punjabi grammar and general sections." },
];

const ICON_MAP = {
  "cpm": "📊",
  "ecv": "🧮",
  "building-construction": "🏢",
  "materials": "🧱",
  "sur": "📏",
  "railway-engineering": "🚉",
  "highway-engineering": "🛣️",
  "irrigation-engineering": "🏞️",
  "concrete-technology": "🦺",
  "sewage-pollution": "🚽",
  "water_supply": "🚿",
  "hyd": "💧",
  "rcc-complete": "🏗️",
  "steel_design": "🌉",
  "fluid_mechanics": "🌊",
  "geotech2": "🌲",
  "cmrm": "🏚️",
  "engg_drawing_ch01": "📐",
  "computer_awareness": "💻",
  "punjab-gk": "📚",
  "punjabi-grammar": "🎒",
};

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

export function getGroups() {
  return GROUP_META;
}

export function loadAllCategories() {
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
          icon: raw.icon || ICON_MAP[raw.id] || "📄",
          group: raw.group || GROUP_MAP[raw.id] || folderToGroup(folder),
          _file: path.join(folder, file),
        });
      } catch (e) {
        console.error("Failed to load", full, e.message);
      }
    }
  }
  return cats;
}

function folderToGroup(folder) {
  if (folder.includes("civil-engineering-1")) return "civil1";
  if (folder.includes("civil-engineering-2")) return "civil2";
  return "nontechnical";
}

export function getCategoryById(id) {
  return loadAllCategories().find(c => c.id === id) || null;
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
    icon: category.icon,
  };
  fs.writeFileSync(filePath, JSON.stringify(toSave, null, 2));
  return filePath;
}

export function deleteCategoryFile(id) {
  const cat = getCategoryById(id);
  if (!cat) return false;
  const fp = path.join(DATA_ROOT, cat._file);
  if (fs.existsSync(fp)) fs.unlinkSync(fp);
  return true;
}
