import { WorkflowProvider } from "@/state/workflowStore";
import { AppShell } from "@/components/layout/AppShell";

export default function Home() {
  return (
    <WorkflowProvider>
      <AppShell />
    </WorkflowProvider>
  );
}
