import { ImportPageClient } from "../../components/import/ImportPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function ImportPage() {
  return <ImportPageClient />;
}
