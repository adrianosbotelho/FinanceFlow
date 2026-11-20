import { SettingsPageClient } from "../../components/settings/SettingsPageClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function SettingsPage() {
  return <SettingsPageClient />;
}
