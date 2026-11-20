import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";

const manifest = JSON.parse(readFileSync("src/system.json", "utf8"));
const entryPoint = readFileSync("src/cpr.js", "utf8");

describe("system document type declarations", () => {
  it.each(["Actor", "Item"])(
    "declares every registered %s data model in the manifest",
    (documentName) => {
      const registered = [
        ...entryPoint.matchAll(
          new RegExp(`CONFIG\\.${documentName}\\.dataModels\\.(\\w+) =`, "g"),
        ),
      ].map((match) => match[1]);
      expect(registered.length).toBeGreaterThan(0);
      expect(
        Object.keys(manifest.documentTypes?.[documentName] ?? {}).sort(),
      ).toEqual(registered.sort());
    },
  );

  it("preserves HTML sanitization for every document subtype", () => {
    const actorHtmlFields = [
      "notes",
      "information.alias",
      "information.description",
      "information.history",
      "information.notes",
      "lifepath.aboutPeople",
      "lifepath.affections",
      "lifepath.childhoodEnvironment",
      "lifepath.clothingStyle",
      "lifepath.culturalOrigin",
      "lifepath.enemies",
      "lifepath.familyBackground",
      "lifepath.familyCrisis",
      "lifepath.friends",
      "lifepath.hairStyle",
      "lifepath.lifeGoals",
      "lifepath.personality",
      "lifepath.roleLifepath",
      "lifepath.tragicLoveAffairs",
      "lifepath.valueMost",
      "lifepath.valuedPerson",
      "lifepath.valuedPossession",
      "lifestyle.fashion.description",
    ];
    expect(manifest.documentTypes).toBeDefined();
    for (const declaration of Object.values(manifest.documentTypes.Actor)) {
      expect(declaration.htmlFields).toEqual(actorHtmlFields);
    }
    for (const declaration of Object.values(manifest.documentTypes.Item)) {
      expect(declaration.htmlFields).toEqual(["description.value"]);
    }
  });

  it("does not ship a deprecated system template", () => {
    expect(existsSync("src/template.json")).toBe(false);
  });
});
