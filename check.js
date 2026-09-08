const fs = require("fs");
const path = require("path");
const manifest = require("./manifest.json");

// Корректные пути из manifest (нормализованные)
const validPaths = new Set(
  manifest.records.map((r) => path.join(__dirname, r.outPath).split(path.sep).join("/"))
);

function walk(dir) {
  const out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const allFiles = walk(path.join(__dirname, "videos")).map((p) => p.split(path.sep).join("/"));
const trash = allFiles.filter((f) => !validPaths.has(f));

console.log("═══ ПОИСК МУСОРНЫХ ФАЙЛОВ ═══");
console.log("Всего mp4 в videos/:", allFiles.length);
console.log("Из manifest (правильных):", allFiles.length - trash.length);
console.log("Мусорных (не из manifest):", trash.length);
console.log("");
if (trash.length) {
  const trashBytes = trash.reduce((s, f) => s + fs.statSync(f).size, 0);
  console.log("Мусорные файлы:");
  trash.forEach((f) => {
    const rel = path.relative(__dirname, f);
    console.log("  " + rel + " (" + Math.round(fs.statSync(f).size / 1048576) + " MB)");
  });
  console.log("");
  console.log("Будет освобождено: " + (trashBytes / 1073741824).toFixed(2) + " GB");

  // Удаляем мусор
  const doDelete = process.argv.includes("--delete");
  if (doDelete) {
    trash.forEach((f) => fs.unlinkSync(f));
    console.log("\n✓ Мусор удалён.");
  } else {
    console.log("\n(Флаг --delete чтобы удалить. Сейчас только показано.)");
  }
}
