// 単体テスト。2つに分けて流す：
//   worker … サーバー側。Cloudflare の実行環境（workerd）の中で、D1・KV は手元の写しを使う。AI とメールは偽物に差し替える
//   widget … 画面側。ブラウザの代わり（happy-dom）で流す
//   tools  … 試験の道具（AI の試験の採点）
import { cloudflareTest, readD1Migrations } from "@cloudflare/vitest-pool-workers";
import { defineConfig } from "vitest/config";

export default defineConfig(async () => {
  const migrations = await readD1Migrations("./migrations");
  return {
    test: {
      projects: [
        {
          plugins: [
            cloudflareTest({
              miniflare: {
                compatibilityDate: "2026-08-22",
                compatibilityFlags: ["nodejs_compat"],
                d1Databases: ["LOG"],
                kvNamespaces: ["RATE"],
                bindings: { TEST_MIGRATIONS: migrations },
              },
            }),
          ],
          test: { name: "worker", include: ["test/unit/**/*.test.js"], setupFiles: ["test/unit/setup.js"] },
        },
        { test: { name: "widget", include: ["test/widget/**/*.test.js"], environment: "happy-dom" } },
        { test: { name: "tools", include: ["test/tools/**/*.test.js"], environment: "node" } },
      ],
    },
  };
});
