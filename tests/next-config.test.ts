import { describe, expect, it } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import config from "../next.config";

/*
 * Files a server route needs that the build can't find by following imports, such as the serverless
 * Chromium that draws bill PDFs on Vercel. A route is named by a glob, and in a glob "[id]" means one
 * letter, i or d: with "/api/invoices/[id]/pdf" the browser files never went with the PDF route, and every
 * bill PDF on the live site failed with "The PDF couldn't be made just now".
 */
describe("files traced into server routes", () => {
  const includes = config.outputFileTracingIncludes ?? {};

  it("names routes with wildcards, never with a [segment] the glob would read as a set of letters", () => {
    for (const route of Object.keys(includes)) expect(route, route).not.toMatch(/[[\]]/);
  });

  it("sends the serverless Chromium's browser files with the bill PDF route", () => {
    const files = includes["/api/invoices/*/pdf"];
    expect(files).toEqual(["./node_modules/@sparticuz/chromium/bin/**"]);
    // what @sparticuz/chromium unpacks on Vercel: the browser, its fonts and graphics, and Amazon Linux's libraries
    for (const archive of ["chromium.br", "fonts.tar.br", "swiftshader.tar.br", "al2023.tar.br"])
      expect(existsSync(join("node_modules/@sparticuz/chromium/bin", archive)), archive).toBe(true);
    // and those packages load from node_modules at run time, where the files above sit beside them
    expect(config.serverExternalPackages).toEqual(expect.arrayContaining(["playwright-core", "@sparticuz/chromium"]));
  });
});
