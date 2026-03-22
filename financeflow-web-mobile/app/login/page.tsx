import { Suspense } from "react";
import { LoginClient } from "./LoginClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { next?: string };
}) {
  const nextPath = searchParams?.next && searchParams.next.startsWith("/") ? searchParams.next : "/";

  return (
    <Suspense fallback={<div className="card mx-auto mt-6 max-w-md text-sm text-slate-400">Carregando login...</div>}>
      <LoginClient nextPath={nextPath} />
    </Suspense>
  );
}
