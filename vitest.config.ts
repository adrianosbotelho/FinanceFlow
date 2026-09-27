import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // Datas e dias úteis dependem do fuso; os testes fixam o horário de Brasília.
    env: { TZ: "America/Sao_Paulo" },
  },
});
