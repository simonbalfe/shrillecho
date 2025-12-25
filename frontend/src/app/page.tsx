import { AuthGate } from "@/features/auth";
import { Dashboard } from "@/features/dashboard";

export default function Page() {
  return (
    <AuthGate>
      <Dashboard />
    </AuthGate>
  );
}
