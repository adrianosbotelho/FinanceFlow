import { NextRequest, NextResponse } from "next/server";
import { rejectUntrustedOrigin } from "@/lib/origin-guard";
import { DEVICE_COOKIE_NAME, readDeviceToken } from "@/lib/device-token";
import { isTwoFactorEnabled, listTrustedDevices, revokeTrustedDevice } from "@/lib/trusted-devices";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function currentDeviceId(req: NextRequest): string | null {
  return readDeviceToken(req.cookies.get(DEVICE_COOKIE_NAME)?.value, process.env.AUTH_SESSION_SECRET ?? "", Date.now());
}

// GET: aparelhos confiáveis ativos (o atual vem marcado).
export async function GET(req: NextRequest) {
  try {
    const current = currentDeviceId(req);
    const devices = await listTrustedDevices();
    return NextResponse.json(
      {
        twoFactorEnabled: isTwoFactorEnabled(),
        devices: devices.map((device) => ({ ...device, current: device.id === current })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("[FinanceFlow mobile] Falha ao listar aparelhos.", err);
    return NextResponse.json({ error: "Não foi possível carregar os aparelhos." }, { status: 500 });
  }
}

// DELETE ?id=: revoga o aparelho (o próximo login nele volta a pedir o código).
export async function DELETE(req: NextRequest) {
  const originError = rejectUntrustedOrigin(req);
  if (originError) return originError;
  const id = new URL(req.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ error: "Aparelho inválido." }, { status: 400 });
  }
  try {
    await revokeTrustedDevice(id);
  } catch (err) {
    console.error("[FinanceFlow mobile] Falha ao revogar aparelho.", err);
    return NextResponse.json({ error: "Não foi possível revogar o aparelho." }, { status: 500 });
  }
  const res = NextResponse.json({ ok: true });
  if (id === currentDeviceId(req)) {
    res.cookies.set({ name: DEVICE_COOKIE_NAME, value: "", path: "/", maxAge: 0 });
  }
  return res;
}
