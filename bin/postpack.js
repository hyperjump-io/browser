import { readdir, rm } from "node:fs/promises";
import { join } from "node:path";


for (const file of await readdir("src", { recursive: true, withFileTypes: true })) {
  if (file.name.endsWith(".d.ts.map")) {
    await rm(join(file.parentPath, file.name));
    await rm(join(file.parentPath, file.name.slice(0, -4)));
  }
}
