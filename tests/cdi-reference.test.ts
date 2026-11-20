import { afterEach, describe, expect, it, vi } from "vitest";
import { parseMonthlyCdiSeries, resolveMonthlyCdiHistory } from "../lib/cdi-reference";

// Valores fictícios no formato da série 4391 do BCB.
const payload = [
  { data: "01/12/2030", valor: "0.90" },
  { data: "01/01/2031", valor: "1.10" },
  { data: "01/02/2031", valor: "0,95" },
  { data: "01/03/2031", valor: "abc" },
];

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("cdi-reference", () => {
  it("lê só os meses do ano pedido, aceitando vírgula decimal", () => {
    const result = parseMonthlyCdiSeries(payload, 2031);
    expect(Array.from(result.entries())).toEqual([
      [1, 1.1],
      [2, 0.95],
    ]);
    expect(parseMonthlyCdiSeries(null, 2031).size).toBe(0);
  });

  it("tenta de novo quando o BCB falha uma vez", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValueOnce(new Error("rede"))
      .mockResolvedValueOnce(new Response(JSON.stringify(payload)));
    const result = await resolveMonthlyCdiHistory(2031);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(result.get(1)).toBe(1.1);
  });

  it("com o BCB fora do ar, mantém o último CDI obtido", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(new Response(JSON.stringify([{ data: "01/01/2032", valor: "1.20" }])));
    expect((await resolveMonthlyCdiHistory(2032)).get(1)).toBe(1.2);

    // Passado o cache de sucesso, o BCB falha nas duas tentativas.
    vi.useFakeTimers({ now: Date.now() + 7 * 60 * 60 * 1000 });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fora do ar"));
    expect((await resolveMonthlyCdiHistory(2032)).get(1)).toBe(1.2);
  });

  it("sem valor anterior, devolve vazio", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("fora do ar"));
    expect((await resolveMonthlyCdiHistory(2033)).size).toBe(0);
  });
});
